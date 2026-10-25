import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
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
import { berlinDayEnd } from '../imports/parse.js';

type ParsedTokenInput = ReturnType<typeof ApiTokenInput.parse>;

function toTokenDto(token: ApiToken): ApiTokenDto {
  return {
    id: token.id,
    name: token.name,
    scopes: token.scopes,
    prefix: token.prefix,
    createdAt: token.createdAt.toISOString(),
    expiresAt: token.expiresAt?.toISOString() ?? null,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
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
    return tokens.map(toTokenDto);
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
    // A token can do at most what its creator can (brigade-wide), so it cannot be used to widen one's permissions.
    const wider = await this.auth.widerThanActor(current, [{ role: { permissions: input.scopes, permissionsAllDepartments: [] }, departmentId: null }]);
    if (wider.length) throw new ForbiddenException({ code: 'tokens.scopesWider', scopes: wider });

    const em = this.em.fork();
    const user = em.create(User, {
      username: `api-token-${uuidv7()}`,
      displayName: input.name,
      technical: true,
    });
    const plain = `${API_TOKEN_PREFIX}${generateSecret()}`;
    const token = em.create(ApiToken, {
      name: input.name,
      user,
      scopes: input.scopes,
      prefix: plain.slice(0, 12),
      hash: hashSecret(plain),
      createdAt: new Date(),
      expiresAt: input.expiresOn ? berlinDayEnd(input.expiresOn) : null,
    });
    await em.flush();
    await this.audit.log('tokens.created', { tokenId: token.id, scopes: token.scopes });
    return { ...toTokenDto(token), token: plain };
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
