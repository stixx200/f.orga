import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { type ImportResult, type TransferArchiveInfo, type TransferDataset, TransferRequest, type TransferUpload } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser } from '../security/decorators.js';
import { ZodPipe } from '../zod.pipe.js';
import { ImportRegistry, type TransferRow } from './import-registry.js';
import { IMPORT_EXPIRY_MS } from './imports.js';
import { TransferArchive, TransferError } from './transfer-archive.js';

const MAX_FILES = 40;
const MAX_SIZE = 200 * 1024 * 1024;

/** The rows read from uploaded transfer archives, per import profile; removed after 24 hours. */
export const ImportTransferSchema = defineEntity({
  name: 'ImportTransferEntity',
  schema: 'core',
  tableName: 'import_transfer',
  properties: {
    id: p.uuid().primary(),
    userId: p.string(),
    archives: p.json<TransferArchiveInfo[]>(),
    /** Profile ID → rows, in import order. */
    datasets: p.json<{ profile: string; rows: TransferRow[] }[]>(),
    createdAt: p.datetime(),
  },
});
export class ImportTransferEntity extends ImportTransferSchema.class {}
ImportTransferSchema.setClass(ImportTransferEntity);

type ParsedRequest = ReturnType<typeof TransferRequest.parse>;

interface UploadedFileData {
  originalname: string;
  buffer: Buffer;
}

@Injectable()
export class TransferService {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: ImportRegistry,
    private readonly audit: Audit,
  ) {}

  async upload(user: AuthenticatedUser, files: UploadedFileData[] | undefined): Promise<TransferUpload> {
    if (!files?.length) throw new BadRequestException({ code: 'imports.fileMissing' });
    const profiles = this.registry.transferProfiles(user);
    if (!profiles.length) throw new NotFoundException({ code: 'imports.unknownProfile' });

    const { archives, datasets } = await TransferArchive.openAll(
      files.map((f) => ({ name: Buffer.from(f.originalname, 'latin1').toString('utf8'), data: f.buffer })),
      (opened) => ({
        archives: opened.map((a) => ({ key: a.key, fileName: a.fileName, label: a.label })),
        datasets: profiles.map((profile) => ({ profile: profile.id, rows: profile.transfer.read(opened) })).filter((d) => d.rows.length),
      }),
    ).catch((error: unknown) => {
      if (error instanceof TransferError) throw new BadRequestException({ code: error.code, name: error.fileName });
      throw error;
    });

    const em = this.em.fork();
    await em.nativeDelete(ImportTransferEntity, { createdAt: { $lt: new Date(Date.now() - IMPORT_EXPIRY_MS) } });
    const transfer = em.create(ImportTransferEntity, { id: uuidv7(), userId: user.id, archives, datasets, createdAt: new Date() });
    await em.flush();
    const infos: TransferDataset[] = [];
    for (const d of datasets) {
      const units = profiles.find((candidate) => candidate.id === d.profile)?.transfer.units;
      infos.push({ profile: d.profile, rowCount: d.rows.length, ...(units && { units: { label: units.label, none: units.none, entries: await units.entries() } }) });
    }
    return { id: transfer.id, archives, datasets: infos };
  }

  async run(user: AuthenticatedUser, id: string, request: ParsedRequest, dryRun: boolean): Promise<ImportResult> {
    const transfer = await this.find(user, id);
    const profile = this.registry.get(request.profile);
    const dataset = transfer.datasets.find((d) => d.profile === request.profile);
    if (!profile || !dataset || !user.can(profile.permission)) throw new NotFoundException({ code: 'imports.unknownProfile' });

    // Units only for profiles offering them; the others ignore the assignment.
    const units = profile.transfer?.units ? request.units : {};
    if (Object.keys(units).length) {
      const known = new Set((await profile.transfer!.units!.entries()).map((e) => e.key));
      for (const unit of Object.values(units)) if (!known.has(unit)) throw new BadRequestException({ code: 'imports.unknownUnit', unit });
    }
    const rows = dataset.rows.map(({ archive, values }, index) => ({
      row: index + 1,
      values: {
        ...values,
        ...('department' in values ? { department: request.departments[archive] ?? values['department'] } : {}),
        ...(units[archive] ? { unit: units[archive] } : {}),
      },
    }));
    const options = Object.fromEntries((profile.options ?? []).map((o) => [o.key, request.options[o.key] ?? o.default]));
    const result = await this.registry.run(profile, rows, { user, options, dryRun, mappings: request.mappings });
    if (!dryRun) {
      await this.audit.log('imports.transferApplied', { profile: profile.id, files: transfer.archives.map((a) => a.fileName), counts: result.counts });
    }
    return result;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.em.fork().nativeDelete(ImportTransferEntity, { id: (await this.find(user, id)).id });
  }

  private async find(user: AuthenticatedUser, id: string): Promise<ImportTransferEntity> {
    const transfer = await this.em.fork().findOne(ImportTransferEntity, { id, userId: user.id });
    if (!transfer) throw new NotFoundException({ code: 'imports.uploadNotFound' });
    return transfer;
  }
}

/** Data transfer from MP-Feuer: all transfer archives at once, imported profile by profile. */
@Controller('core/imports/transfers')
export class TransfersController {
  constructor(private readonly transfers: TransferService) {}

  /** Step 1: upload the transfer archives (`multipart/form-data`, field `files`). */
  @Post()
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_SIZE } }))
  upload(@UploadedFiles() files: UploadedFileData[] | undefined, @CurrentUser() user: AuthenticatedUser): Promise<TransferUpload> {
    return this.transfers.upload(user, files);
  }

  /** Dry run of one profile; changes nothing. */
  @Post(':id/preview')
  @HttpCode(200)
  preview(@Param('id') id: string, @Body(new ZodPipe(TransferRequest)) request: ParsedRequest, @CurrentUser() user: AuthenticatedUser): Promise<ImportResult> {
    return this.transfers.run(user, id, request, true);
  }

  /** Imports one profile. The transfer stays until it is discarded or expires, so the next profile can follow. */
  @Post(':id/apply')
  @HttpCode(200)
  apply(@Param('id') id: string, @Body(new ZodPipe(TransferRequest)) request: ParsedRequest, @CurrentUser() user: AuthenticatedUser): Promise<ImportResult> {
    return this.transfers.run(user, id, request, false);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.transfers.remove(user, id);
  }
}
