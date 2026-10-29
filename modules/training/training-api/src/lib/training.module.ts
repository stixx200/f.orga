import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Attachments, AuditReferenceRegistry, DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry, PersonDataRegistry, RetentionRegistry, SearchRegistry } from '@forga/core-api';
import { TRAINING_CASUALTIES, TRAINING_MANIFEST, TRAINING_SESSIONS, TRAINING_SETTINGS, TRAINING_TERMINAL_CHECK_IN } from '@forga/training-contracts';
import { TRAINING_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { TrainingData } from './data/training.data.js';
import { TrainingRetention } from './data/training.retention.js';
import { SessionsImport } from './imports/sessions.import.js';
import { TrainingLists } from './lists/training.lists.js';
import { SessionsController } from './sessions/sessions.controller.js';
import { TrainingSelfController } from './sessions/self.controller.js';
import { ATTENDANCE, PLAN, READ, SessionsService } from './sessions/sessions.service.js';
import { TerminalCheckInService } from './sessions/terminal-check-in.service.js';
import { AttendanceEntity, SessionEntity, SessionTypeEntity } from './training.entities.js';

/** Global, so other modules can inject `TRAINING_CASUALTIES`, `TRAINING_SESSIONS` and `TRAINING_TERMINAL_CHECK_IN`. */
@Global()
@Module({
  controllers: [SessionsController, TrainingSelfController],
  providers: [SessionsService, TrainingLists, TrainingData, TrainingRetention, SessionsImport, { provide: TRAINING_CASUALTIES, useExisting: SessionsService }, { provide: TRAINING_SESSIONS, useExisting: SessionsService },
    TerminalCheckInService, { provide: TRAINING_TERMINAL_CHECK_IN, useExisting: TerminalCheckInService },
  ],
  exports: [TRAINING_CASUALTIES, TRAINING_SESSIONS, TRAINING_TERMINAL_CHECK_IN],
})
export class TrainingModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionsService,
    private readonly lists: ListRegistry,
    private readonly trainingLists: TrainingLists,
    private readonly deadlines: DeadlineRegistry,
    private readonly search: SearchRegistry,
    private readonly exports: ExportRegistry,
    private readonly imports: ImportRegistry,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly data: TrainingData,
    private readonly sessionsImport: SessionsImport,
    private readonly attachments: Attachments,
    private readonly personData: PersonDataRegistry,
    private readonly auditReferences: AuditReferenceRegistry,
    private readonly retention: RetentionRegistry,
    private readonly retentionCategory: TrainingRetention,
  ) {}

  onModuleInit(): void {
    registerAuditReferences(this.auditReferences, this.em);
    for (const definition of this.trainingLists.definitions()) this.lists.register('training', definition);
    this.deadlines.register(this.data);
    this.search.register('training', (user, query) => this.data.search(user, query));
    this.exports.register('training', { all: () => this.data.exportAll(), person: (id) => this.data.exportPerson(id) });
    this.personData.register('training', { anonymize: (ids) => this.data.anonymize(ids) });
    this.retentionCategory.register(this.retention);
    this.imports.register('training', this.sessionsImport.profile());
    this.imports.registerLookup('training', this.sessionsImport.lookup());
    this.historyAccess.register('training.session', async (user, id) => {
      const session = await this.em.fork().findOne(SessionEntity, id);
      return { allowed: Boolean(session) && this.sessions.can(user, READ, session!) };
    });
    this.historyAccess.registerPermission('training.session_type', 'training.settings.manage');
    // Photos and documents of a session: readable like the session, added by those who plan it or record attendance.
    const session = (id: string) => this.em.fork().findOne(SessionEntity, id);
    this.attachments.register('training.session', {
      read: async (user, id) => {
        const s = await session(id);
        return Boolean(s) && this.sessions.can(user, READ, s!);
      },
      write: async (user, id) => {
        const s = await session(id);
        return Boolean(s) && (this.sessions.can(user, PLAN, s!) || this.sessions.can(user, ATTENDANCE, s!));
      },
    });
  }
}

export const trainingModule = defineModule({
  manifest: TRAINING_MANIFEST,
  nestModule: TrainingModule,
  entities: [SessionTypeEntity, SessionEntity, AttendanceEntity],
  historized: [SessionTypeEntity, SessionEntity, { entity: AttendanceEntity, parent: 'session' }],
  migrations: TRAINING_MIGRATIONS,
  settings: TRAINING_SETTINGS,
  // Whoever knows the feed token reads all sessions without logging in: only for the managers of the settings.
  settingsAccess: { 'training.general': { managerFields: ['feedToken'] } },
});
