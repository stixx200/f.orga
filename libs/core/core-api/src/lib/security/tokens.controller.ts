import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  Param,
  Post,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  API_TOKEN_MAX_DAYS,
  API_TOKEN_REMINDER_DAYS,
  type ApiToken as ApiTokenDto,
  ApiTokenInput,
  type CreatedApiToken,
} from '@forga/core-contracts';
import { v7 as uuidv7 } from 'uuid';
import { Audit } from '../audit/audit.js';
import { ZodPipe } from '../zod.pipe.js';
import { API_TOKEN_PREFIX, AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser, RequirePermissions } from './decorators.js';
import { generateSecret, hashSecret } from './password.js';
import { PermissionRegistry } from './permission-registry.js';
import { ApiToken, User } from './security.entities.js';
import { addBerlinDays, berlinDate, berlinDayEnd } from '../imports/parse.js';
import { DeadlineRegistry, type DeadlineInput } from '../tasks/deadline-registry.js';
import { validAddressEntry } from './addresses.js';

/** Reminds those who manage API tokens of tokens that end soon (or have no end, from before it was required). */
@Injectable()
export class TokenDeadlines implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly deadlines: DeadlineRegistry,
  ) {}

  onModuleInit(): void {
    this.deadlines.register({ module: 'core', deadlines: (asOf) => this.due(asOf) });
  }

  async due(asOf: string): Promise<DeadlineInput[]> {
    const tokens = await this.em.fork().find(ApiToken, { revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gte: berlinDayEnd(asOf) } }] });
    return tokens.map((token) => ({
      id: `api-token-expiry:${token.id}`,
      kind: 'api-token-expiry',
      title: token.expiresAt
        ? { de: `API-Token „${token.name}“ läuft ab – neu ausstellen oder auslaufen lassen`, en: `API token "${token.name}" expires – issue a new one or let it end` }
        : { de: `API-Token „${token.name}“ ohne Ablauf – neu mit Ablaufdatum ausstellen`, en: `API token "${token.name}" without expiry – issue it again with an expiry date` },
      subject: { type: 'core.api-token', id: token.id, label: token.name },
      dueOn: token.expiresAt ? berlinDate(token.expiresAt) : asOf,
      leadDays: API_TOKEN_REMINDER_DAYS,
      departmentIds: [],
      permission: 'core.tokens.manage',
      // The task names only the token, nothing sensitive.
      held: true,
      to: '/admin/tokens',
    }));
  }
}

type ParsedTokenInput = ReturnType<typeof ApiTokenInput.parse>;

function toTokenDto(token: ApiToken, registry: PermissionRegistry): ApiTokenDto {
  return {
    id: token.id,
    name: token.name,
    recipient: token.recipient ?? '',
    purpose: token.purpose ?? '',
    allowedAddresses: token.allowedAddresses ?? [],
    scopes: token.scopes,
    prefix: token.prefix,
    createdAt: token.createdAt.toISOString(),
    expiresAt: token.expiresAt?.toISOString() ?? null,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    inactiveScopes: token.scopes.filter((s) => registry.all.some((p) => p.id === s && registry.tokenForbidden(p))),
  };
}

@Controller('core/tokens')
@RequirePermissions('core.tokens.manage')
export class TokensController {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: PermissionRegistry,
    private readonly audit: Audit,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list(): Promise<ApiTokenDto[]> {
    const tokens = await this.em.fork().find(ApiToken, {}, { orderBy: { createdAt: 'desc' } });
    return tokens.map((t) => toTokenDto(t, this.registry));
  }

  /**
   * Every token gets its own technical user, so the history shows which system changed a record.
   * The plain token is returned exactly once.
   */
  @Post()
  async create(@Body(new ZodPipe(ApiTokenInput)) input: ParsedTokenInput, @CurrentUser() current: AuthenticatedUser): Promise<CreatedApiToken> {
    const unknown = input.scopes.filter((s) => !this.registry.all.some((p) => p.id === s));
    if (unknown.length) throw new BadRequestException({ code: 'tokens.unknownScopes', scopes: unknown });
    // Administration (users, roles, settings, tokens) never runs through a token.
    const administrative = input.scopes.filter((s) => s.startsWith('core.'));
    if (administrative.length) throw new BadRequestException({ code: 'tokens.coreScopes', scopes: administrative });
    // Privileged permissions (e.g. backups: the whole data) never run through a token either.
    const privileged = input.scopes.filter((s) => this.registry.all.some((p) => p.id === s && p.privileged));
    if (privileged.length) throw new BadRequestException({ code: 'tokens.privilegedScopes', scopes: privileged });
    // Sensitive data need the second factor (step-up), which a token cannot show.
    const stepUp = input.scopes.filter((s) => this.registry.all.some((p) => p.id === s && this.registry.tokenForbidden(p)));
    if (stepUp.length) throw new BadRequestException({ code: 'tokens.stepUpScope', scopes: stepUp });
    // A token can do at most what its creator can (brigade-wide), so it cannot be used to widen one's permissions.
    const wider = await this.auth.widerThanActor(current, [{ role: { permissions: input.scopes, permissionsAllDepartments: [] }, departmentId: null }]);
    if (wider.length) throw new ForbiddenException({ code: 'tokens.scopesWider', scopes: wider });
    // A token ends after at most two years (L23); afterwards a new one is issued and the recipient checked again.
    const today = berlinDate();
    if (input.expiresOn < today) throw new BadRequestException({ code: 'tokens.expiryInPast' });
    if (input.expiresOn > berlinDate(addBerlinDays(new Date(), API_TOKEN_MAX_DAYS))) throw new BadRequestException({ code: 'tokens.expiryTooLate', days: API_TOKEN_MAX_DAYS });
    const invalid = input.allowedAddresses.filter((entry) => !validAddressEntry(entry));
    if (invalid.length) throw new BadRequestException({ code: 'tokens.addressInvalid', addresses: invalid });

    const em = this.em.fork();
    const user = em.create(User, {
      username: `api-token-${uuidv7()}`,
      displayName: input.name,
      technical: true,
    });
    const plain = `${API_TOKEN_PREFIX}${generateSecret()}`;
    const token = em.create(ApiToken, {
      name: input.name,
      recipient: input.recipient,
      purpose: input.purpose,
      allowedAddresses: input.allowedAddresses,
      user,
      scopes: input.scopes,
      prefix: plain.slice(0, 12),
      hash: hashSecret(plain),
      createdAt: new Date(),
      expiresAt: berlinDayEnd(input.expiresOn),
    });
    await em.flush();
    await this.audit.log('tokens.created', { tokenId: token.id, scopes: token.scopes, recipient: token.recipient, expiresOn: input.expiresOn, allowedAddresses: token.allowedAddresses });
    return { ...toTokenDto(token, this.registry), token: plain };
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const token = await em.findOne(ApiToken, id, { populate: ['user'] });
    if (!token) throw new NotFoundException();
    token.revokedAt ??= new Date();
    token.user.active = false;
    await em.flush();
    await this.audit.log('tokens.revoked', { tokenId: id });
  }
}
