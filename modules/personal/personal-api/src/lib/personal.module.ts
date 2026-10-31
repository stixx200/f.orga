import { Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, defineModule, hashSecret, HistoryAccessRegistry, LockdownRegistry } from '@forga/core-api';
import { PERSONAL_MANIFEST, PERSONAL_READ } from '@forga/personal-contracts';
import { PERSONAL_MIGRATIONS } from '../migrations/index.js';
import { AccessAuth, AccessGuard } from './kiosk/access-auth.js';
import { KioskController } from './kiosk/kiosk.controller.js';
import { LinksController } from './links/links.controller.js';
import { LinksService } from './links/links.service.js';
import { AccessLinkEntity } from './personal.entities.js';
import { generateAccessKey } from './security/access-keys.js';

@Module({
  controllers: [LinksController, KioskController],
  providers: [LinksService, AccessAuth, AccessGuard],
})
export class PersonalModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly lockdowns: LockdownRegistry,
    private readonly audit: Audit,
  ) {}

  onModuleInit(): void {
    this.historyAccess.registerPermission('personal.access_link', PERSONAL_READ);
    this.lockdowns.register('personal', () => this.blockKeys());
  }

  /**
   * Data breach („Alle Sitzungen beenden“): every link gets an unknown key and is marked revoked, so phones stop
   * working and the list no longer shows the links as active until a new link is created.
   */
  private async blockKeys(): Promise<number> {
    const em = this.em.fork();
    const links = await em.find(AccessLinkEntity, { revokedAt: null }, { fields: ['id'] });
    for (const link of links) {
      await em.nativeUpdate(AccessLinkEntity, { id: link.id }, { keyHash: hashSecret(generateAccessKey()), keyPrefix: '', keyEncrypted: null, revokedAt: new Date(), revokedBy: 'lockdown' });
    }
    if (links.length) await this.audit.log('personal.keys-blocked', { count: links.length });
    return links.length;
  }
}

export const personalModule = defineModule({
  manifest: PERSONAL_MANIFEST,
  nestModule: PersonalModule,
  entities: [AccessLinkEntity],
  historized: [AccessLinkEntity],
  migrations: PERSONAL_MIGRATIONS,
});
