import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import type { Response } from 'express';
import { Audit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser, Public, RequirePermissions } from '../security/decorators.js';
import { User } from '../security/security.entities.js';
import { MailService } from '../tasks/mail.service.js';

/** `logo`: coat of arms for header and PDFs; `letterhead`: optional wide header image for PDFs. */
const KEYS = ['logo', 'letterhead'] as const;
type AssetKey = (typeof KEYS)[number];
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** The content must match the declared type (magic bytes); an SVG must be an SVG document. */
function matchesType(data: Buffer, type: string): boolean {
  switch (type) {
    case 'image/png':
      return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case 'image/webp':
      return data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'image/svg+xml':
      return /<svg[\s>]/i.test(data.subarray(0, 4096).toString('utf8'));
    default:
      return false;
  }
}
const MAX_SIZE = 2 * 1024 * 1024;

export const BrigadeAssetSchema = defineEntity({
  name: 'BrigadeAsset',
  schema: 'core',
  tableName: 'brigade_asset',
  properties: {
    key: p.string().primary(),
    contentType: p.string(),
    data: p.blob(),
    updatedAt: p.datetime(),
  },
});
export class BrigadeAsset extends BrigadeAssetSchema.class {}
BrigadeAssetSchema.setClass(BrigadeAsset);

const assetKey = (key: string): AssetKey => {
  if (!KEYS.includes(key as AssetKey)) throw new NotFoundException();
  return key as AssetKey;
};

@Controller('core')
export class BrigadeAssetsController {
  constructor(
    private readonly em: EntityManager,
    private readonly mail: MailService,
    private readonly audit: Audit,
  ) {}

  /** Public, so the login page can show the coat of arms. */
  @Public()
  @Get('assets/:key')
  async get(@Param('key') key: string, @Res() res: Response): Promise<void> {
    const asset = await this.em.fork().findOne(BrigadeAsset, assetKey(key));
    if (!asset) throw new NotFoundException();
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', 'no-cache');
    // Opened directly (not as <img>), an SVG could carry scripts: no sniffing, no scripts, sandboxed.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    res.send(Buffer.from(asset.data));
  }

  @Put('assets/:key')
  @RequirePermissions('core.settings.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async upload(@Param('key') key: string, @UploadedFile() file: { mimetype: string; buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException({ code: 'imports.fileMissing' });
    if (!TYPES.includes(file.mimetype) || !matchesType(file.buffer, file.mimetype)) throw new BadRequestException({ code: 'settings.imageType' });
    const em = this.em.fork();
    const k = assetKey(key);
    const existing = await em.findOne(BrigadeAsset, k);
    if (existing) em.assign(existing, { contentType: file.mimetype, data: file.buffer, updatedAt: new Date() });
    else em.create(BrigadeAsset, { key: k, contentType: file.mimetype, data: file.buffer, updatedAt: new Date() });
    await em.flush();
    await this.audit.log('settings.asset-uploaded', { key: k, size: file.buffer.length });
    return { ok: true };
  }

  @Delete('assets/:key')
  @HttpCode(204)
  @RequirePermissions('core.settings.manage')
  async remove(@Param('key') key: string): Promise<void> {
    await this.em.fork().nativeDelete(BrigadeAsset, { key: assetKey(key) });
    await this.audit.log('settings.asset-removed', { key });
  }

  /** Sends a test e-mail to the current user with the stored SMTP settings. */
  @Post('settings/smtp/test')
  @HttpCode(200)
  @RequirePermissions('core.settings.manage')
  async testMail(@CurrentUser() user: AuthenticatedUser) {
    const stored = await this.em.fork().findOneOrFail(User, user.id);
    if (!stored.email) throw new BadRequestException({ code: 'mail.noRecipient' });
    await this.mail.send({ to: stored.email, subject: 'f.orga: Test-E-Mail', text: 'Der E-Mail-Versand von f.orga funktioniert. / Sending e-mail from f.orga works.' });
    return { to: stored.email };
  }
}

/** The stored coat of arms (or with `key` the letterhead) as data URL, e.g. for PDFs; `null` if none or not usable in PDFs. */
export async function brigadeLogoDataUrl(em: EntityManager, key: 'logo' | 'letterhead' = 'logo'): Promise<string | null> {
  const asset = await em.fork().findOne(BrigadeAsset, key);
  // pdfmake draws PNG, JPEG and SVG; WebP cannot be used in documents.
  if (!asset || asset.contentType === 'image/webp') return null;
  return `data:${asset.contentType};base64,${Buffer.from(asset.data).toString('base64')}`;
}
