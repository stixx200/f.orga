import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';
import { FalseAlarmType, MainType, TechnicalCategory } from './statistics.js';

export const CompensationKind = z.enum(['incident', 'standby', 'fire-watch']);
export type CompensationKind = z.infer<typeof CompensationKind>;

/**
 * An alarm keyword of the dispatch centre with the defaults it implies:
 * statistics pre-fill, vehicle requirement for personnel and compensation kind.
 */
export const AlarmKeywordInput = z.object({
  key: z.string().trim().min(1).max(40),
  name: LocalizedText,
  /** `null` = incidents with this keyword are not counted (e.g. fire watch, "Sonstiges"). */
  mainType: MainType.nullable().default(null),
  technicalCategory: TechnicalCategory.nullable().default(null),
  falseAlarmType: FalseAlarmType.nullable().default(null),
  /** Personnel must be on a vehicle or on standby (not for fire watches, security services …). */
  requiresVehicle: z.boolean().default(true),
  compensationKind: CompensationKind.default('incident'),
  active: z.boolean().default(true),
});
export type AlarmKeywordInput = z.input<typeof AlarmKeywordInput>;

export const AlarmKeyword = z.object({
  id: z.string(),
  key: z.string(),
  name: LocalizedText,
  mainType: MainType.nullable(),
  technicalCategory: TechnicalCategory.nullable(),
  falseAlarmType: FalseAlarmType.nullable(),
  requiresVehicle: z.boolean(),
  compensationKind: CompensationKind,
  active: z.boolean(),
  version: z.number(),
});
export type AlarmKeyword = z.infer<typeof AlarmKeyword>;

const k = (
  key: string,
  de: string,
  en: string,
  extra: Omit<AlarmKeywordInput, 'key' | 'name'> = {},
): AlarmKeywordInput => ({ key, name: { de, en }, ...extra });

/** Common keywords of dispatch centres in Baden-Württemberg; adapt to the local dispatch centre. */
export const BW_KEYWORD_TEMPLATE: AlarmKeywordInput[] = [
  k('B1', 'Brand klein', 'Small fire', { mainType: 'fire' }),
  k('B2', 'Brand mittel', 'Medium fire', { mainType: 'fire' }),
  k('B3', 'Brand groß', 'Large fire', { mainType: 'fire' }),
  k('B-BMA', 'Brandmeldeanlage', 'Fire alarm system', { mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' }),
  k('B-PKW', 'Fahrzeugbrand', 'Vehicle fire', { mainType: 'fire' }),
  k('TH1', 'Technische Hilfe klein', 'Technical assistance small', { mainType: 'technical-assistance', technicalCategory: 'other' }),
  k('TH2', 'Technische Hilfe mittel', 'Technical assistance medium', { mainType: 'technical-assistance', technicalCategory: 'other' }),
  k('TH-Person', 'Person in Not', 'Person in distress', { mainType: 'technical-assistance', technicalCategory: 'rescue-persons' }),
  k('TH-VU', 'Verkehrsunfall eingeklemmte Person', 'Traffic accident, person trapped', { mainType: 'technical-assistance', technicalCategory: 'rescue-persons' }),
  k('TH-Öl', 'Ölspur', 'Oil trace', { mainType: 'technical-assistance', technicalCategory: 'oil-trace' }),
  k('TH-Tier', 'Tierrettung', 'Animal rescue', { mainType: 'technical-assistance', technicalCategory: 'animal-rescue' }),
  k('TH-Insekten', 'Insekten', 'Insects', { mainType: 'technical-assistance', technicalCategory: 'insects' }),
  k('TH-Wasser', 'Wasser / Unwetter', 'Flood / severe weather', { mainType: 'technical-assistance', technicalCategory: 'flood-weather' }),
  k('TH-Sturm', 'Sturmschaden', 'Storm damage', { mainType: 'technical-assistance', technicalCategory: 'storm' }),
  k('ABC', 'Gefahrstoff', 'Hazardous materials', { mainType: 'technical-assistance', technicalCategory: 'hazardous-materials' }),
  k('RD-Unterstützung', 'Unterstützung Rettungsdienst', 'Ambulance support', { mainType: 'technical-assistance', technicalCategory: 'other' }),
  k('BSW', 'Brandsicherheitswache', 'Fire watch', { requiresVehicle: false, compensationKind: 'fire-watch' }),
  k('Sicherheitsdienst', 'Sicherheitsdienst', 'Security service', { requiresVehicle: false }),
  k('Sonstiges', 'Sonstiges', 'Other', { requiresVehicle: false }),
];
