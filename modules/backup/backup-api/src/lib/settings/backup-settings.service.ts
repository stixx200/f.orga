import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { decryptSecret, encryptSecret, serverKey, Setting, SettingsService } from '@forga/core-api';
import { BACKUP_SETTINGS_SECTION, BackupSettings, type BackupSettingsInput, type BackupSettingsView } from '@forga/backup-contracts';
import { BackupError, passphraseId } from '../format/backup-format.js';
import { resolveTarget } from '../backups/rules.js';
import { backupEnvironment } from '../runtime/environment.js';

/** Stored besides the settings: the encrypted passphrase (write-only), its fingerprint and the installation's ID. */
interface StoredSecrets {
  passphraseEncrypted?: string | null;
  passphraseId?: string | null;
  instanceId?: string;
}

export interface LoadedSettings {
  settings: BackupSettings;
  /** The section has been saved at least once. */
  saved: boolean;
  secrets: StoredSecrets;
}

/**
 * Settings `backup.general` in `core.setting` (history with `••••••` for the passphrase). The passphrase is stored
 * encrypted with `FORGA_SECRET_KEY`, so scheduled backups run without input; it never leaves the server.
 */
@Injectable()
export class BackupSettingsService {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
  ) {}

  async load(): Promise<LoadedSettings> {
    const stored = await this.em.fork().findOne(Setting, { section: BACKUP_SETTINGS_SECTION });
    const value = (stored?.value ?? {}) as Record<string, unknown>;
    const parsed = BackupSettings.safeParse(value);
    return {
      settings: parsed.success ? parsed.data : BackupSettings.parse({}),
      saved: Boolean(stored),
      secrets: { passphraseEncrypted: (value['passphraseEncrypted'] as string | undefined) ?? null, passphraseId: (value['passphraseId'] as string | undefined) ?? null, instanceId: value['instanceId'] as string | undefined },
    };
  }

  /** The stored passphrase; `null` without one or if it cannot be decrypted (server key missing or changed). */
  passphraseOf(loaded: LoadedSettings): string | null {
    const key = serverKey();
    return key && loaded.secrets.passphraseEncrypted ? decryptSecret(loaded.secrets.passphraseEncrypted, key) : null;
  }

  async view(loaded?: LoadedSettings): Promise<BackupSettingsView> {
    const current = loaded ?? (await this.load());
    return {
      ...current.settings,
      passphraseSet: Boolean(current.secrets.passphraseEncrypted),
      passphraseId: current.secrets.passphraseId ?? null,
      passphraseUnreadable: Boolean(current.secrets.passphraseEncrypted) && !this.passphraseOf(current),
    };
  }

  /** ID of this installation in its backups; created on first use. */
  async instanceId(): Promise<string> {
    const loaded = await this.load();
    if (loaded.secrets.instanceId) return loaded.secrets.instanceId;
    const id = randomUUID();
    await this.write({ ...loaded.settings, ...loaded.secrets, instanceId: id });
    return id;
  }

  private async write(value: Record<string, unknown>): Promise<void> {
    await this.settings.set(BACKUP_SETTINGS_SECTION, value);
  }

  async save(input: BackupSettingsInput & { passphraseKeptSafe: boolean; unencryptedConfirmed: boolean }): Promise<BackupSettingsView> {
    const { passphrase, passphraseRepeat, passphraseKeptSafe, unencryptedConfirmed, ...rest } = input;
    const settings = BackupSettings.parse(rest);
    const root = backupEnvironment.root();
    try {
      resolveTarget(root ?? '/backups', settings.targetPath);
    } catch (error) {
      if (error instanceof BackupError) throw new BadRequestException({ code: error.code });
      throw error;
    }
    const loaded = await this.load();
    const secrets: StoredSecrets = { ...loaded.secrets };
    if (passphrase) {
      if (passphrase !== passphraseRepeat) throw new BadRequestException({ code: 'backup.passphraseMismatch' });
      if (!passphraseKeptSafe) throw new BadRequestException({ code: 'backup.passphraseNotConfirmed' });
      const key = serverKey();
      if (!key) throw new BadRequestException({ code: 'backup.noSecretKey' });
      secrets.passphraseEncrypted = encryptSecret(passphrase, key);
      secrets.passphraseId = await passphraseId(passphrase);
    }
    if (!settings.encryption && loaded.settings.encryption !== false && !unencryptedConfirmed) throw new BadRequestException({ code: 'backup.unencryptedNotConfirmed' });
    // The encrypted passphrase is write-only: an empty value keeps the stored one (see SECRET_SETTING_FIELDS).
    await this.write({ ...settings, passphraseEncrypted: secrets.passphraseEncrypted ?? undefined, passphraseId: secrets.passphraseId ?? null, ...(secrets.instanceId ? { instanceId: secrets.instanceId } : {}) });
    return this.view();
  }
}
