import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Settings of the backup module from the environment (see the operating manual). */
export const backupEnvironment = {
  /** Folder below which targets may lie (`FORGA_BACKUP_ROOT`, e.g. the volume `/backups`); `null` = not set up. */
  root: (): string | null => process.env['FORGA_BACKUP_ROOT']?.trim() || null,
  /** Name of this installation in file names and backups, e.g. `real` or `test` (`FORGA_INSTANCE`). */
  instance: (): string => process.env['FORGA_INSTANCE']?.trim() || 'forga',
  /** Marker of the maintenance mode; survives the restart of the container, not its recreation. */
  maintenanceFile: (): string => process.env['FORGA_MAINTENANCE_FILE']?.trim() || join(tmpdir(), 'forga-maintenance'),
  /** `FORGA_BACKUP_SCHEDULER=off`: no scheduled backups (tests, test system). */
  schedulerEnabled: (): boolean => process.env['FORGA_BACKUP_SCHEDULER'] !== 'off',
  /** `FORGA_RESTORE_EXIT=off`: the process does not end after a restore (tests). */
  exitAfterRestore: (): boolean => process.env['FORGA_RESTORE_EXIT'] !== 'off',
};
