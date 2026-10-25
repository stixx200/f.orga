import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import type { Response } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { ATTACHMENT_MAX_SIZE, ATTACHMENT_TYPES, type Attachment } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser } from '../security/decorators.js';

export const AttachmentSchema = defineEntity({
  name: 'Attachment',
  schema: 'core',
  tableName: 'attachment',
  indexes: [{ properties: ['ownerType', 'ownerId'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** Record of a module; no foreign key across modules. */
    ownerType: p.string(),
    ownerId: p.string(),
    fileName: p.string(),
    contentType: p.string(),
    size: p.integer(),
    data: p.blob().lazy(),
    createdBy: p.string(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});
export class AttachmentEntity extends AttachmentSchema.class {}
AttachmentSchema.setClass(AttachmentEntity);

/** Who may see (`read`) and add or remove (`write`) the attachments of a record. */
export interface AttachmentAccess {
  read: (user: AuthenticatedUser, ownerId: string) => Promise<boolean>;
  write: (user: AuthenticatedUser, ownerId: string) => Promise<boolean>;
}

/** The content must match the declared type (magic bytes). */
function matchesType(data: Buffer, type: string): boolean {
  switch (type) {
    case 'image/png':
      return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case 'image/webp':
      return data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'application/pdf':
      return data.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

const toDto = (a: AttachmentEntity): Attachment => ({
  id: a.id,
  ownerType: a.ownerType,
  ownerId: a.ownerId,
  fileName: a.fileName,
  contentType: a.contentType,
  size: a.size,
  createdBy: a.createdBy,
  createdAt: a.createdAt.toISOString(),
});

/**
 * Attachments of module records. Modules register an access check per record type; unknown types are denied.
 * Modules remove the attachments of a record they delete with `removeAll`.
 */
@Injectable()
export class Attachments {
  private readonly access = new Map<string, AttachmentAccess>();

  constructor(private readonly em: EntityManager) {}

  register(ownerType: string, access: AttachmentAccess): void {
    this.access.set(ownerType, access);
  }

  async allowed(user: AuthenticatedUser, ownerType: string, ownerId: string, mode: 'read' | 'write'): Promise<boolean> {
    const access = this.access.get(ownerType);
    return access ? access[mode](user, ownerId) : false;
  }

  async list(ownerType: string, ownerIds: readonly string[]): Promise<Attachment[]> {
    if (!ownerIds.length) return [];
    return (await this.em.fork().find(AttachmentEntity, { ownerType, ownerId: { $in: [...ownerIds] } }, { orderBy: { createdAt: 'asc' } })).map(toDto);
  }

  async removeAll(ownerType: string, ownerId: string): Promise<void> {
    await this.em.fork().nativeDelete(AttachmentEntity, { ownerType, ownerId });
  }
}

@Controller('core/attachments')
export class AttachmentsController {
  constructor(
    private readonly em: EntityManager,
    private readonly attachments: Attachments,
    private readonly audit: Audit,
  ) {}

  private async require(user: AuthenticatedUser, ownerType: string, ownerId: string, mode: 'read' | 'write'): Promise<void> {
    if (!ownerType || !ownerId) throw new BadRequestException({ code: 'validation.failed' });
    // Not readable looks like not existing.
    if (!(await this.attachments.allowed(user, ownerType, ownerId, 'read'))) throw new NotFoundException();
    if (mode === 'write' && !(await this.attachments.allowed(user, ownerType, ownerId, 'write'))) throw new ForbiddenException({ code: 'auth.forbidden' });
  }

  @Get()
  async list(@Query('type') ownerType: string, @Query('id') ownerId: string, @CurrentUser() user: AuthenticatedUser): Promise<Attachment[]> {
    await this.require(user, ownerType, ownerId, 'read');
    return this.attachments.list(ownerType, [ownerId]);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_SIZE } }))
  async upload(
    @Query('type') ownerType: string,
    @Query('id') ownerId: string,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Attachment> {
    await this.require(user, ownerType, ownerId, 'write');
    if (!file) throw new BadRequestException({ code: 'imports.fileMissing' });
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.mimetype) || !matchesType(file.buffer, file.mimetype)) throw new BadRequestException({ code: 'attachments.type' });
    const em = this.em.fork();
    // Browsers send the name as Latin-1; restore UTF-8 umlauts and keep only the base name.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').split(/[\\/]/).pop()!.slice(0, 200) || 'datei';
    const attachment = em.create(AttachmentEntity, { ownerType, ownerId, fileName, contentType: file.mimetype, size: file.buffer.length, data: file.buffer, createdBy: user.displayName });
    await em.flush();
    await this.audit.log('attachments.added', { ownerType, ownerId, fileName, size: file.buffer.length });
    return toDto(attachment);
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const attachment = await this.em.fork().findOne(AttachmentEntity, id, { populate: ['data'] });
    if (!attachment) throw new NotFoundException();
    await this.require(user, attachment.ownerType, attachment.ownerId, 'read');
    res.setHeader('Content-Type', attachment.contentType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, no-cache');
    res.send(Buffer.from(attachment.data));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const attachment = await em.findOne(AttachmentEntity, id);
    if (!attachment) throw new NotFoundException();
    await this.require(user, attachment.ownerType, attachment.ownerId, 'write');
    em.remove(attachment);
    await em.flush();
    await this.audit.log('attachments.removed', { ownerType: attachment.ownerType, ownerId: attachment.ownerId, fileName: attachment.fileName });
  }
}
