import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, AuditReferenceRegistry, defineModule, HistoryAccessRegistry, LockdownRegistry } from '@forga/core-api';
import { INFO_TERMINAL_MANIFEST, INFO_TERMINAL_READ, INFO_TERMINAL_SETTINGS } from '@forga/info-terminal-contracts';
import { ORGANIZATION_REFERENCES, type OrganizationReferences } from '@forga/masterdata-contracts';
import { INFO_TERMINAL_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { TerminalEntity } from './info-terminal.entities.js';
import { generateDeviceKey, hashDeviceKey } from './security/device-keys.js';
import { KioskController } from './kiosk/kiosk.controller.js';
import { KioskService } from './kiosk/kiosk.service.js';
import { TerminalAuth, TerminalGuard } from './kiosk/terminal-auth.js';
import { TerminalsController } from './terminals/terminals.controller.js';
import { TerminalsService } from './terminals/terminals.service.js';

@Module({
  controllers: [TerminalsController, KioskController],
  providers: [TerminalsService, TerminalAuth, TerminalGuard, KioskService],
})
export class InfoTerminalModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly historyAccess: HistoryAccessRegistry,
    @Inject(ORGANIZATION_REFERENCES) private readonly references: OrganizationReferences,
    private readonly auditReferences: AuditReferenceRegistry,
    private readonly lockdowns: LockdownRegistry,
    private readonly audit: Audit,
  ) {}

  onModuleInit(): void {
    registerAuditReferences(this.auditReferences, this.em);
    // A station with active terminals is deleted only after they are revoked; a deleted department drops out of a terminal.
    this.references.register('info-terminal', (kind, id) =>
      kind === 'station' ? this.em.fork().count(TerminalEntity, { stationId: id, revokedAt: null }) : Promise.resolve(0),
    );
    this.historyAccess.registerPermission('info_terminal.terminal', INFO_TERMINAL_READ);
    this.lockdowns.register('info-terminal', () => this.blockKeys());
  }

  /**
   * Data breach („Alle Sitzungen beenden“): every terminal gets an unknown key, so the devices stop working until a new
   * link is created; the stored link is removed. Terminals and their settings stay.
   */
  private async blockKeys(): Promise<number> {
    const em = this.em.fork();
    const terminals = await em.find(TerminalEntity, { revokedAt: null }, { fields: ['id', 'name'] });
    for (const terminal of terminals) {
      const key = generateDeviceKey();
      await em.nativeUpdate(TerminalEntity, { id: terminal.id }, { keyHash: hashDeviceKey(key), keyPrefix: '', keyEncrypted: null });
    }
    if (terminals.length) await this.audit.log('info-terminal.keys-blocked', { count: terminals.length });
    return terminals.length;
  }
}

export const infoTerminalModule = defineModule({
  manifest: INFO_TERMINAL_MANIFEST,
  nestModule: InfoTerminalModule,
  entities: [TerminalEntity],
  historized: [TerminalEntity],
  migrations: INFO_TERMINAL_MIGRATIONS,
  settings: INFO_TERMINAL_SETTINGS,
});
