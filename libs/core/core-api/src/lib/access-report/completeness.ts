import type { ModuleManifest } from '@forga/core-contracts';

/**
 * Startup check like the one of the history: a module declaring personal data (`privacy.personData`) must describe it
 * for the access report (`describePerson`) and erase and anonymise it (`PersonDataRegistry`: `erasure`, `erase`,
 * `anonymize`); its processing activities must be named after the module.
 */
export function assertPersonDataComplete(
  modules: readonly { manifest: ModuleManifest }[],
  checks: { describes: (moduleId: string) => boolean; anonymizes: (moduleId: string) => boolean },
): void {
  const undescribed: string[] = [];
  const unanonymized: string[] = [];
  const misnamed: string[] = [];
  for (const { manifest } of modules) {
    const privacy = manifest.privacy;
    if (!privacy) continue;
    if (privacy.personData && !checks.describes(manifest.id)) undescribed.push(manifest.id);
    if (privacy.personData && !checks.anonymizes(manifest.id)) unanonymized.push(manifest.id);
    misnamed.push(...(privacy.activities ?? []).map((a) => a.key).filter((key) => !key.startsWith(`${manifest.id}.`)));
  }
  if (undescribed.length || unanonymized.length || misnamed.length) {
    throw new Error(
      `Personal data: ${undescribed.join(', ') || '–'} declare personal data but do not describe it (describePerson); ${unanonymized.join(', ') || '–'} declare personal data but do not erase and anonymise it (PersonDataRegistry); activities named after other modules: ${misnamed.join(', ') || '–'}.`,
    );
  }
}
