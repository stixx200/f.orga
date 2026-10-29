import type { ModuleManifest } from '@forga/core-contracts';

/**
 * Startup check like the one of the history: a module declaring personal data (`privacy.personData`) must describe it
 * for the access report (`describePerson`) or anonymise it (`PersonDataRegistry`); its processing activities must be
 * named after the module.
 */
export function assertPersonDataComplete(modules: readonly { manifest: ModuleManifest }[], handled: (moduleId: string) => boolean): void {
  const missing: string[] = [];
  const misnamed: string[] = [];
  for (const { manifest } of modules) {
    const privacy = manifest.privacy;
    if (!privacy) continue;
    if (privacy.personData && !handled(manifest.id)) missing.push(manifest.id);
    misnamed.push(...(privacy.activities ?? []).map((a) => a.key).filter((key) => !key.startsWith(`${manifest.id}.`)));
  }
  if (missing.length || misnamed.length) {
    throw new Error(
      `Personal data: ${missing.join(', ') || '–'} declare personal data but neither describe it (describePerson) nor anonymise it; activities named after other modules: ${misnamed.join(', ') || '–'}.`,
    );
  }
}
