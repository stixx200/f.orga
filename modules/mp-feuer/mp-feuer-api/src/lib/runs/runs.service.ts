import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core';
import {
  Audit,
  type AuthenticatedUser,
  ImportRegistry,
  ImportService,
  ModuleStateService,
  SettingsService,
  UserContext,
} from '@forga/core-api';
import type { ImportRowResult, ImportUnmatched } from '@forga/core-contracts';
import { INCIDENT_UNITS, type IncidentUnits } from '@forga/incidents-contracts';
import { type Department, ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import {
  type ImportCounts,
  MP_FEUER_PART_SIZE,
  type MpFeuerRemembered,
  MpFeuerRemembered as RememberedSchema,
  type MpFeuerRun,
  type ReportMessageGroup,
  RUNNING,
  type RunArchive,
  type RunDataset,
  type RunReport,
  RunSelection,
  type RunSummary,
  type RunUnits,
} from '@forga/mp-feuer-contracts';
import { countRows, newestFiles, TransferArchive, TransferError, type TransferRow } from '../archive/transfer-archive.js';
import { DATASETS, type DatasetDefinition, splitIntoParts } from '../datasets.js';
import { MpFeuerRunDatasetEntity, MpFeuerRunEntity } from '../mp-feuer.entities.js';
import { MpFeuerMappings } from './mp-feuer-mappings.js';

export const REMEMBERED = 'mp-feuer.remembered';
/** The rows read from the archives are removed after 7 days at the latest. */
export const ROWS_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

type ParsedSelection = ReturnType<typeof RunSelection.parse>;

interface UploadedFileData {
  originalname: string;
  buffer: Buffer;
}

/** A row of a dataset ready for the profile: the row number within the dataset and the archive it comes from. */
interface NumberedRow extends TransferRow {
  row: number;
}

const ZERO: ImportCounts = { create: 0, update: 0, unchanged: 0, error: 0 };

/** "Abt. Musterstadt" ↔ "Abteilung Musterstadt", "Altersabt. Ahornfeld" ↔ "Altersabteilung Ahornfeld". */
const unitKey = (text: string) => text.toLowerCase().replace(/abteilung/g, 'abt').replace(/ue/g, 'ü').replace(/[^a-z0-9äöüß]/g, '');

/** A CSV cell, quoted if needed. */
function cell(value: unknown): string {
  const text = String(value ?? '');
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** JSON with sorted keys, so equal selections give equal signatures. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const addCounts = (a: ImportCounts, b: Partial<ImportCounts>): ImportCounts => ({
  create: (a.create ?? 0) + (b.create ?? 0),
  update: (a.update ?? 0) + (b.update ?? 0),
  unchanged: (a.unchanged ?? 0) + (b.unchanged ?? 0),
  error: (a.error ?? 0) + (b.error ?? 0),
});

/**
 * Data transfers from MP-Feuer: reads the transfer archives into a run, keeps the selection, and runs dry runs and
 * applies in the background, dataset by dataset and in parts, through `ImportService.runRows`.
 */
@Injectable()
export class MpFeuerRuns implements OnApplicationBootstrap {
  private readonly logger = new Logger('MpFeuerRuns');
  /** Rows per part; smaller in tests. */
  partSize = MP_FEUER_PART_SIZE;
  /** Called before every part (tests use it to cancel or interrupt at a known point). */
  beforePart?: (info: { runId: string; profile: string; part: number; parts: number }) => Promise<void>;
  /** Runs working in this process, for tests and for an orderly shutdown. */
  readonly working = new Map<string, Promise<void>>();

  constructor(
    private readonly em: EntityManager,
    private readonly registry: ImportRegistry,
    private readonly imports: ImportService,
    private readonly audit: Audit,
    private readonly settings: SettingsService,
    private readonly modules: ModuleStateService,
    private readonly mappings: MpFeuerMappings,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Optional() @Inject(INCIDENT_UNITS) private readonly units?: IncidentUnits,
  ) {}

  /** A run that was working when the server stopped cannot go on: it fails as interrupted (finished parts stay). */
  async onApplicationBootstrap(): Promise<void> {
    await this.recoverInterrupted();
  }

  async recoverInterrupted(): Promise<number> {
    return this.em.fork().nativeUpdate(
      MpFeuerRunEntity,
      { status: { $in: [...RUNNING] } },
      { status: 'failed', error: 'mp-feuer.interrupted', lock: null, finishedAt: new Date() },
    );
  }

  // ----- Upload and selection -----

  async upload(user: AuthenticatedUser, files: UploadedFileData[] | undefined): Promise<MpFeuerRun> {
    if (!files?.length) throw new BadRequestException({ code: 'mp-feuer.filesMissing' });
    const named = files.map((f) => ({ name: Buffer.from(f.originalname, 'latin1').toString('utf8'), data: f.buffer }));
    const { kept, superseded } = newestFiles(named);
    const definitions = DATASETS.filter((d) => this.registry.get(d.profile));

    const read = await TransferArchive.openAll(kept, (archives) => ({
      archives: archives.map((a) => ({
        key: a.key,
        fileName: a.fileName,
        label: a.label,
        content: { persons: countRows(a, 'PER_STAMM') + countRows(a, 'JUG_STAMM'), incidents: countRows(a, 'EIN_STAMM'), sessions: countRows(a, 'UPE_STAMM') },
      })),
      datasets: definitions.map((d) => ({ definition: d, rows: d.read(archives) })).filter((d) => d.rows.length),
    })).catch((error: unknown) => {
      if (error instanceof TransferError) throw new BadRequestException({ code: error.code, name: error.fileName });
      throw error;
    });

    const remembered = await this.remembered();
    const departments = await this.organization.departments();
    const units = new Set((await this.unitChoices())?.entries.map((e) => e.key) ?? []);
    const archives: RunArchive[] = read.archives.map((a) => {
      const file = kept.find((f) => f.name === a.fileName)!;
      const known = remembered.archives[a.key];
      const department = known ? (departments.some((d) => d.name === known.department) ? known.department : null) : this.suggestDepartment(a.label, departments);
      return {
        ...a,
        department,
        unit: known?.unit && units.has(known.unit) ? known.unit : null,
        skip: known?.skip ?? false,
        remembered: Boolean(known),
        superseded: (superseded.get(file) ?? []).map((f) => f.name),
      };
    });

    const em = this.em.fork();
    const run = em.create(MpFeuerRunEntity, {
      userId: user.id,
      createdBy: user.displayName,
      status: 'prepared',
      phase: null,
      files: kept.map((f) => f.name),
      archives,
      mappings: {},
      unmatched: [],
      progress: null,
      error: null,
      cancelRequested: false,
      lock: null,
      checkedSignature: null,
      rememberedCount: 0,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      checkedAt: null,
    });
    for (const { definition, rows } of read.datasets) {
      const profile = this.registry.get(definition.profile)!;
      const locked = !user.can(profile.permission);
      const known = remembered.datasets[definition.profile];
      const offered = this.options(definition);
      em.create(MpFeuerRunDatasetEntity, {
        run,
        profile: definition.profile,
        position: definition.position,
        rowCount: rows.length,
        rows: locked ? null : rows,
        enabled: !locked && (known?.enabled ?? true),
        options: Object.fromEntries(offered.map((o) => [o.key, known?.options[o.key] ?? o.default])),
        locked,
        counts: null,
        results: [],
        unmatched: 0,
        parts: 0,
        partsDone: 0,
        durationMs: null,
      });
    }
    await em.flush();
    return this.get(run.id);
  }

  async update(id: string, selection: ParsedSelection): Promise<MpFeuerRun> {
    const em = this.em.fork();
    const run = await this.find(em, id);
    if (RUNNING.includes(run.status)) throw new ConflictException({ code: 'mp-feuer.runActive' });
    if (run.status !== 'prepared' && run.status !== 'checked') throw new ConflictException({ code: 'mp-feuer.runFinished' });

    if (selection.archives) {
      const departments = new Set((await this.organization.departments()).map((d) => d.name));
      const units = new Set((await this.unitChoices())?.entries.map((e) => e.key) ?? []);
      run.archives = run.archives.map((archive) => {
        const chosen = selection.archives![archive.key];
        if (!chosen) return archive;
        if (chosen.department !== null && !departments.has(chosen.department)) throw new BadRequestException({ code: 'mp-feuer.unknownDepartment', name: chosen.department });
        if (chosen.unit !== null && !units.has(chosen.unit)) throw new BadRequestException({ code: 'mp-feuer.unknownUnit', unit: chosen.unit });
        return { ...archive, department: chosen.department, unit: chosen.unit, skip: chosen.skip };
      });
    }
    if (selection.datasets) {
      for (const dataset of await em.find(MpFeuerRunDatasetEntity, { run })) {
        const chosen = selection.datasets[dataset.profile];
        if (!chosen) continue;
        const definition = DATASETS.find((d) => d.profile === dataset.profile)!;
        const offered = this.options(definition).map((o) => o.key);
        dataset.enabled = !dataset.locked && chosen.enabled;
        dataset.options = { ...dataset.options, ...Object.fromEntries(Object.entries(chosen.options).filter(([key]) => offered.includes(key))) };
      }
    }
    if (selection.mappings) {
      await this.registry.assertMappings(selection.mappings);
      run.mappings = selection.mappings;
    }
    await em.flush();
    return this.get(id);
  }

  /** Discards a run that has not been applied, with its rows. */
  async remove(id: string): Promise<void> {
    const em = this.em.fork();
    const run = await this.find(em, id);
    if (RUNNING.includes(run.status)) throw new ConflictException({ code: 'mp-feuer.runActive' });
    if (run.status !== 'prepared' && run.status !== 'checked') throw new ConflictException({ code: 'mp-feuer.runFinished' });
    await em.nativeDelete(MpFeuerRunDatasetEntity, { run: run.id });
    await em.nativeDelete(MpFeuerRunEntity, { id: run.id });
  }

  // ----- Background runs -----

  /** Starts a dry run (`dryRun`) or the apply in the background; at most one run works at a time. */
  async start(user: AuthenticatedUser, id: string, dryRun: boolean): Promise<MpFeuerRun> {
    const em = this.em.fork();
    const run = await this.find(em, id);
    if (RUNNING.includes(run.status)) throw new ConflictException({ code: 'mp-feuer.runActive' });
    if (run.status !== 'prepared' && run.status !== 'checked') throw new ConflictException({ code: 'mp-feuer.runFinished' });
    const datasets = await em.find(MpFeuerRunDatasetEntity, { run }, { orderBy: { position: 'asc' } });
    if (!dryRun && (run.status !== 'checked' || run.checkedSignature !== this.signature(run, datasets))) {
      throw new ConflictException({ code: 'mp-feuer.dryRunOutdated' });
    }
    if (!datasets.some((d) => d.enabled && !d.locked)) throw new BadRequestException({ code: 'mp-feuer.nothingSelected' });
    em.assign(run, {
      status: dryRun ? 'dry-running' : 'applying',
      phase: dryRun ? 'dry-run' : 'apply',
      lock: 'running',
      cancelRequested: false,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
      progress: null,
    });
    try {
      await em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw new ConflictException({ code: 'mp-feuer.runActive' });
      throw error;
    }
    const work = UserContext.run(user.id, () => this.work(user, run.id, dryRun)).finally(() => this.working.delete(run.id));
    this.working.set(run.id, work);
    return this.get(id);
  }

  /** The working run stops after its current part. */
  async cancel(id: string): Promise<MpFeuerRun> {
    const em = this.em.fork();
    const run = await this.find(em, id);
    if (!RUNNING.includes(run.status)) throw new ConflictException({ code: 'mp-feuer.runNotActive' });
    await em.nativeUpdate(MpFeuerRunEntity, { id }, { cancelRequested: true });
    return this.get(id);
  }

  private async work(user: AuthenticatedUser, id: string, dryRun: boolean): Promise<void> {
    const em = this.em.fork();
    try {
      const run = await this.find(em, id);
      const datasets = await em.find(MpFeuerRunDatasetEntity, { run, enabled: true, locked: false }, { orderBy: { position: 'asc' }, populate: ['rows'] });
      const archives = new Map(run.archives.map((a) => [a.key, a]));
      const plans = datasets.map((dataset) => {
        const definition = DATASETS.find((d) => d.profile === dataset.profile)!;
        const rows = this.prepareRows(dataset.rows ?? [], archives, definition);
        return { dataset, definition, parts: splitIntoParts(rows, this.partSize, definition.groups) };
      });
      const total = plans.reduce((sum, p) => sum + p.parts.reduce((s, part) => s + part.length, 0), 0);
      for (const { dataset, parts } of plans) {
        await em.nativeUpdate(MpFeuerRunDatasetEntity, { id: dataset.id }, { parts: parts.length, partsDone: 0, counts: null, results: [], unmatched: 0, durationMs: null });
      }
      const remembered = await this.mappings.remembered();
      const unmatched = new Map<string, ImportUnmatched>();
      const learned = new Set<string>();
      let rowsDone = 0;
      let cancelled = false;

      outer: for (const { dataset, parts } of plans) {
        const started = Date.now();
        let counts: ImportCounts = { ...ZERO };
        const results: (ImportRowResult & { archive: string })[] = [];
        const open = new Set<string>();
        for (const [index, part] of parts.entries()) {
          if ((await this.em.fork().findOne(MpFeuerRunEntity, id, { fields: ['cancelRequested'] }))?.cancelRequested) {
            cancelled = true;
            break outer;
          }
          await this.progress(id, { dataset: dataset.profile, part: index + 1, parts: parts.length, rowsDone, rows: total });
          await this.beforePart?.({ runId: id, profile: dataset.profile, part: index + 1, parts: parts.length });
          const { result, used } = await this.imports.runRows({
            user,
            profile: dataset.profile,
            rows: part.map(({ row, values }) => ({ row, values })),
            options: dataset.options,
            mappings: run.mappings,
            dryRun,
            source: { module: 'mp-feuer', runId: id },
            mappingList: 'none',
            remembered,
            audit: { files: run.files, part: index + 1, parts: parts.length },
          });
          const archiveOf = new Map(part.map((r) => [r.row, r.archive]));
          counts = addCounts(counts, result.counts);
          for (const r of result.rows) if (r.action === 'error' || r.messages.length) results.push({ ...r, archive: archiveOf.get(r.row) ?? '' });
          for (const u of result.unmatched) {
            const key = JSON.stringify([u.kind, u.value]);
            open.add(key);
            const entry = unmatched.get(key) ?? { ...u, count: 0 };
            entry.count += u.count;
            unmatched.set(key, entry);
          }
          if (!dryRun) {
            await this.mappings.remember(used, dataset.profile, user);
            for (const u of used) if (!u.remembered) learned.add(JSON.stringify([u.kind, u.value]));
          }
          rowsDone += part.length;
          await em.nativeUpdate(MpFeuerRunDatasetEntity, { id: dataset.id }, { partsDone: index + 1, counts, results, unmatched: open.size, durationMs: Date.now() - started });
          await this.progress(id, { dataset: dataset.profile, part: index + 1, parts: parts.length, rowsDone, rows: total });
        }
      }

      const fresh = await this.find(this.em.fork(), id);
      const finishedAt = new Date();
      const base = { lock: null, finishedAt, unmatched: [...unmatched.values()], rememberedCount: learned.size };
      if (cancelled) {
        // A cancelled dry run leaves the run as it was before; a cancelled apply keeps the finished parts and ends.
        await em.nativeUpdate(MpFeuerRunEntity, { id }, { ...base, status: dryRun ? 'prepared' : 'cancelled', checkedSignature: dryRun ? null : fresh.checkedSignature });
        if (!dryRun) await this.audit.log('mp-feuer.run-cancelled', { runId: id, files: run.files, progress: fresh.progress });
      } else if (dryRun) {
        const all = await this.em.fork().find(MpFeuerRunDatasetEntity, { run: id }, { orderBy: { position: 'asc' } });
        await em.nativeUpdate(MpFeuerRunEntity, { id }, { ...base, status: 'checked', checkedAt: finishedAt, checkedSignature: this.signature(fresh, all) });
      } else {
        await em.nativeUpdate(MpFeuerRunEntity, { id }, { ...base, status: 'applied' });
        await em.nativeUpdate(MpFeuerRunDatasetEntity, { run: id }, { rows: null });
        await this.rememberSelection(fresh);
        const all = await this.em.fork().find(MpFeuerRunDatasetEntity, { run: id }, { orderBy: { position: 'asc' } });
        await this.audit.log('mp-feuer.run-applied', {
          runId: id,
          files: run.files,
          counts: Object.fromEntries(all.filter((d) => d.counts).map((d) => [d.profile, d.counts])),
        });
      }
    } catch (error) {
      const code = error instanceof HttpException ? ((error.getResponse() as { code?: string }).code ?? 'mp-feuer.failed') : 'mp-feuer.failed';
      if (!(error instanceof HttpException)) this.logger.error(`Run ${id} failed`, error instanceof Error ? error.stack : String(error));
      await this.em.fork().nativeUpdate(MpFeuerRunEntity, { id }, { status: 'failed', error: code, lock: null, finishedAt: new Date() });
    }
  }

  private async progress(id: string, progress: MpFeuerRun['progress']): Promise<void> {
    await this.em.fork().nativeUpdate(MpFeuerRunEntity, { id }, { progress });
  }

  /** Rows of a dataset without skipped archives, with the department and unit chosen for their archive. */
  private prepareRows(rows: readonly TransferRow[], archives: ReadonlyMap<string, RunArchive>, definition: DatasetDefinition): NumberedRow[] {
    return rows.flatMap((r, index) => {
      const archive = archives.get(r.archive);
      if (!archive || archive.skip) return [];
      const values = { ...r.values };
      if ('department' in values && archive.department) values['department'] = archive.department;
      if (definition.units && archive.unit) values['unit'] = archive.unit;
      return [{ archive: r.archive, row: index + 1, values }];
    });
  }

  /** Keeps the selection of an apply for the next upload: per archive number and per dataset. */
  private async rememberSelection(run: MpFeuerRunEntity): Promise<void> {
    const current = await this.remembered();
    const at = new Date().toISOString();
    const datasets = await this.em.fork().find(MpFeuerRunDatasetEntity, { run: run.id, locked: false });
    await this.settings.set(REMEMBERED, {
      archives: {
        ...current.archives,
        ...Object.fromEntries(run.archives.map((a) => [a.key, { label: a.label, department: a.department, unit: a.unit, skip: a.skip, at }])),
      },
      datasets: { ...current.datasets, ...Object.fromEntries(datasets.map((d) => [d.profile, { enabled: d.enabled, options: d.options }])) },
    });
  }

  async remembered(): Promise<MpFeuerRemembered> {
    return RememberedSchema.parse((await this.settings.get(REMEMBERED)) ?? {});
  }

  async resetRemembered(): Promise<void> {
    await this.settings.set(REMEMBERED, { archives: {}, datasets: {} });
  }

  // ----- Reading -----

  async get(id: string): Promise<MpFeuerRun> {
    const em = this.em.fork();
    const run = await this.find(em, id);
    const datasets = await em.find(MpFeuerRunDatasetEntity, { run }, { orderBy: { position: 'asc' } });
    const signature = this.signature(run, datasets);
    return {
      id: run.id,
      status: run.status,
      phase: run.phase ?? null,
      createdBy: run.createdBy,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      checkedAt: run.checkedAt?.toISOString() ?? null,
      archives: run.archives,
      datasets: datasets.map((d) => this.datasetDto(d)),
      units: await this.unitChoices(),
      mappings: run.mappings,
      progress: run.progress ?? null,
      unmatched: run.unmatched,
      error: run.error ?? null,
      cancelRequested: run.cancelRequested,
      dryRunOutdated: run.status === 'checked' && run.checkedSignature !== signature,
    };
  }

  async list(): Promise<RunSummary[]> {
    const em = this.em.fork();
    const runs = await em.find(MpFeuerRunEntity, {}, { orderBy: { createdAt: 'desc' }, limit: 200 });
    const datasets = await em.find(MpFeuerRunDatasetEntity, { run: { $in: runs.map((r) => r.id) } });
    return runs.map((run) => this.summary(run, datasets.filter((d) => d.run.id === run.id)));
  }

  async report(id: string): Promise<RunReport> {
    const em = this.em.fork();
    const run = await this.find(em, id);
    const datasets = await em.find(MpFeuerRunDatasetEntity, { run }, { orderBy: { position: 'asc' }, populate: ['results'] });
    const groups = new Map<string, ReportMessageGroup>();
    for (const dataset of datasets) {
      for (const row of dataset.results ?? []) {
        for (const message of row.messages) {
          const value = message.params?.['value'] ?? message.params?.['name'] ?? null;
          const key = JSON.stringify([message.code, value, row.action === 'error']);
          const group = groups.get(key) ?? { code: message.code, value: value === null ? null : String(value), params: message.params, error: row.action === 'error', count: 0, examples: [] };
          group.count++;
          if (group.examples.length < 3) group.examples.push({ dataset: dataset.profile, archive: row.archive, row: row.row, label: row.label });
          groups.set(key, group);
        }
      }
    }
    return {
      run: this.summary(run, datasets),
      datasets: datasets.map((d) => ({ profile: d.profile, name: this.profileName(d.profile), counts: d.counts ?? null, durationMs: d.durationMs ?? null })),
      messages: [...groups.values()].toSorted((a, b) => Number(b.error) - Number(a.error) || b.count - a.count || a.code.localeCompare(b.code)),
      remembered: run.rememberedCount,
    };
  }

  /** All rows with messages of the last dry run or apply, as CSV (UTF-8 with BOM, separated by semicolons). */
  async reportCsv(id: string): Promise<string> {
    const em = this.em.fork();
    const run = await this.find(em, id);
    const datasets = await em.find(MpFeuerRunDatasetEntity, { run }, { orderBy: { position: 'asc' }, populate: ['results'] });
    const lines = [['dataset', 'archive', 'row', 'label', 'action', 'code', 'params'].join(';')];
    for (const dataset of datasets) {
      for (const row of dataset.results ?? []) {
        for (const message of row.messages.length ? row.messages : [{ code: '', params: undefined }]) {
          lines.push([dataset.profile, row.archive, row.row, row.label, row.action, message.code, message.params ? JSON.stringify(message.params) : ''].map(cell).join(';'));
        }
      }
    }
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  // ----- Helpers -----

  private summary(run: MpFeuerRunEntity, datasets: readonly MpFeuerRunDatasetEntity[]): RunSummary {
    return {
      id: run.id,
      status: run.status,
      phase: run.phase ?? null,
      createdBy: run.createdBy,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      files: run.files,
      counts: datasets.reduce((sum, d) => addCounts(sum, d.counts ?? {}), { ...ZERO }),
      unmatched: run.unmatched.length,
      error: run.error ?? null,
      progress: run.progress ?? null,
    };
  }

  private datasetDto(d: MpFeuerRunDatasetEntity): RunDataset {
    const definition = DATASETS.find((x) => x.profile === d.profile);
    return {
      profile: d.profile,
      name: this.profileName(d.profile),
      order: d.position,
      rowCount: d.rowCount,
      enabled: d.enabled,
      options: d.options,
      optionInfo: definition ? this.options(definition) : [],
      locked: d.locked,
      counts: d.counts ?? null,
      unmatched: d.unmatched,
      parts: d.parts,
      partsDone: d.partsDone,
      durationMs: d.durationMs ?? null,
    };
  }

  private profileName(profile: string) {
    return this.registry.get(profile)?.name ?? { de: profile, en: profile };
  }

  private options(definition: DatasetDefinition) {
    return (this.registry.get(definition.profile)?.options ?? []).filter((o) => !definition.hiddenOptions?.includes(o.key));
  }

  /** What a dry run checked: archives, datasets and mappings. */
  private signature(run: MpFeuerRunEntity, datasets: readonly MpFeuerRunDatasetEntity[]): string {
    return stable({
      archives: run.archives.map((a) => [a.key, a.department, a.unit, a.skip]),
      datasets: datasets.map((d) => [d.profile, d.enabled, d.options]),
      mappings: run.mappings,
    });
  }

  /** Brigade-wide units of active modules, e.g. the duty officer; `null` while the incidents module is off. */
  private async unitChoices(): Promise<RunUnits | null> {
    const inactive = await this.modules.inactiveIds();
    if (!this.units || inactive.has('incidents')) return null;
    return { entries: this.units.all().filter((u) => !u.module || !inactive.has(u.module)).map((u) => ({ key: u.key, name: u.label })) };
  }

  private suggestDepartment(label: string, departments: readonly Department[]): string | null {
    const wanted = unitKey(label);
    return departments.find((d) => unitKey(d.name) === wanted || unitKey(d.shortName) === wanted)?.name ?? null;
  }

  private async find(em: EntityManager, id: string): Promise<MpFeuerRunEntity> {
    const run = await em.findOne(MpFeuerRunEntity, { id });
    if (!run) throw new NotFoundException({ code: 'mp-feuer.runNotFound' });
    return run;
  }

  /** Removes the rows of runs older than 7 days (retention run); returns the number of datasets. */
  async expireRows(dryRun: boolean): Promise<number> {
    const em = this.em.fork();
    const runs = await em.find(MpFeuerRunEntity, { createdAt: { $lt: new Date(Date.now() - ROWS_EXPIRY_MS) }, status: { $nin: [...RUNNING] } }, { fields: ['id'] });
    if (!runs.length) return 0;
    const where = { run: { $in: runs.map((r) => r.id) }, rows: { $ne: null } };
    return dryRun ? em.count(MpFeuerRunDatasetEntity, where) : em.nativeUpdate(MpFeuerRunDatasetEntity, where, { rows: null });
  }
}

