import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, AuditEntry } from '../audit/audit.js';
import { type DeadlineInput, DeadlineRegistry } from '../tasks/deadline-registry.js';

type Handler = (payload: never) => unknown;

const FAILED = 'events.handler-failed';

/**
 * In-process event bus between modules. Publishers call `publish` after their transaction
 * has been committed; handlers run one after the other, and a failing handler does not
 * affect the publisher or other handlers. A handler that fails twice is recorded in the audit log
 * (with event and payload) and shown as a task to those who read the audit log, so derived data
 * (e.g. compensation items) never goes missing unnoticed; the publishing module can send it again.
 */
@Injectable()
export class DomainEvents implements OnModuleInit {
  private readonly logger = new Logger(DomainEvents.name);
  private readonly handlers = new Map<string, Handler[]>();

  constructor(
    private readonly audit: Audit,
    private readonly deadlines: DeadlineRegistry,
    private readonly em: EntityManager,
  ) {}

  onModuleInit(): void {
    this.deadlines.register({ module: 'core', deadlines: () => this.failures() });
  }

  subscribe<T>(event: string, handler: (payload: T) => unknown): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as Handler);
    this.handlers.set(event, list);
    return () => this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h !== handler));
  }

  async publish<T>(event: string, payload: T): Promise<void> {
    for (const handler of this.handlers.get(event) ?? []) {
      const run = () => (handler as (payload: T) => unknown)(payload);
      try {
        await run();
      } catch {
        // One retry for transient problems (e.g. a lock conflict).
        try {
          await run();
        } catch (error) {
          this.logger.error(`Handler for "${event}" failed`, error instanceof Error ? error.stack : String(error));
          await this.audit.log(FAILED, { event, error: error instanceof Error ? error.message : String(error), payload: payload as unknown }).catch(() => undefined);
        }
      }
    }
  }

  /** Failed handlers of the last 30 days as tasks for those who read the audit log. */
  private async failures(): Promise<DeadlineInput[]> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const entries = await this.em.fork().find(AuditEntry, { action: FAILED, timestamp: { $gte: since } }, { orderBy: { timestamp: 'desc' }, limit: 50 });
    return entries.map((e) => ({
      id: `event-failed:${e.id}`,
      kind: 'event-handler-failed',
      title: { de: 'Verarbeitung zwischen Modulen fehlgeschlagen', en: 'Processing between modules failed' },
      subject: { type: 'core.audit', id: String(e.id), label: String(e.details['event'] ?? '') },
      dueOn: e.timestamp.toISOString().slice(0, 10),
      leadDays: 0,
      departmentIds: [],
      permission: 'core.audit.read',
      to: '/admin/audit?action=events.',
    }));
  }
}
