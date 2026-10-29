import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type DescribeContext, ImportRegistry, type PersonDataSection } from '@forga/core-api';
import type { ImportRowResult } from '@forga/core-contracts';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { MpFeuerRunDatasetEntity, MpFeuerRunEntity } from '../mp-feuer.entities.js';
import type { TransferRow } from '../archive/transfer-archive.js';

/** Words of a name, lower case, for comparing with labels and values of transfer files. */
const words = (name: string) => name.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 1);

/**
 * What the data transfers keep about persons: the rows read from the transfer files (until the apply, at most 7 days)
 * and the rows with messages of the report (kept with the run). They hold names from MP-Feuer, not person IDs, so the
 * access report finds them by the name of the person (all words of the name in the label or in the values of a row).
 */
@Injectable()
export class RunPersonData {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: ImportRegistry,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  /** Full export: the runs with their counts and report rows, without the rows of the transfer files. */
  async all(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const runs = await em.find(MpFeuerRunEntity, {}, { orderBy: { createdAt: 'asc' } });
    const datasets = await em.find(MpFeuerRunDatasetEntity, {}, { populate: ['results'], orderBy: { position: 'asc' } });
    return {
      runs: runs.map((r) => ({
        id: r.id,
        createdBy: r.createdBy,
        status: r.status,
        files: r.files,
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        datasets: datasets.filter((d) => d.run.id === r.id).map((d) => ({ profile: d.profile, rowCount: d.rowCount, counts: d.counts ?? null, results: d.results })),
      })),
    };
  }

  private async matches(personName: string) {
    const name = words(personName);
    if (!name.length) return [];
    const em = this.em.fork();
    const datasets = await em.find(MpFeuerRunDatasetEntity, {}, { populate: ['results', 'rows', 'run'], orderBy: { position: 'asc' } });
    const hit = (text: string) => {
      const lower = text.toLowerCase();
      return name.every((w) => lower.includes(w));
    };
    return datasets
      .map((d) => ({
        dataset: d,
        results: (d.results ?? []).filter((r) => hit(r.label)),
        rows: (d.rows ?? []).filter((r: TransferRow) => hit(Object.values(r.values).join(' '))),
      }))
      .filter((m) => m.results.length || m.rows.length);
  }

  /** Data access request (JSON): the matching report rows and transfer rows, by run. */
  async person(personId: string): Promise<Record<string, unknown>> {
    const [person] = await this.directory.summaries([personId]);
    const found = person ? await this.matches(`${person.firstName} ${person.lastName}`) : [];
    return {
      matches: found.map((m) => ({ runId: m.dataset.run.id, runCreatedAt: m.dataset.run.createdAt.toISOString(), profile: m.dataset.profile, results: m.results, rows: m.rows })),
    };
  }

  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const found = await this.matches(await ctx.person(personId));
    if (!found.length) return [];
    const actions: Record<ImportRowResult['action'], string> = {
      create: ctx.t('angelegt', 'created'),
      update: ctx.t('aktualisiert', 'updated'),
      unchanged: ctx.t('unverändert', 'unchanged'),
      error: ctx.t('nicht übernommen (Fehler)', 'not taken over (error)'),
    };
    const profile = (id: string) => {
      const p = this.registry.get(id);
      return p ? ctx.text(p.name) : ctx.t('Datenbereich', 'Data area');
    };
    const rows: string[][] = [];
    for (const m of found) {
      const run = ctx.date(m.dataset.run.createdAt);
      for (const r of m.results) {
        rows.push([run, profile(m.dataset.profile), ctx.number(r.row), `${actions[r.action] ?? r.action}, ${(r.messages.length === 1 ? ctx.t('1 Hinweis im Bericht', '1 note in the report') : ctx.t(`${r.messages.length} Hinweise im Bericht`, `${r.messages.length} notes in the report`))}`]);
      }
      if (m.rows.length) {
        rows.push([
          run,
          profile(m.dataset.profile),
          ctx.number(m.rows.length),
          ctx.t('Zeilen aus den Transferdateien, gelöscht nach der Übernahme, spätestens nach 7 Tagen', 'rows of the transfer files, deleted after the apply, at the latest after 7 days'),
        ]);
      }
    }
    return [
      {
        key: 'mp-feuer',
        title: ctx.t('Datenübernahme aus MP-Feuer', 'Data transfer from MP-Feuer'),
        activity: 'mp-feuer.transfer',
        categories: [ctx.t('Daten aus MP-Feuer (Name und übernommene Angaben)', 'Data from MP-Feuer (name and transferred details)')],
        blocks: [
          {
            kind: 'table',
            title: ctx.t('Zeilen mit Ihrem Namen in Datenübernahmen', 'Rows with your name in data transfers'),
            columns: [ctx.t('Lauf vom', 'Run of'), ctx.t('Bereich', 'Area'), ctx.t('Zeile bzw. Anzahl', 'Row or number'), ctx.t('Inhalt', 'Content')],
            rows,
          },
        ],
      },
    ];
  }
}
