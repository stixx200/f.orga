import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { Attachments, HistoryEntry, type RetentionCandidate, type RetentionExportRecord, type RetentionQuery, RetentionRegistry } from '@forga/core-api';
import { AttendanceEntity, SessionEntity, SessionTypeEntity } from '../training.entities.js';

const ATTACHMENTS = 'training.session';
const berlinDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(date);

/**
 * Retention of the sessions, per kind of session: e.g. minutes of committee meetings for 30 years, staff meetings for 5.
 * Attendance, attachments (minutes as PDF) and history go with the session; records of the breathing apparatus module
 * taken from a session stay as records of their own.
 */
@Injectable()
export class TrainingRetention {
  constructor(
    private readonly em: EntityManager,
    private readonly attachments: Attachments,
  ) {}

  register(registry: RetentionRegistry): void {
    registry.registerCategory({
      key: 'training.sessions',
      module: 'training',
      name: { de: 'Dienste', en: 'Sessions' },
      description: { de: 'Dienste mit Anwesenheit und Anhängen (z. B. Protokolle)', en: 'Sessions with attendance and attachments (e.g. minutes)' },
      event: { de: 'Beginn', en: 'Start' },
      actions: ['offer-archive', 'delete', 'none'],
      subtypeMode: 'optional',
      subtypes: async () =>
        (await this.em.fork().find(SessionTypeEntity, {}, { orderBy: { sortOrder: 'asc', key: 'asc' } })).map((t) => ({ key: t.key, name: t.name, description: null })),
      otherName: { de: 'Übrige Dienste', en: 'Other sessions' },
      candidates: (query) => this.candidates(query),
      export: (ids) => this.export(ids),
      execute: (ids) => this.delete(ids),
    });
  }

  private async candidates(query: RetentionQuery): Promise<RetentionCandidate[]> {
    const type = query.subtype ? { type: query.subtype } : query.ownSubtypes.length ? { type: { $nin: [...query.ownSubtypes] } } : {};
    const sessions = await this.em.fork().find(SessionEntity, { startsAt: { $lt: query.cutoff }, ...type }, { orderBy: { startsAt: 'asc' } });
    const counts = await this.attachments.count(ATTACHMENTS, sessions.map((s) => s.id));
    return sessions.map((s) => ({
      id: s.id,
      label: s.title,
      neutralLabel: s.title,
      eventDate: berlinDay(s.startsAt),
      attachments: counts.get(s.id) ?? 0,
    }));
  }

  private async export(ids: readonly string[]): Promise<RetentionExportRecord[]> {
    const em = this.em.fork();
    const sessions = await em.find(SessionEntity, { id: { $in: [...ids] } }, { populate: ['attendance'] });
    const types = new Map((await em.find(SessionTypeEntity, {})).map((t) => [t.key, t.name]));
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      fields: [
        { label: { de: 'Art', en: 'Kind' }, value: types.get(s.type)?.de ?? s.type },
        { label: { de: 'Beginn', en: 'Start' }, value: s.startsAt.toISOString() },
        { label: { de: 'Ende', en: 'End' }, value: s.endsAt.toISOString() },
        { label: { de: 'Thema', en: 'Topic' }, value: s.topic },
        { label: { de: 'Anwesend', en: 'Present' }, value: String(s.attendance.getItems().filter((a) => a.status === 'present').length) },
      ],
      data: { session: { ...wrap(s).toObject(), attendance: undefined }, attendance: s.attendance.getItems().map((a) => wrap(a).toObject()) },
      attachments: [{ ownerType: ATTACHMENTS, ownerId: s.id }],
    }));
  }

  private async delete(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    const attendance = await em.find(AttendanceEntity, { session: { $in: [...ids] } }, { fields: ['id'] });
    await this.attachments.removeFor(ATTACHMENTS, ids);
    await em.nativeDelete(HistoryEntry, {
      $or: [
        { entity: 'training.session', entityId: { $in: [...ids] } },
        { parentEntity: 'training.session', parentId: { $in: [...ids] } },
        ...(attendance.length ? [{ entity: 'training.attendance', entityId: { $in: attendance.map((a) => a.id) } }] : []),
      ],
    });
    // Attendance goes with the session (foreign key with cascade).
    return em.nativeDelete(SessionEntity, { id: { $in: [...ids] } });
  }
}
