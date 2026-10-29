import { Injectable, Logger } from '@nestjs/common';
import type { LocalizedText } from '@forga/core-contracts';
import { ModuleStateService } from '../module/modules.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';

/** Stores the reads of the read log; provided by the module `privacy`. */
export interface AccessRecorder {
  module: string;
  record(user: AuthenticatedUser, personIds: readonly (string | null)[], area: string): Promise<void>;
}

/** Areas of the core; modules register theirs with `AccessLog.registerArea`. */
const CORE_AREAS: Record<string, LocalizedText> = {
  'core.export': { de: 'Vollexport bzw. Auskunft als JSON', en: 'Full export or access as JSON' },
};

/**
 * Read log (L15) as seen by the modules: they register the areas with especially protected data and record reads of
 * them (`record`). The module `privacy` stores the reads and shows the log; while it is inactive (or not installed)
 * nothing is recorded. Recording never fails the request that read the data.
 */
@Injectable()
export class AccessLog {
  private readonly areas = new Map<string, LocalizedText>(Object.entries(CORE_AREAS));
  private recorder: AccessRecorder | null = null;
  private readonly logger = new Logger('AccessLog');

  constructor(private readonly modules: ModuleStateService) {}

  /** Called by the module `privacy`. */
  registerRecorder(recorder: AccessRecorder): void {
    this.recorder = recorder;
  }

  /** Name of an area of the read log, e.g. `respiratory-protection.examinations` → "Eignungsuntersuchungen". */
  registerArea(key: string, label: LocalizedText): void {
    this.areas.set(key, label);
  }

  areaLabel(key: string): LocalizedText {
    return this.areas.get(key) ?? { de: key, en: key };
  }

  areaKeys(): string[] {
    return [...this.areas.keys()];
  }

  /**
   * Records that the user read protected data of these persons (`null`: of all persons at once). Own data is not logged;
   * during an impersonation the administrator is the reader.
   */
  async record(user: AuthenticatedUser, personIds: readonly (string | null)[], area: string): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) return;
    try {
      if ((await this.modules.inactiveIds()).has(recorder.module)) return;
      await recorder.record(user, personIds, area);
    } catch (error) {
      this.logger.error(`Recording the read log failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
