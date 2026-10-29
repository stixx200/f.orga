import { Controller, Get, Injectable, Logger, type OnModuleInit, Query } from '@nestjs/common';
import { defineEntity, EntityManager, type FilterQuery, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { ACCESS_LOG_RETENTION, type AccessLogEntry, type AccessLogFilters } from '@forga/privacy-contracts';
import type { LocalizedText, RetentionSettings } from '@forga/core-contracts';
import { AccessLog, type AuthenticatedUser, berlinDate, OrganizationDirectory, RequirePermissions, RetentionRegistry, SettingsService, User } from '@forga/core-api';

/**
 * Read log (L15): one row per user, person, area and day with the number of accesses. Only for health or other
 * especially protected data; never the content that was read.
 */
export const AccessLogSchema = defineEntity({
  name: 'AccessLogEntity',
  schema: 'privacy',
  tableName: 'access_log',
  uniques: [{ properties: ['userId', 'personKey', 'area', 'day'] }],
  indexes: [{ properties: ['personId'] }, { properties: ['day'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** The user who read; during an impersonation the administrator. No foreign key: the log outlives users. */
    userId: p.string(),
    /** Person in the master data module; `null` for accesses to all persons (full export). */
    personId: p.string().nullable(),
    /** `personId` or `*`: part of the unique key (`null` would never be equal). */
    personKey: p.string(),
    area: p.string(),
    day: p.string().length(10),
    count: p.integer().default(1),
    firstAt: p.datetime(),
    lastAt: p.datetime(),
  },
});
export class AccessLogEntity extends AccessLogSchema.class {}
AccessLogSchema.setClass(AccessLogEntity);

/** Area of the access report; further areas come from the core and the modules (`AccessLog.registerArea`). */
export const ACCESS_REPORT_AREA = 'privacy.access-report';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface AccessLogQuery {
  /** First and last day (Europe/Berlin, inclusive). */
  from?: string;
  to?: string;
  userId?: string;
  personId?: string;
  area?: string;
  limit?: number;
}

/**
 * The stored read log: records the reads the modules report through the core (`AccessLog.record`); the data protection
 * pages and the data breach helpers read it (`query`, `forPerson`). Recording never fails the request that read the data.
 */
@Injectable()
export class AccessLogStore implements OnModuleInit {
  private readonly logger = new Logger('AccessLog');

  constructor(
    private readonly em: EntityManager,
    private readonly organization: OrganizationDirectory,
    private readonly retention: RetentionRegistry,
    private readonly settings: SettingsService,
    private readonly areas: AccessLog,
  ) {}

  onModuleInit(): void {
    this.areas.registerArea(ACCESS_REPORT_AREA, { de: 'Auskunft nach Art. 15', en: 'Access report (Art. 15)' });
    this.areas.registerRecorder({ module: 'privacy', record: (user, personIds, area) => this.record(user, personIds, area) });
    this.retention.registerCategory({
      key: ACCESS_LOG_RETENTION,
      module: 'privacy',
      name: { de: 'Leseprotokoll', en: 'Read log' },
      description: {
        de: 'Zugriffe auf Gesundheitsdaten und andere besonders geschützte Daten, je Benutzer, Person und Tag',
        en: 'Accesses to health data and other especially protected data, per user, person and day',
      },
      event: { de: 'Tag des Zugriffs', en: 'Day of the access' },
      actions: ['delete'],
      defaultRule: { years: 1, action: 'delete' },
      candidates: async (query) => {
        const rows: { year: number; first: string }[] = await this.em
          .fork()
          .getConnection()
          .execute('select extract(year from "last_at")::int as "year", min("day") as "first" from "privacy"."access_log" where "last_at" < ? group by 1 order by 1', [query.cutoff]);
        return rows.map((r) => ({ id: String(r.year), label: String(r.year), neutralLabel: String(r.year), eventDate: r.first }));
      },
      export: async (ids) =>
        Promise.all(
          ids.map(async (year) => {
            const entries = await this.em.fork().find(AccessLogEntity, { lastAt: await this.yearRange(year) }, { orderBy: { day: 'asc' } });
            return { id: year, title: year, fields: [{ label: { de: 'Einträge', en: 'Entries' }, value: String(entries.length) }], data: { entries }, attachments: [] };
          }),
        ),
      execute: async (ids) => {
        let count = 0;
        for (const year of ids) count += await this.em.fork().nativeDelete(AccessLogEntity, { lastAt: await this.yearRange(year) });
        return count;
      },
      bulk: {
        count: (query) => this.em.fork().count(AccessLogEntity, { lastAt: { $lt: query.cutoff } }),
        run: (query) => this.em.fork().nativeDelete(AccessLogEntity, { lastAt: { $lt: query.cutoff } }),
      },
    });
  }

  areaLabel(key: string): LocalizedText {
    return this.areas.areaLabel(key);
  }

  /**
   * Records that the user read protected data of these persons (`null`: of all persons at once). Own data is not logged;
   * during an impersonation the administrator is the reader. Rows of the same user, person, area and day are counted up.
   */
  async record(user: AuthenticatedUser, personIds: readonly (string | null)[], area: string): Promise<void> {
    const reader = user.impersonator?.id ?? user.id;
    const persons = [...new Set(personIds)].filter((id) => id === null || (UUID.test(id) && (user.impersonator || id !== user.personId)));
    if (!persons.length) return;
    const now = new Date();
    const day = berlinDate(now);
    try {
      const values = persons.map(() => '(?, ?, ?, ?, ?, ?, 1, ?, ?)').join(', ');
      const params = persons.flatMap((personId) => [uuidv7(), reader, personId, personId ?? '*', area, day, now, now]);
      await this.em
        .fork()
        .getConnection()
        .execute(
          `insert into "privacy"."access_log" ("id", "user_id", "person_id", "person_key", "area", "day", "count", "first_at", "last_at") values ${values} ` +
            'on conflict ("user_id", "person_key", "area", "day") do update set "count" = "privacy"."access_log"."count" + 1, "last_at" = excluded."last_at"',
          params,
        );
    } catch (error) {
      this.logger.error(`Recording the read log failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Rows of the read log, newest first (at most 2000). For the read log page and the data breach helpers. */
  async query(filter: AccessLogQuery = {}): Promise<AccessLogEntry[]> {
    const where: FilterQuery<AccessLogEntity>[] = [];
    if (filter.from && DATE.test(filter.from)) where.push({ day: { $gte: filter.from } });
    if (filter.to && DATE.test(filter.to)) where.push({ day: { $lte: filter.to } });
    if (filter.userId && UUID.test(filter.userId)) where.push({ userId: filter.userId });
    if (filter.personId && UUID.test(filter.personId)) where.push({ personId: filter.personId });
    if (filter.area) where.push({ area: filter.area });
    const rows = await this.em.fork().find(AccessLogEntity, where.length ? { $and: where } : {}, {
      orderBy: { day: 'desc', lastAt: 'desc' },
      limit: Math.min(Math.max(filter.limit ?? 500, 1), 2000),
    });
    return this.toDtos(rows);
  }

  /** Accesses to the person's protected data (access report: "Zugriffe auf besonders geschützte Daten"). */
  async forPerson(personId: string): Promise<AccessLogEntity[]> {
    return this.em.fork().find(AccessLogEntity, { personId }, { orderBy: { day: 'desc', lastAt: 'desc' } });
  }

  async filters(): Promise<AccessLogFilters> {
    const em = this.em.fork();
    const rows: { user_id: string }[] = await em.getConnection().execute('select distinct "user_id" from "privacy"."access_log"');
    const areas: { area: string }[] = await em.getConnection().execute('select distinct "area" from "privacy"."access_log" order by "area"');
    const ids = rows.map((r) => r.user_id).filter((id) => UUID.test(id));
    const users = ids.length ? await em.find(User, { id: { $in: ids } }, { fields: ['id', 'displayName'] }) : [];
    return {
      users: users.map((u) => ({ id: u.id, name: u.displayName })).toSorted((a, b) => a.name.localeCompare(b.name)),
      areas: [...new Set([...areas.map((a) => a.area), ...this.areas.areaKeys()])].map((key) => ({ key, label: this.areaLabel(key) })),
    };
  }

  private async toDtos(rows: AccessLogEntity[]): Promise<AccessLogEntry[]> {
    const userIds = [...new Set(rows.map((r) => r.userId))].filter((id) => UUID.test(id));
    const personIds = [...new Set(rows.map((r) => r.personId).filter((id): id is string => Boolean(id)))];
    const [users, persons] = await Promise.all([
      userIds.length ? this.em.fork().find(User, { id: { $in: userIds } }, { fields: ['id', 'displayName'] }) : [],
      this.organization.persons(personIds),
    ]);
    const userNames = new Map(users.map((u) => [u.id, u.displayName]));
    const personNames = new Map((persons ?? []).map((person) => [person.id, `${person.lastName}, ${person.firstName}`]));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: userNames.get(r.userId) ?? null,
      personId: r.personId ?? null,
      personName: r.personId ? (personNames.get(r.personId) ?? null) : null,
      area: r.area,
      areaLabel: this.areaLabel(r.area),
      day: r.day,
      count: r.count,
      firstAt: r.firstAt.toISOString(),
      lastAt: r.lastAt.toISOString(),
    }));
  }

  private async yearRange(year: string) {
    const rule = (await this.settings.get<RetentionSettings>('retention'))?.retention[ACCESS_LOG_RETENTION];
    const years = rule?.years ?? 1;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const end = new Date(Date.UTC(Number(year) + 1, 0, 1));
    return { $gte: new Date(Date.UTC(Number(year), 0, 1)), $lt: end < cutoff ? end : cutoff };
  }
}

/** "Verwaltung → Audit-Log → Leseprotokoll": filterable, only with `core.audit.read` (step-up). */
@Controller('privacy/access-log')
@RequirePermissions('core.audit.read')
export class AccessLogController {
  constructor(private readonly log: AccessLogStore) {}

  @Get()
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('personId') personId?: string,
    @Query('area') area?: string,
    @Query('limit') limit?: string,
  ): Promise<AccessLogEntry[]> {
    return this.log.query({ from, to, userId, personId, area, limit: Number(limit) || 500 });
  }

  @Get('filters')
  filters(): Promise<AccessLogFilters> {
    return this.log.filters();
  }
}
