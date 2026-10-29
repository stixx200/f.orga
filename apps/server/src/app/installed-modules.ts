import type { ForgaModule } from '@forga/core-api';
import { mpFeuerModule } from '@forga/mp-feuer-api';
import { backupModule } from '@forga/backup-api';
import { infoTerminalModule } from '@forga/info-terminal-api';
import { dutyOfficerModule } from '@forga/duty-officer-api';
import { clothingModule } from '@forga/clothing-api';
import { promotionsModule } from '@forga/promotions-api';
import { costRecoveryModule } from '@forga/cost-recovery-api';
import { equipmentModule } from '@forga/equipment-api';
import { compensationModule } from '@forga/compensation-api';
import { respiratoryProtectionModule } from '@forga/respiratory-protection-api';
import { trainingModule } from '@forga/training-api';
import { incidentsModule } from '@forga/incidents-api';
import { masterdataModule } from '@forga/masterdata-api';

/** Feature modules built into this server image. */
export const INSTALLED_MODULES: ForgaModule[] = [masterdataModule, incidentsModule, trainingModule, respiratoryProtectionModule, compensationModule, equipmentModule, costRecoveryModule, promotionsModule, clothingModule, dutyOfficerModule, infoTerminalModule, mpFeuerModule, backupModule];
