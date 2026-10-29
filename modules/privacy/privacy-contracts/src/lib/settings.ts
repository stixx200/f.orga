import type { SettingsAccess } from '@forga/core-contracts';
import { PrivacyConsents } from './consents.js';
import { PRIVACY_PERMISSION, PrivacyContacts, PrivacySelfService, PrivacyTexts } from './privacy.js';
import { PrivacyActivities } from './register.js';

/** Settings sections of the module (`/api/core/settings/<section>`); texts, register and consents have own endpoints. */
export const PRIVACY_SETTINGS = {
  'privacy.contacts': PrivacyContacts,
  'privacy.texts': PrivacyTexts,
  'privacy.selfServiceAccess': PrivacySelfService,
  'privacy.activities': PrivacyActivities,
  'privacy.consents': PrivacyConsents,
} as const;

/** Only for `privacy.manage`, not `core.settings.manage`. */
export const PRIVACY_SETTINGS_ACCESS: Record<string, SettingsAccess> = {
  'privacy.contacts': { managersOnly: true, managers: [PRIVACY_PERMISSION] },
  'privacy.texts': { managersOnly: true, managers: [PRIVACY_PERMISSION], dedicatedEndpoint: true },
  'privacy.selfServiceAccess': { managersOnly: true, managers: [PRIVACY_PERMISSION] },
  'privacy.activities': { managersOnly: true, managers: [PRIVACY_PERMISSION], dedicatedEndpoint: true },
  'privacy.consents': { managersOnly: true, managers: [PRIVACY_PERMISSION], dedicatedEndpoint: true },
};
