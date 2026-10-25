import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry } from '@forga/core-api';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { RESPIRATORY_PROTECTION_FITNESS, RESPIRATORY_PROTECTION_MANIFEST, RESPIRATORY_PROTECTION_SETTINGS } from '@forga/respiratory-protection-contracts';
import { RESPIRATORY_PROTECTION_MIGRATIONS } from '../migrations/index.js';
import { RespiratoryProtectionData } from './data/respiratory-protection.data.js';
import { EvidenceController } from './evidence/evidence.controller.js';
import { EvidenceService, EXAMINATIONS, READ } from './evidence/evidence.service.js';
import { ExaminationsImport } from './imports/examinations.import.js';
import { StressExercisesImport } from './imports/stress-exercises.import.js';
import { RespiratoryProtectionLists } from './lists/respiratory-protection.lists.js';
import { EvidenceEntity, StatusEntity } from './respiratory-protection.entities.js';

/** Global, so other modules can inject `RESPIRATORY_PROTECTION_FITNESS`. */
@Global()
@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService, RespiratoryProtectionLists, RespiratoryProtectionData, ExaminationsImport, StressExercisesImport, { provide: RESPIRATORY_PROTECTION_FITNESS, useExisting: EvidenceService }],
  exports: [RESPIRATORY_PROTECTION_FITNESS],
})
export class RespiratoryProtectionModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly evidence: EvidenceService,
    private readonly lists: ListRegistry,
    private readonly moduleLists: RespiratoryProtectionLists,
    private readonly deadlines: DeadlineRegistry,
    private readonly exports: ExportRegistry,
    private readonly imports: ImportRegistry,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly data: RespiratoryProtectionData,
    private readonly examinations: ExaminationsImport,
    private readonly stressExercises: StressExercisesImport,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  onModuleInit(): void {
    for (const definition of this.moduleLists.definitions()) this.lists.register('respiratory-protection', definition);
    this.deadlines.register(this.data);
    this.exports.register('respiratory-protection', { all: () => this.data.exportAll(), person: (id) => this.data.exportPerson(id) });
    this.imports.register('respiratory-protection', this.examinations.profile());
    this.imports.register('respiratory-protection', this.stressExercises.profile());
    // History of evidence: examinations only with the permission for health data.
    this.historyAccess.register('respiratory_protection.evidence', async (user, id) => {
      const evidence = await this.em.fork().findOne(EvidenceEntity, id);
      if (!evidence) return { allowed: false };
      const [person] = await this.directory.snapshots([evidence.personId]);
      return { allowed: Boolean(person) && this.evidence.can(user, evidence.kind === 'examination' ? EXAMINATIONS : READ, person!) };
    });
  }
}

export const respiratoryProtectionModule = defineModule({
  manifest: RESPIRATORY_PROTECTION_MANIFEST,
  nestModule: RespiratoryProtectionModule,
  entities: [EvidenceEntity, StatusEntity],
  historized: [EvidenceEntity],
  migrations: RESPIRATORY_PROTECTION_MIGRATIONS,
  settings: RESPIRATORY_PROTECTION_SETTINGS,
});
