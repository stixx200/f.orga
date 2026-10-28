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
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import {
  type ImportLookupEntry,
  ImportLookupEntryInput,
  type ImportLookupInfo,
  type ImportProfileInfo,
  type ImportRememberedUrl,
  ImportRequest,
  type ImportResult,
  type ImportUpload,
  ImportUrlRequest,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser } from '../security/decorators.js';
import { decryptSecret, encryptSecret, serverKey } from '../security/server-key.js';
import { ZodPipe } from '../zod.pipe.js';
import { ImportRegistry, type ImportRow } from './import-registry.js';
import { type ParsedTable, parseCsv, parseIcs, parseXlsx } from './parse.js';
import { displayUrl, fetchCalendar, UrlImportError } from './url-fetch.js';

const MAX_SIZE = 10 * 1024 * 1024;
/** Uploads and data transfers are removed after a day, also when never imported (retention run). */
export const IMPORT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** An uploaded file between upload and import; removed after the import or after 24 hours. */
export const ImportUploadSchema = defineEntity({
  name: 'ImportUploadEntity',
  schema: 'core',
  tableName: 'import_upload',
  properties: {
    id: p.uuid().primary(),
    userId: p.string(),
    fileName: p.string(),
    headers: p.json<string[]>(),
    rows: p.json<string[][]>(),
    createdAt: p.datetime(),
  },
});
export class ImportUploadEntity extends ImportUploadSchema.class {}
ImportUploadSchema.setClass(ImportUploadEntity);

/**
 * The calendar address a user loaded last and chose to remember, encrypted with `FORGA_SECRET_KEY`
 * (it may contain a secret token). One per user; only that user can use it, and never reads it back in full.
 */
export const ImportUrlSchema = defineEntity({
  name: 'ImportUrlEntity',
  schema: 'core',
  tableName: 'import_url',
  properties: {
    userId: p.string().primary(),
    /** AES-256-GCM, see `encryptSecret`. */
    url: p.text(),
    /** Scheme and host, for display. */
    display: p.string(),
    savedAt: p.datetime(),
  },
});
export class ImportUrlEntity extends ImportUrlSchema.class {}
ImportUrlSchema.setClass(ImportUrlEntity);

type ParsedRequest = ReturnType<typeof ImportRequest.parse>;
type ParsedUrlRequest = ReturnType<typeof ImportUrlRequest.parse>;

/** `FORGA_IMPORT_URL_ALLOW_PRIVATE=true`: calendars may also be loaded from local and private addresses. */
const allowPrivateAddresses = () => process.env['FORGA_IMPORT_URL_ALLOW_PRIVATE'] === 'true';

/** The part of a multer file the import needs. */
interface UploadedFileData {
  originalname: string;
  buffer: Buffer;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: ImportRegistry,
    private readonly audit: Audit,
  ) {}

  async upload(user: AuthenticatedUser, file: UploadedFileData | undefined): Promise<ImportUpload> {
    if (!file) throw new BadRequestException({ code: 'imports.fileMissing' });
    const name = file.originalname;
    const table = /\.xlsx$/i.test(name)
      ? await parseXlsx(file.buffer)
      : /\.(csv|txt)$/i.test(name)
        ? parseCsv(file.buffer.toString('utf8'))
        : /\.ics$/i.test(name)
          ? parseIcs(file.buffer.toString('utf8'))
          : null;
    if (!table) throw new BadRequestException({ code: 'imports.unsupportedFormat' });
    return this.store(user, name, table);
  }

  /** Step 1 from an address: fetches an iCalendar file server side and stores it like an upload. */
  async fromUrl(user: AuthenticatedUser, request: ParsedUrlRequest): Promise<ImportUpload> {
    const em = this.em.fork();
    const key = serverKey();
    let url = request.url;
    if (!url) {
      const remembered = await em.findOne(ImportUrlEntity, { userId: user.id });
      url = (remembered && key && decryptSecret(remembered.url, key)) || undefined;
      if (!url) throw new NotFoundException({ code: 'imports.urlNotRemembered' });
    }
    let fetched: Awaited<ReturnType<typeof fetchCalendar>>;
    try {
      fetched = await fetchCalendar(url, { allowPrivate: allowPrivateAddresses() });
    } catch (error) {
      if (error instanceof UrlImportError) throw new BadRequestException({ code: error.code, ...error.params });
      throw error;
    }
    const display = displayUrl(url);
    if (request.url && request.remember && key) {
      await em.upsert(ImportUrlEntity, { userId: user.id, url: encryptSecret(request.url, key), display, savedAt: new Date() });
    }
    return this.store(user, display, parseIcs(fetched.text));
  }

  /** The remembered address of the user, masked. */
  async remembered(user: AuthenticatedUser): Promise<ImportRememberedUrl> {
    const entry = await this.em.fork().findOne(ImportUrlEntity, { userId: user.id });
    return {
      canRemember: serverKey() !== null,
      remembered: entry ? { display: entry.display, savedAt: entry.savedAt.toISOString() } : null,
    };
  }

  /** Forgets the remembered address of the user. */
  async forget(user: AuthenticatedUser): Promise<void> {
    await this.em.fork().nativeDelete(ImportUrlEntity, { userId: user.id });
  }

  /** Keeps a parsed file until the import and returns the suggestions per profile. */
  private async store(user: AuthenticatedUser, name: string, table: ParsedTable): Promise<ImportUpload> {
    if (!table.headers.length) throw new BadRequestException({ code: 'imports.empty' });

    const em = this.em.fork();
    await em.nativeDelete(ImportUploadEntity, { createdAt: { $lt: new Date(Date.now() - IMPORT_EXPIRY_MS) } });
    const upload = em.create(ImportUploadEntity, {
      id: uuidv7(),
      userId: user.id,
      fileName: name,
      headers: table.headers,
      rows: table.rows,
      createdAt: new Date(),
    });
    await em.flush();

    const suggestions = Object.fromEntries(
      this.registry.available(user).map((info) => [
        info.id,
        this.registry.suggest(this.registry.get(info.id)!, table.headers),
      ]),
    );
    return {
      id: upload.id,
      fileName: name,
      headers: table.headers,
      rowCount: table.rows.length,
      sample: table.rows.slice(0, 5),
      suggestions,
    };
  }

  async run(user: AuthenticatedUser, uploadId: string, request: ParsedRequest, dryRun: boolean): Promise<ImportResult> {
    const em = this.em.fork();
    const upload = await em.findOne(ImportUploadEntity, { id: uploadId, userId: user.id });
    if (!upload) throw new NotFoundException({ code: 'imports.uploadNotFound' });
    const profile = this.registry.get(request.profile);
    if (!profile || !user.can(profile.permission)) throw new NotFoundException({ code: 'imports.unknownProfile' });

    for (const field of profile.fields) {
      const column = request.mapping[field.key];
      if (field.required && !column) throw new BadRequestException({ code: 'imports.requiredFieldUnmapped', field: field.key });
      if (column && !upload.headers.includes(column)) throw new BadRequestException({ code: 'imports.unknownColumn', column });
    }

    const columns = Object.entries(request.mapping).flatMap(([key, column]) =>
      column ? [[key, upload.headers.indexOf(column)] as const] : [],
    );
    const rows: ImportRow[] = upload.rows.map((cells, index) => ({
      row: index + 2,
      values: Object.fromEntries(columns.map(([key, i]) => [key, cells[i] ?? ''])),
    }));
    const options = Object.fromEntries(
      (profile.options ?? []).map((o) => [o.key, request.options[o.key] ?? o.default]),
    );

    const result = await this.registry.run(profile, rows, { user, options, dryRun, mappings: request.mappings });
    if (!dryRun) {
      await em.nativeDelete(ImportUploadEntity, { id: upload.id });
      await this.audit.log('imports.applied', { profile: profile.id, fileName: upload.fileName, counts: result.counts });
    }
    return result;
  }
}

@Controller('core/imports')
export class ImportsController {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly imports: ImportService,
    private readonly audit: Audit,
  ) {}

  @Get('profiles')
  profiles(@CurrentUser() user: AuthenticatedUser): ImportProfileInfo[] {
    return this.registry.available(user);
  }

  /** Lookups that unknown values of an import can be mapped to; `creatable` if the user may add entries. */
  @Get('lookups')
  lookups(@CurrentUser() user: AuthenticatedUser): ImportLookupInfo[] {
    if (!this.registry.available(user).length) throw new NotFoundException({ code: 'imports.unknownProfile' });
    return this.registry.lookups(user);
  }

  /** Entries of the lookup, followed by the targets other modules add (e.g. "no function – during working hours"). */
  @Get('lookups/:kind')
  async entries(@Param('kind') kind: string, @CurrentUser() user: AuthenticatedUser): Promise<ImportLookupEntry[]> {
    const entries = this.registry.available(user).length ? await this.registry.entries(kind) : undefined;
    if (!entries) throw new NotFoundException({ code: 'imports.unknownLookup', kind });
    return entries;
  }

  /** Creates an entry for an unknown value, e.g. a course name missing in the catalog. Needs the lookup's permission. */
  @Post('lookups/:kind')
  async create(
    @Param('kind') kind: string,
    @Body(new ZodPipe(ImportLookupEntryInput)) input: ReturnType<typeof ImportLookupEntryInput.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportLookupEntry> {
    const lookup = this.registry.lookup(kind);
    if (!lookup || !this.registry.available(user).length) throw new NotFoundException({ code: 'imports.unknownLookup', kind });
    if (!lookup.create || !user.can(lookup.create.permission)) {
      throw new ForbiddenException({ code: 'auth.forbidden', permissions: lookup.create ? [lookup.create.permission] : [] });
    }
    const entry = await lookup.create.run(input);
    await this.audit.log('imports.lookupEntryCreated', { kind, key: entry.key });
    return entry;
  }

  /** Step 1: upload an Excel, CSV or iCalendar file (`multipart/form-data`, field `file`). */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  upload(@UploadedFile() file: UploadedFileData | undefined, @CurrentUser() user: AuthenticatedUser): Promise<ImportUpload> {
    if (!this.registry.available(user).length) throw new NotFoundException({ code: 'imports.unknownProfile' });
    return this.imports.upload(user, file);
  }

  /** Step 1 from an address: an iCalendar file (`https://`, `http://`, `webcal://`), fetched by the server. */
  @Post('url')
  @HttpCode(201)
  fromUrl(
    @Body(new ZodPipe(ImportUrlRequest)) request: ParsedUrlRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportUpload> {
    if (!this.registry.available(user).length) throw new NotFoundException({ code: 'imports.unknownProfile' });
    return this.imports.fromUrl(user, request);
  }

  /** The calendar address the user remembered (masked). */
  @Get('url')
  remembered(@CurrentUser() user: AuthenticatedUser): Promise<ImportRememberedUrl> {
    if (!this.registry.available(user).length) throw new NotFoundException({ code: 'imports.unknownProfile' });
    return this.imports.remembered(user);
  }

  /** Forgets the remembered calendar address. */
  @Delete('url')
  @HttpCode(204)
  forget(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.imports.forget(user);
  }

  /** Step 2: dry run with mapping and options; changes nothing. */
  @Post(':id/preview')
  @HttpCode(200)
  preview(
    @Param('id') id: string,
    @Body(new ZodPipe(ImportRequest)) request: ParsedRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportResult> {
    return this.imports.run(user, id, request, true);
  }

  /** Step 3: apply. The uploaded file is removed afterwards. */
  @Post(':id/apply')
  @HttpCode(200)
  apply(
    @Param('id') id: string,
    @Body(new ZodPipe(ImportRequest)) request: ParsedRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportResult> {
    return this.imports.run(user, id, request, false);
  }
}
