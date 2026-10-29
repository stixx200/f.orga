import type { AccessReportFixture, SeedResult } from './fixture';
import { seedMasterdata } from './masterdata';
import { seedIncidents } from './incidents';
import { seedTraining } from './training';
import { seedRespiratoryProtection } from './respiratory-protection';
import { seedCompensation } from './compensation';
import { seedEquipment } from './equipment';
import { seedCostRecovery } from './cost-recovery';
import { seedPromotions } from './promotions';
import { seedClothing } from './clothing';
import { seedDutyOfficer } from './duty-officer';
import { seedInfoTerminal } from './info-terminal';
import { seedMpFeuer } from './mp-feuer';
import { seedBackup } from './backup';

/** Seeds per module ID, in the order the test runs them (master data first). */
export const SEEDS: [string, (fx: AccessReportFixture) => Promise<SeedResult>][] = [
  ['masterdata', seedMasterdata],
  ['incidents', seedIncidents],
  ['training', seedTraining],
  ['respiratory-protection', seedRespiratoryProtection],
  ['compensation', seedCompensation],
  ['equipment', seedEquipment],
  ['cost-recovery', seedCostRecovery],
  ['promotions', seedPromotions],
  ['clothing', seedClothing],
  ['duty-officer', seedDutyOfficer],
  ['info-terminal', seedInfoTerminal],
  ['mp-feuer', seedMpFeuer],
  ['backup', seedBackup],
];
