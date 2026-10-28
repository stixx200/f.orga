import type { ImportMessage } from '@forga/core-contracts';
import { FalseAlarmType, FireSize, IncidentStatistics, MainType, type ReportStatus, TechnicalCategory } from '@forga/incidents-contracts';

/** Compared like column headings (`normalizeHeading` of the core): case, umlauts and punctuation do not matter. */
const normalizeHeading = (text: string) => text.toLowerCase().replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss').replace(/[^a-z0-9]/g, '');

const YES = new Set(['ja', 'j', 'yes', 'y', 'true', 'wahr', '1', 'x', '✓', '✔', '☑']);
const NO = new Set(['nein', 'n', 'no', 'false', 'falsch', '0']);
export const yes = (value: string | undefined) => YES.has((value ?? '').trim().toLowerCase());

/** Names of the codes in the state template (German and English), as the UI shows them. */
const NAMES: Record<string, [string, string][]> = {
  mainType: [
    ['fire', 'Brand / Explosion'], ['fire', 'Brand'], ['fire', 'Fire / explosion'], ['technical-assistance', 'Technische Hilfe'], ['technical-assistance', 'Technical assistance'],
    ['false-alarm', 'Fehlalarm'], ['false-alarm', 'False alarm'], ['other', 'Sonstiges'], ['other', 'Sonstige Einsätze'], ['other', 'Other'],
  ],
  fireSize: [
    ['small-a', 'Kleinbrand A'], ['small-a', 'Small fire A'], ['small-b', 'Kleinbrand B'], ['small-b', 'Small fire B'], ['medium', 'Mittelbrand'], ['medium', 'Medium fire'],
    ['large', 'Großbrand'], ['large', 'Large fire'],
  ],
  technicalCategory: [
    ['rescue-persons', 'Menschenrettung'], ['rescue-persons', 'Rescue of persons'], ['hazardous-materials', 'Gefahrstoff'], ['hazardous-materials', 'Hazardous materials'],
    ['oil-trace', 'Ölspur'], ['oil-trace', 'Oil trace'], ['animal-rescue', 'Tierrettung'], ['animal-rescue', 'Animal rescue'], ['insects', 'Insekten'], ['insects', 'Insects'],
    ['flood-weather', 'Hochwasser / Unwetter'], ['flood-weather', 'Flood / severe weather'], ['storm', 'Sturm'], ['storm', 'Storm'], ['other', 'sonstige Technische Hilfe'],
    ['other', 'Other technical assistance'],
  ],
  falseAlarmType: [
    ['good-faith', 'in gutem Glauben'], ['good-faith', 'in good faith'], ['malicious', 'böswillig'], ['malicious', 'malicious'], ['fire-alarm-system', 'Brandmeldeanlage'],
    ['fire-alarm-system', 'Fire alarm system'],
  ],
};

const CODES: Record<string, readonly string[]> = {
  mainType: MainType.options,
  fireSize: FireSize.options,
  technicalCategory: TechnicalCategory.options,
  falseAlarmType: FalseAlarmType.options,
};

/** A code of the field, given as code or as its name; `undefined` if unknown. */
function code(field: string, value: string): string | undefined {
  const text = value.trim();
  if (CODES[field].includes(text)) return text;
  const wanted = normalizeHeading(text);
  return NAMES[field].find(([, name]) => normalizeHeading(name) === wanted)?.[0];
}

/** Statistics columns of the profile `incidents.personnel` (one per feature of `IncidentStatistics`). */
export const STATISTICS_FIELDS = [
  ['mainType', 'Statistik: Einsatzhauptart', 'Statistics: main type'],
  ['fireSize', 'Statistik: Brandgröße', 'Statistics: fire size'],
  ['technicalCategory', 'Statistik: Art der Technischen Hilfe', 'Statistics: technical assistance'],
  ['falseAlarmType', 'Statistik: Fehlalarm', 'Statistics: false alarm'],
  ['ownMunicipality', 'Statistik: eigene Gemeinde', 'Statistics: own municipality'],
  ['vehicleFire', 'Statistik: Fahrzeugbrand', 'Statistics: vehicle fire'],
  ['trafficAccident', 'Statistik: Verkehrsunfall', 'Statistics: traffic accident'],
  ['rescued', 'Statistik: gerettete Personen', 'Statistics: rescued persons'],
  ['rescuedSmokeInhalation', 'Statistik: davon Rauchgas', 'Statistics: of them smoke inhalation'],
  ['dead', 'Statistik: Tote', 'Statistics: dead'],
  ['animalsRescued', 'Statistik: gerettete Tiere', 'Statistics: rescued animals'],
] as const;

const count = (value: string | undefined) => {
  const n = Number((value ?? '').trim() || '0');
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
};

/**
 * The statistics of the row: `null` without main type; otherwise the features or, if they are incomplete or unknown,
 * a message `incidents.import.invalidStatistics` (the statistics stay as they are).
 */
export function statisticsOf(values: Record<string, string>): { statistics: IncidentStatistics | null; message?: ImportMessage } {
  if (!(values['mainType'] ?? '').trim()) return { statistics: null };
  const input: Record<string, unknown> = {};
  for (const field of ['mainType', 'fireSize', 'technicalCategory', 'falseAlarmType']) {
    const text = (values[field] ?? '').trim();
    if (!text) continue;
    const value = code(field, text);
    if (!value) return { statistics: null, message: { code: 'incidents.import.invalidStatistics', params: { field, value: text } } };
    input[field] = value;
  }
  for (const field of ['vehicleFire', 'trafficAccident']) input[field] = yes(values[field]);
  const own = (values['ownMunicipality'] ?? '').trim().toLowerCase();
  input['ownMunicipality'] = !NO.has(own);
  for (const field of ['rescued', 'rescuedSmokeInhalation', 'dead', 'animalsRescued']) {
    const n = count(values[field]);
    if (Number.isNaN(n)) return { statistics: null, message: { code: 'incidents.import.invalidStatistics', params: { field, value: values[field] ?? '' } } };
    input[field] = n;
  }
  const parsed = IncidentStatistics.safeParse(input);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? 'mainType');
    return { statistics: null, message: { code: 'incidents.import.invalidStatistics', params: { field, value: values[field] ?? '' } } };
  }
  return { statistics: parsed.data };
}

const STATUS_NAMES: [ReportStatus, string][] = [
  ['draft', 'Entwurf'], ['draft', 'Draft'], ['released-compensation', 'Freigabe Entschädigung'], ['released-compensation', 'Released for compensation'],
  ['released-billing', 'Freigabe Abrechnung'], ['released-billing', 'Released for billing'],
];

/**
 * Release status from a code (`draft`, `released-compensation`, `released-billing`) or its name; other texts by their
 * words ("… zur Abrechnung freigegeben", "Entschädigung …"), else a draft.
 */
export function statusOf(text: string | undefined): ReportStatus {
  const value = (text ?? '').trim();
  if (value === 'draft' || value === 'released-compensation' || value === 'released-billing') return value;
  const named = STATUS_NAMES.find(([, name]) => normalizeHeading(name) === normalizeHeading(value));
  if (named) return named[0];
  const lower = value.toLowerCase();
  if (lower.includes('abrechnung') || lower.includes('billing')) return 'released-billing';
  if (lower.includes('entschädigung') || lower.includes('auszahlung') || lower.includes('compensation')) return 'released-compensation';
  return 'draft';
}
