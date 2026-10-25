import type { CatalogEntryInput } from '../catalog.js';

type Entry = Omit<CatalogEntryInput, 'kind'>;

const entries = (kind: CatalogEntryInput['kind'], list: Entry[]): CatalogEntryInput[] =>
  list.map((entry, index) => ({ ...entry, kind, sortOrder: (index + 1) * 10 }));

/** Ranks of volunteer firefighters, VwV Feuerwehrbekleidung und Dienstgrade BW (27.09.2022), Anlage 2. */
const RANKS: Entry[] = [
  { key: 'probation', name: { de: 'Feuerwehrmann/-frau (Probezeit)', en: 'Firefighter (probation)' }, attributes: { abbreviation: '', level: 0 } },
  { key: 'fm', name: { de: 'Feuerwehrmann/-frau', en: 'Firefighter' }, attributes: { abbreviation: 'FM', level: 1 } },
  { key: 'ofm', name: { de: 'Oberfeuerwehrmann/-frau', en: 'Senior firefighter' }, attributes: { abbreviation: 'OFM', level: 2 } },
  { key: 'hfm', name: { de: 'Hauptfeuerwehrmann/-frau', en: 'Chief firefighter' }, attributes: { abbreviation: 'HFM', level: 3 } },
  { key: 'lm', name: { de: 'Löschmeister/-in', en: 'Löschmeister' }, attributes: { abbreviation: 'LM', level: 4 } },
  { key: 'olm', name: { de: 'Oberlöschmeister/-in', en: 'Oberlöschmeister' }, attributes: { abbreviation: 'OLM', level: 5 } },
  { key: 'hlm', name: { de: 'Hauptlöschmeister/-in', en: 'Hauptlöschmeister' }, attributes: { abbreviation: 'HLM', level: 6 } },
  { key: 'bm', name: { de: 'Brandmeister/-in', en: 'Brandmeister' }, attributes: { abbreviation: 'BM', level: 7 } },
  { key: 'obm', name: { de: 'Oberbrandmeister/-in', en: 'Oberbrandmeister' }, attributes: { abbreviation: 'OBM', level: 8 } },
  { key: 'hbm', name: { de: 'Hauptbrandmeister/-in', en: 'Hauptbrandmeister' }, attributes: { abbreviation: 'HBM', level: 9 } },
  { key: 'lhbm', name: { de: 'Leitende/-r Hauptbrandmeister/-in', en: 'Leitender Hauptbrandmeister' }, attributes: { abbreviation: 'LHBM', level: 10 } },
];

const QUALIFICATIONS: Entry[] = [
  { key: 'truppmann-1', name: { de: 'Truppmann Teil 1', en: 'Basic training part 1' } },
  { key: 'truppmann-2', name: { de: 'Truppmann Teil 2', en: 'Basic training part 2' } },
  { key: 'radio-operator', name: { de: 'Sprechfunker', en: 'Radio operator' } },
  { key: 'breathing-apparatus', name: { de: 'Atemschutzgeräteträger', en: 'Breathing apparatus wearer' } },
  { key: 'chemical-suit', name: { de: 'CSA-Träger', en: 'Chemical protection suit wearer' } },
  { key: 'machinist', name: { de: 'Maschinist', en: 'Pump operator' } },
  { key: 'aerial-ladder-operator', name: { de: 'Maschinist Drehleiter', en: 'Aerial ladder operator' } },
  { key: 'squad-leader', name: { de: 'Truppführer', en: 'Squad leader' } },
  { key: 'group-leader', name: { de: 'Gruppenführer', en: 'Group leader' } },
  { key: 'platoon-leader', name: { de: 'Zugführer', en: 'Platoon leader' } },
  { key: 'unit-leader', name: { de: 'Verbandsführer', en: 'Unit leader' } },
  { key: 'equipment-officer', name: { de: 'Gerätewart', en: 'Equipment officer' } },
  { key: 'breathing-apparatus-officer', name: { de: 'Atemschutzgerätewart', en: 'Breathing apparatus officer' } },
  { key: 'youth-group-leader', name: { de: 'Jugendgruppenleiter', en: 'Youth group leader' } },
  { key: 'instructor', name: { de: 'Ausbilder', en: 'Instructor' } },
  // Musicians (VwV Feuerwehrmusik): the promotion rules accept these instead of the operational courses.
  { key: 'music-basic', name: { de: 'Musik: Grundausbildung', en: 'Music: basic training' } },
  { key: 'music-d2', name: { de: 'Musik: Lehrgang D2', en: 'Music: course D2' } },
  { key: 'music-d3', name: { de: 'Musik: Lehrgang D3', en: 'Music: course D3' } },
  { key: 'music-c1', name: { de: 'Musik: Lehrgang C1', en: 'Music: course C1' } },
  { key: 'music-c2', name: { de: 'Musik: Lehrgang C2', en: 'Music: course C2' } },
].map((entry) => ({ ...entry, attributes: { validityMonths: null } }));

const FUNCTIONS: Entry[] = [
  { key: 'incident-commander', name: { de: 'Einsatzleiter', en: 'Incident commander' }, attributes: { abbreviation: 'EL' } },
  { key: 'duty-officer', name: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' }, attributes: { abbreviation: 'EvD' } },
  { key: 'platoon-leader', name: { de: 'Zugführer', en: 'Platoon leader' }, attributes: { abbreviation: 'ZF' } },
  { key: 'group-leader', name: { de: 'Gruppenführer', en: 'Group leader' }, attributes: { abbreviation: 'GF' } },
  { key: 'unit-leader', name: { de: 'Einheitsführer', en: 'Unit leader' }, attributes: { abbreviation: 'EF' } },
  { key: 'machinist', name: { de: 'Maschinist', en: 'Pump operator' }, attributes: { abbreviation: 'MA' } },
  { key: 'messenger', name: { de: 'Melder', en: 'Messenger' }, attributes: { abbreviation: 'ME' } },
  { key: 'attack-team', name: { de: 'Angriffstrupp', en: 'Attack team' }, attributes: { abbreviation: 'AT' } },
  { key: 'water-team', name: { de: 'Wassertrupp', en: 'Water team' }, attributes: { abbreviation: 'WT' } },
  { key: 'hose-team', name: { de: 'Schlauchtrupp', en: 'Hose team' }, attributes: { abbreviation: 'ST' } },
  { key: 'safety-team', name: { de: 'Sicherheitstrupp', en: 'Safety team' }, attributes: { abbreviation: 'SiTr' } },
  { key: 'command-support', name: { de: 'Führungsgehilfe', en: 'Command support' }, attributes: { abbreviation: 'FüGe' } },
  { key: 'breathing-apparatus-control', name: { de: 'Atemschutzüberwachung', en: 'Breathing apparatus control' }, attributes: { abbreviation: 'AÜ' } },
  { key: 'crew', name: { de: 'Mannschaft', en: 'Crew' }, attributes: { abbreviation: '' } },
  { key: 'psychosocial-support', name: { de: 'PSNV / Peer', en: 'Psychosocial support' }, attributes: { abbreviation: 'PSNV' } },
];

const VEHICLE_TYPES: Entry[] = [
  { key: 'kdow', name: { de: 'KdoW', en: 'KdoW' }, attributes: { crew: '1/1', seats: 2, statisticsCategory: 'F98' } },
  { key: 'elw-1', name: { de: 'ELW 1', en: 'ELW 1' }, attributes: { crew: '1/2', seats: 3, statisticsCategory: 'F99' } },
  { key: 'mtw', name: { de: 'MTW', en: 'MTW' }, attributes: { crew: '1/8', seats: 9, statisticsCategory: 'F107' } },
  { key: 'tsf', name: { de: 'TSF', en: 'TSF' }, attributes: { crew: '1/5', seats: 6, statisticsCategory: 'F63' } },
  { key: 'tsf-w', name: { de: 'TSF-W', en: 'TSF-W' }, attributes: { crew: '1/5', seats: 6, statisticsCategory: 'F64' } },
  { key: 'mlf', name: { de: 'MLF', en: 'MLF' }, attributes: { crew: '1/5', seats: 6, statisticsCategory: 'F65' } },
  { key: 'lf-8-6', name: { de: 'LF 8/6', en: 'LF 8/6' }, attributes: { crew: '1/8', seats: 9, statisticsCategory: 'F67' } },
  { key: 'lf-10', name: { de: 'LF 10 / HLF 10', en: 'LF 10 / HLF 10' }, attributes: { crew: '1/8', seats: 9, statisticsCategory: 'F67' } },
  { key: 'lf-20', name: { de: 'LF 20', en: 'LF 20' }, attributes: { crew: '1/8', seats: 9, statisticsCategory: 'F68' } },
  { key: 'lf-20-16', name: { de: 'LF 20/16 / HLF 20', en: 'LF 20/16 / HLF 20' }, attributes: { crew: '1/8', seats: 9, statisticsCategory: 'F70' } },
  { key: 'lf-kats', name: { de: 'LF KatS', en: 'LF KatS' }, attributes: { crew: '1/8', seats: 9, statisticsCategory: 'F69' } },
  { key: 'tlf-3000', name: { de: 'TLF 3000', en: 'TLF 3000' }, attributes: { crew: '1/2', seats: 3, statisticsCategory: 'F73' } },
  { key: 'dlak-23-12', name: { de: 'DLA(K) 23-12', en: 'DLA(K) 23-12' }, attributes: { crew: '1/2', seats: 3, statisticsCategory: 'F84' } },
  { key: 'rw', name: { de: 'RW', en: 'RW' }, attributes: { crew: '1/2', seats: 3, statisticsCategory: 'F88' } },
  { key: 'gw-l1', name: { de: 'GW-L1', en: 'GW-L1' }, attributes: { crew: '1/2', seats: 3, statisticsCategory: 'F106' } },
  { key: 'gw-l2', name: { de: 'GW-L2', en: 'GW-L2' }, attributes: { crew: '1/2', seats: 3, statisticsCategory: 'F106' } },
  { key: 'wlf', name: { de: 'WLF', en: 'WLF' }, attributes: { crew: '1/2', seats: 3, statisticsCategory: 'F104' } },
  { key: 'mzb', name: { de: 'Mehrzweckboot', en: 'Multi-purpose boat' }, attributes: { crew: '', seats: 0, statisticsCategory: 'F109' } },
  { key: 'trailer', name: { de: 'Anhänger', en: 'Trailer' }, attributes: { crew: '', seats: 0, statisticsCategory: 'F113' } },
];

const HONORS: Entry[] = [
  { key: 'state-honor-silver', name: { de: 'Feuerwehr-Ehrenzeichen BW in Silber (25 Jahre)', en: 'BW fire service decoration, silver (25 years)' } },
  { key: 'state-honor-gold', name: { de: 'Feuerwehr-Ehrenzeichen BW in Gold (40 Jahre)', en: 'BW fire service decoration, gold (40 years)' } },
  { key: 'district-honor', name: { de: 'Ehrennadel des Kreisfeuerwehrverbands', en: 'District association badge of honour' } },
  { key: 'lfv-honor', name: { de: 'Ehrenzeichen des Landesfeuerwehrverbands', en: 'State association decoration' } },
  { key: 'dfv-honor-cross', name: { de: 'Deutsches Feuerwehr-Ehrenkreuz', en: 'German fire service cross of honour' } },
  { key: 'honorary-member', name: { de: 'Ehrenmitglied', en: 'Honorary member' } },
  { key: 'honorary-commander', name: { de: 'Ehrenkommandant', en: 'Honorary commander' } },
].map((entry) => ({ ...entry, attributes: {} }));

const EXIT_REASONS: Entry[] = [
  { key: 'age-limit', name: { de: 'Altersgrenze', en: 'Age limit' } },
  { key: 'own-request', name: { de: 'Auf eigenen Wunsch', en: 'Own request' } },
  { key: 'relocation', name: { de: 'Wegzug', en: 'Relocation' } },
  { key: 'health', name: { de: 'Gesundheitliche Gründe', en: 'Health reasons' } },
  { key: 'probation-failed', name: { de: 'Probezeit nicht bestanden', en: 'Probation not passed' } },
  { key: 'exclusion', name: { de: 'Ausschluss', en: 'Exclusion' } },
  { key: 'death', name: { de: 'Tod', en: 'Death' } },
].map((entry) => ({ ...entry, attributes: {} }));

/** Offices (Ämter) per FwG BW; the keys match the function allowances of the compensation module. */
const OFFICES: Entry[] = [
  { key: 'commander', name: { de: 'Kommandant', en: 'Commander' } },
  { key: 'deputy-commander', name: { de: 'Stv. Kommandant', en: 'Deputy commander' } },
  { key: 'department-commander', name: { de: 'Abteilungskommandant', en: 'Department commander' } },
  { key: 'deputy-department-commander', name: { de: 'Stv. Abteilungskommandant', en: 'Deputy department commander' } },
  { key: 'youth-warden', name: { de: 'Jugendfeuerwehrwart', en: 'Youth fire brigade warden' } },
  { key: 'youth-group-leader', name: { de: 'Jugendgruppenleiter', en: 'Youth group leader' } },
  { key: 'breathing-apparatus-officer', name: { de: 'Atemschutzgerätewart', en: 'Breathing apparatus officer' } },
  { key: 'equipment-officer', name: { de: 'Gerätewart', en: 'Equipment officer' } },
  { key: 'secretary', name: { de: 'Schriftführer', en: 'Secretary' } },
  { key: 'clothing-officer', name: { de: 'Kleiderwart', en: 'Clothing officer' } },
  { key: 'music-leader', name: { de: 'Musikleiter', en: 'Music leader' } },
].map((entry) => ({ ...entry, attributes: {} }));

/** Catalog template for fire brigades in Baden-Württemberg. Applying it only adds missing keys. */
export const BW_CATALOG_TEMPLATE: CatalogEntryInput[] = [
  ...entries('rank', RANKS),
  ...entries('qualification', QUALIFICATIONS),
  ...entries('function', FUNCTIONS),
  ...entries('vehicle-type', VEHICLE_TYPES),
  ...entries('honor', HONORS),
  ...entries('exit-reason', EXIT_REASONS),
  ...entries('office', OFFICES),
];
