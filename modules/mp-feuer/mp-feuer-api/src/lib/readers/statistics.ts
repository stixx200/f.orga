import { type FalseAlarmType, type FireSize, IncidentStatistics, type IncidentStatisticsInput, type TechnicalCategory } from '@forga/incidents-contracts';

/** Counts and type of the MP-Feuer export that complete the statistics key. */
export interface MpFeuerCounts {
  rescued?: string;
  dead?: string;
  animalsRescued?: string;
  incidentType?: string;
}

const FIRE_SIZES: [RegExp, FireSize][] = [
  [/kleinbr(a|ä)nde?\s*a/i, 'small-a'],
  [/kleinbr(a|ä)nde?\s*b/i, 'small-b'],
  [/mittelbr(a|ä)nd/i, 'medium'],
  [/gro(ß|ss)br(a|ä)nd/i, 'large'],
];

/** "TH1-Menschenrettung" … "TH8-sonstiger Art", numbered like the state template (F38–F45). */
const TECHNICAL: Record<string, TechnicalCategory> = {
  '1': 'rescue-persons',
  '2': 'hazardous-materials',
  '3': 'oil-trace',
  '4': 'animal-rescue',
  '5': 'insects',
  '6': 'flood-weather',
  '7': 'storm',
  '8': 'other',
};

const FALSE_ALARMS: [RegExp, FalseAlarmType][] = [
  [/bma|brandmelde/i, 'fire-alarm-system'],
  [/b(ö|oe)swillig|missbr/i, 'malicious'],
  [/t(ä|ae)uschung|gutgl(ä|ae)ubig/i, 'good-faith'],
];

const count = (value: string | undefined) => {
  const n = Number((value ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/**
 * Statistics features from the MP-Feuer statistics key ("#L TH1-Menschenrettung", "#L Kleinbrände A",
 * "#L Fehlalarm.BMA", "#L TH-Überlandhilfe", "#L Sonstige Einsätze"); `null` for an empty or unknown key.
 */
export function statisticsFromMpFeuer(key: string | undefined, counts: MpFeuerCounts = {}): IncidentStatistics | null {
  const text = (key ?? '').replace(/^#\w*\s*/, '').trim();
  if (!text) return null;
  const base: Omit<IncidentStatisticsInput, 'mainType'> = {
    rescued: count(counts.rescued),
    dead: count(counts.dead),
    animalsRescued: count(counts.animalsRescued),
    trafficAccident: /verkehrsunfall/i.test(counts.incidentType ?? ''),
  };

  let input: IncidentStatisticsInput | null = null;
  const fire = FIRE_SIZES.find(([pattern]) => pattern.test(text));
  if (fire) input = { ...base, mainType: 'fire', fireSize: fire[1] };
  else if (/^fehlalarm/i.test(text)) {
    const type = FALSE_ALARMS.find(([pattern]) => pattern.test(text));
    if (type) input = { ...base, mainType: 'false-alarm', falseAlarmType: type[1] };
  } else if (/^th/i.test(text)) {
    const number = /^th\s*(\d)/i.exec(text)?.[1];
    if (number && TECHNICAL[number]) input = { ...base, mainType: 'technical-assistance', technicalCategory: TECHNICAL[number] };
    // Assistance in another municipality is counted apart from the own incidents (F27).
    else if (/(ü|ue)berland/i.test(text)) input = { ...base, mainType: 'technical-assistance', technicalCategory: 'other', ownMunicipality: false };
  } else if (/^sonstig/i.test(text)) input = { ...base, mainType: 'other' };

  if (!input) return null;
  const parsed = IncidentStatistics.safeParse(input);
  return parsed.success ? parsed.data : null;
}

const flag = (value: boolean) => (value ? 'ja' : 'nein');

/** The statistics as columns of the profile `incidents.personnel` (codes, `ja`/`nein`, numbers); empty without key. */
export function statisticsColumns(key: string | undefined, counts: MpFeuerCounts = {}): Record<string, string> {
  const statistics = statisticsFromMpFeuer(key, counts);
  if (!statistics) return {};
  return {
    mainType: statistics.mainType,
    fireSize: statistics.fireSize ?? '',
    technicalCategory: statistics.technicalCategory ?? '',
    falseAlarmType: statistics.falseAlarmType ?? '',
    ownMunicipality: flag(statistics.ownMunicipality),
    vehicleFire: flag(statistics.vehicleFire),
    trafficAccident: flag(statistics.trafficAccident),
    rescued: String(statistics.rescued),
    rescuedSmokeInhalation: String(statistics.rescuedSmokeInhalation),
    dead: String(statistics.dead),
    animalsRescued: String(statistics.animalsRescued),
  };
}
