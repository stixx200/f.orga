import { Injectable } from '@nestjs/common';
import { berlinDayEnd, wordsWhere } from '@forga/core-api';
import { EntityManager, wrap } from '@mikro-orm/core';
import type { AuthenticatedUser, DeadlineInput, DeadlineProvider } from '@forga/core-api';
import type { SearchHit } from '@forga/core-contracts';
import { AttendanceEntity, SessionEntity, SessionTypeEntity } from '../training.entities.js';
import { ATTENDANCE, CLOSE, READ, SessionsService } from '../sessions/sessions.service.js';

const DAY = 86_400_000;

/** Search, export and deadlines of the training module. */
@Injectable()
export class TrainingData implements DeadlineProvider {
  readonly module = 'training';

  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionsService,
  ) {}

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const visible = this.sessions.visible(user, READ);
    if (!visible) return [];
    const words = wordsWhere(query, ['title', 'topic']);
    if (!words) return [];
    const found = await this.em.fork().find(SessionEntity, { $and: [visible, words] } as never, { orderBy: { startsAt: 'desc' }, limit: 6 });
    return found.map((s) => ({
      id: s.id,
      group: { de: 'Dienste', en: 'Sessions' },
      title: s.title,
      description: s.startsAt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
      to: `/training/sessions/${s.id}`,
    }));
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const plain = async <T extends object>(entity: new () => T) => (await em.find(entity, {})).map((e) => wrap(e).toObject());
    return { sessionTypes: await plain(SessionTypeEntity), sessions: await plain(SessionEntity), attendance: await plain(AttendanceEntity) };
  }

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const rows = await this.em.fork().find(AttendanceEntity, { personId }, { populate: ['session'] });
    return { attendance: rows.map((a) => ({ ...wrap(a).toObject(), session: { id: a.session.id, title: a.session.title, startsAt: a.session.startsAt } })) };
  }

  /** Past sessions without attendance (for those who record it) and held sessions not closed after 14 days. */
  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const now = berlinDayEnd(asOf);
    const sessions = await this.em.fork().find(SessionEntity, { status: { $in: ['planned', 'held'] }, endsAt: { $lt: now } });
    return sessions.map((s) => {
      const held = s.status === 'held';
      const due = new Date(s.endsAt.getTime() + (held ? 14 : 2) * DAY).toISOString().slice(0, 10);
      return {
        id: `${held ? 'close' : 'attendance'}:${s.id}`,
        kind: held ? 'session-close' : 'session-attendance',
        title: held ? { de: 'Dienst abschließen', en: 'Close session' } : { de: 'Anwesenheit erfassen', en: 'Record attendance' },
        subject: { type: 'training.session', id: s.id, label: `${s.title} (${s.startsAt.toISOString().slice(0, 10)})` },
        dueOn: due,
        leadDays: 14,
        departmentIds: s.departmentIds,
        permission: held ? CLOSE : ATTENDANCE,
      };
    });
  }
}
