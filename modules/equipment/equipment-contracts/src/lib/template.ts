import type { CategoryInput, EquipmentTypeInput, InspectionType } from './equipment.js';

const c = (key: string, de: string, en: string, extra: Partial<CategoryInput> = {}): CategoryInput => ({ key, name: { de, en }, ...extra });
const i = (key: string, de: string, en: string, intervalMonths: number | null, inspector: InspectionType['inspector'] = 'competent-person', trigger: InspectionType['trigger'] = 'periodic', checklist: string[] = []): InspectionType => ({
  key, name: { de, en }, intervalMonths, inspector, trigger, checklist,
});
const t = (key: string, de: string, en: string, categoryKey: string, inspections: InspectionType[], properties: string[] = []): EquipmentTypeInput => ({ key, name: { de, en }, categoryKey, inspections, properties });

const VISUAL = ['Sichtprüfung äußerer Zustand', 'Funktion', 'Kennzeichnung lesbar'];

/** Category tree of a volunteer brigade. */
export const DGUV_CATEGORIES: CategoryInput[] = [
  c('breathing', 'Atemschutz', 'Breathing apparatus', { breathingApparatus: true, lockWhenOverdue: true }),
  // Hoses as single items by default, so each hose has its own inspection record (template option `hoseTracking`).
  c('hoses', 'Schläuche und Armaturen', 'Hoses and fittings'),
  c('ladders', 'Leitern', 'Ladders'),
  c('rescue', 'Rettungsgeräte', 'Rescue equipment'),
  c('electrical', 'Elektro', 'Electrical'),
  c('extinguishers', 'Feuerlöscher', 'Fire extinguishers'),
  c('pumps', 'Pumpen', 'Pumps'),
  c('radio', 'Funk und Messgeräte', 'Radio and measuring devices'),
  c('consumables', 'Verbrauchsmaterial', 'Consumables', { tracking: 'stock' }),
];

/** Equipment types with inspections per DGUV Grundsatz 305-002 (2021, table 1). */
export const DGUV_TYPES: EquipmentTypeInput[] = [
  t('full-face-mask', 'Vollmaske', 'Full face mask', 'breathing', [i('mask-check', 'Prüfung Vollmaske', 'Mask inspection', 6, 'competent-person', 'periodic', ['Dichtheit', 'Ausatemventil', 'Sichtscheibe']), i('mask-after-use', 'Reinigung und Prüfung nach Gebrauch', 'Cleaning and check after use', null, 'competent-person', 'after-use')]),
  t('scba', 'Pressluftatmer', 'Self-contained breathing apparatus', 'breathing', [i('scba-check', 'Sicht- und Funktionsprüfung', 'Visual and function check', 6, 'competent-person', 'periodic', ['Hochdruckdichtheit', 'Warnsignal', 'Lungenautomat']), i('scba-overhaul', 'Grundüberholung', 'Overhaul', 72, 'expert'), i('scba-after-use', 'Prüfung nach Gebrauch', 'Check after use', null, 'competent-person', 'after-use')]),
  t('air-cylinder', 'Atemluftflasche', 'Breathing air cylinder', 'breathing', [i('cylinder-check', 'Sichtprüfung', 'Visual check', 1), i('cylinder-pressure', 'Festigkeitsprüfung', 'Pressure test', 60, 'expert')], ['Füllmenge', 'Druck']),
  t('chemical-suit', 'Chemikalienschutzanzug Typ 1', 'Chemical protection suit type 1', 'breathing', [i('csa-check', 'Prüfung', 'Inspection', 12), i('csa-leak', 'Dichtheitsprüfung', 'Leak test', 12)]),
  t('pressure-hose-b', 'Druckschlauch B', 'Pressure hose B', 'hoses', [i('hose-washing', 'Druckprüfung nach Wäsche', 'Pressure test after washing', null, 'competent-person', 'after-washing')], ['Länge']),
  t('pressure-hose-c', 'Druckschlauch C', 'Pressure hose C', 'hoses', [i('hose-washing', 'Druckprüfung nach Wäsche', 'Pressure test after washing', null, 'competent-person', 'after-washing')], ['Länge']),
  t('suction-hose', 'Saugschlauch', 'Suction hose', 'hoses', [i('annual', 'Jährliche Prüfung', 'Annual inspection', 12)]),
  t('portable-ladder', 'Tragbare Leiter', 'Portable ladder', 'ladders', [i('ladder-visual', 'Sichtprüfung', 'Visual check', 12, 'competent-person', 'periodic', VISUAL), i('ladder-load', 'Belastungsprüfung', 'Load test', 24)]),
  t('hydraulic-rescue', 'Hydraulisches Rettungsgerät', 'Hydraulic rescue tool', 'rescue', [i('annual', 'Jährliche Prüfung', 'Annual inspection', 12), i('rescue-load', 'Belastungsprüfung', 'Load test', 36)]),
  t('lifting-bag', 'Hebekissen', 'Lifting bag', 'rescue', [i('annual', 'Jährliche Prüfung', 'Annual inspection', 12), i('bag-pressure', 'Druckprüfung', 'Pressure test', 60)]),
  t('fall-protection', 'Absturzsicherung', 'Fall protection', 'rescue', [i('fall-check', 'Prüfung durch Sachkundigen', 'Inspection by expert', 12, 'fall-protection-expert')]),
  t('generator', 'Stromerzeuger', 'Generator', 'electrical', [i('electrical', 'Elektrische Prüfung', 'Electrical test', 12, 'electrician')]),
  t('cable-reel', 'Leitungsroller', 'Cable reel', 'electrical', [i('electrical', 'Elektrische Prüfung', 'Electrical test', 12, 'electrician')]),
  t('floodlight', 'Strahler', 'Floodlight', 'electrical', [i('electrical', 'Elektrische Prüfung', 'Electrical test', 12, 'electrician')]),
  t('chainsaw', 'Motorsäge', 'Chainsaw', 'rescue', [i('annual', 'Jährliche Prüfung', 'Annual inspection', 12)]),
  t('extinguisher', 'Feuerlöscher', 'Fire extinguisher', 'extinguishers', [i('extinguisher-check', 'Prüfung', 'Inspection', 24)]),
  t('portable-pump', 'Tragkraftspritze', 'Portable pump', 'pumps', [i('annual', 'Jährliche Prüfung', 'Annual inspection', 12)]),
  t('handheld-radio', 'Handfunkgerät', 'Handheld radio', 'radio', [i('radio-check', 'Funktionsprüfung', 'Function check', 6, 'user')]),
  t('gas-detector', 'Gasmessgerät', 'Gas detector', 'radio', [i('calibration', 'Kalibrierung nach Hersteller', 'Calibration per manufacturer', 12, 'expert')]),
  t('fuel-can', 'Kraftstoffkanister PE', 'Fuel can PE', 'consumables', [i('can-check', 'Sichtprüfung', 'Visual check', 6)]),
  t('oil-binder', 'Ölbindemittel (Sack)', 'Oil binder (bag)', 'consumables', []),
];

/**
 * Vehicle types of the master data catalog (template BW) by weight class, for taking over the vehicles: up to 3.5 t
 * and over 3.5 t up to 7.5 t; all other vehicle types count as over 7.5 t. Typical classes, to be checked per vehicle.
 */
export const LIGHT_VEHICLE_TYPES = ['kdow', 'mtw'];
export const MEDIUM_VEHICLE_TYPES = ['tsf', 'tsf-w', 'mlf', 'elw-1'];

/** Template type of a vehicle type of the master data: `fire-vehicle-light`, `fire-vehicle-medium` or `fire-vehicle`. */
export function vehicleTemplateType(vehicleType: string): string {
  if (LIGHT_VEHICLE_TYPES.includes(vehicleType)) return 'fire-vehicle-light';
  if (MEDIUM_VEHICLE_TYPES.includes(vehicleType)) return 'fire-vehicle-medium';
  return 'fire-vehicle';
}
