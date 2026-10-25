/**
 * Fills a running f.orga instance with demo data through the public API:
 * organization, one user per standard role (department roles linked to fitting persons of Musterstadt), groups, course
 * planning (runs, nominations, targets), bank accounts with made-up IBANs, persons and incidents, protective equipment of the clothing store (imported from generated files in the
 * format of the MP-Feuer exports `Personal.xlsx` and `MP-EXCEL.xlsx`) and a duty roster calendar.
 *
 * All persons and incidents are made up; a fixed random seed keeps them identical between runs, so running
 * the script again only updates what changed.
 *
 *   npm run seed
 *   npm run seed -- --only clothing      (only the clothing store, into an instance with persons)
 *   FORGA_URL=http://localhost:3000 FORGA_ADMIN_USER=admin FORGA_ADMIN_PASSWORD=… npm run seed
 *   FORGA_SETUP_TOKEN=… npm run seed     (empty instance: the setup token from the server log or its environment)
 */
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { VWV_2022_RULES } from '@forga/promotions-contracts';
import { BW_TEMPLATE } from '@forga/cost-recovery-contracts';
import { SAMPLE_STATUTE } from '@forga/compensation-contracts';
import { BW_MEMBERSHIP_TEMPLATE } from '@forga/masterdata-contracts';

const BASE = (process.env['FORGA_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = { username: process.env['FORGA_ADMIN_USER'] ?? 'admin', password: process.env['FORGA_ADMIN_PASSWORD'] ?? 'sehr-geheim-123' };
const BRIGADE = 'Freiwillige Feuerwehr Musterstadt';
const USER_PASSWORD = process.env['FORGA_SEED_PASSWORD'] ?? 'demo-passwort-2026';

// --- deterministic random numbers ---------------------------------------------------------------

let state = 0;
/** Each step starts from its own seed, so skipping work in one step does not change the data of the next. */
const reseed = (seed: number) => {
  state = seed;
};
function random(): number {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (probability: number) => random() < probability;

// --- HTTP ---------------------------------------------------------------------------------------

let cookie = '';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: { 'x-forga': '1', cookie, ...(body instanceof FormData || body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

interface ImportResult {
  counts: Record<string, number>;
  rows: { row: number; action: string; label: string; messages: { code: string; params?: Record<string, unknown> }[] }[];
}

async function importFile(fileName: string, content: Buffer | string, profile: string, options: Record<string, boolean> = {}): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', new Blob([content]), fileName);
  const upload = await call<{ id: string; suggestions: Record<string, Record<string, string>> }>('POST', 'core/imports', form);
  const result = await call<ImportResult>('POST', `core/imports/${upload.id}/apply`, { profile, mapping: upload.suggestions[profile], options });
  const errors = result.rows.filter((r) => r.action === 'error');
  console.log(`  ${fileName} → ${profile}: ${JSON.stringify(result.counts)}`);
  for (const error of errors.slice(0, 5)) console.log(`    Zeile ${error.row} ${error.label}: ${error.messages.map((m) => m.code).join(', ')}`);
  return result;
}

async function xlsx(headers: string[], rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Export');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// --- dates (local time Europe/Berlin as written by MP-Feuer) ------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const localText = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateText = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (days: number) => isoDate(new Date(Date.now() - days * 86_400_000));
const icsTime = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

// --- organization -------------------------------------------------------------------------------

interface DepartmentPlan {
  name: string;
  shortName: string;
  type: 'operational' | 'veterans' | 'youth';
  parent?: string;
  postalCode: string;
  persons: number;
  station?: { name: string; street: string };
  vehicles: { designation: string; radioCallSign: string; vehicleType: string; licensePlate: string }[];
}

const DEPARTMENTS: DepartmentPlan[] = [
  {
    name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational', postalCode: '12345', persons: 48,
    station: { name: 'Feuerwehrhaus Musterstadt', street: 'Am Feuerwehrhaus 1' },
    vehicles: [
      { designation: 'KdoW', radioCallSign: 'Florian Musterstadt 1/10', vehicleType: 'kdow', licensePlate: 'MS-FE 110' },
      { designation: 'ELW 1', radioCallSign: 'Florian Musterstadt 1/11', vehicleType: 'elw-1', licensePlate: 'MS-FE 111' },
      { designation: 'HLF 20', radioCallSign: 'Florian Musterstadt 1/46', vehicleType: 'lf-20-16', licensePlate: 'MS-FE 146' },
      { designation: 'LF 10', radioCallSign: 'Florian Musterstadt 1/44', vehicleType: 'lf-10', licensePlate: 'MS-FE 144' },
      { designation: 'DLA(K) 23-12', radioCallSign: 'Florian Musterstadt 1/33', vehicleType: 'dlak-23-12', licensePlate: 'MS-FE 133' },
      { designation: 'MTW', radioCallSign: 'Florian Musterstadt 1/19', vehicleType: 'mtw', licensePlate: 'MS-FE 119' },
    ],
  },
  {
    name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational', postalCode: '12345', persons: 20,
    station: { name: 'Feuerwehrhaus Ahornfeld', street: 'Dorfstraße 12' },
    vehicles: [{ designation: 'TSF-W', radioCallSign: 'Florian Musterstadt 2/47', vehicleType: 'tsf-w', licensePlate: 'MS-FE 247' }],
  },
  {
    name: 'Abteilung Birkenhain', shortName: 'Birkenhain', type: 'operational', postalCode: '12345', persons: 26,
    station: { name: 'Feuerwehrhaus Birkenhain', street: 'Rathausplatz 3' },
    vehicles: [
      { designation: 'LF 10', radioCallSign: 'Florian Musterstadt 3/44', vehicleType: 'lf-10', licensePlate: 'MS-FE 344' },
      { designation: 'MTW', radioCallSign: 'Florian Musterstadt 3/19', vehicleType: 'mtw', licensePlate: 'MS-FE 319' },
    ],
  },
  {
    name: 'Abteilung Weidenhain', shortName: 'Weidenhain', type: 'operational', postalCode: '12345', persons: 18,
    station: { name: 'Feuerwehrhaus Weidenhain', street: 'Schulstraße 5' },
    vehicles: [{ designation: 'TSF', radioCallSign: 'Florian Musterstadt 4/48', vehicleType: 'tsf', licensePlate: 'MS-FE 448' }],
  },
  { name: 'Altersabteilung Musterstadt', shortName: 'Alters Musterstadt', type: 'veterans', parent: 'Abteilung Musterstadt', postalCode: '12345', persons: 12, vehicles: [] },
  { name: 'Jugendfeuerwehr Musterstadt', shortName: 'JF Musterstadt', type: 'youth', parent: 'Abteilung Musterstadt', postalCode: '12345', persons: 14, vehicles: [] },
];

// --- persons ------------------------------------------------------------------------------------

const FIRST_MALE = ['Lukas', 'Jonas', 'Felix', 'Tobias', 'Michael', 'Andreas', 'Stefan', 'Thomas', 'Daniel', 'Florian', 'Markus', 'Simon', 'David', 'Johannes', 'Matthias', 'Benedikt', 'Fabian', 'Niklas', 'Tim', 'Moritz', 'Philipp', 'Sebastian', 'Christian', 'Martin', 'Patrick'];
const FIRST_FEMALE = ['Anna', 'Lena', 'Julia', 'Laura', 'Sarah', 'Katharina', 'Lisa', 'Sophie', 'Marie', 'Hannah', 'Christina', 'Theresa', 'Johanna', 'Eva', 'Carina'];
const LAST = ['Müller', 'Schmid', 'Schneider', 'Fischer', 'Weber', 'Maier', 'Wagner', 'Becker', 'Hofmann', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Braun', 'Zimmermann', 'Krüger', 'Hartmann', 'Lang', 'Walter', 'Huber', 'Kaiser', 'Fuchs', 'Seitz', 'Mayer', 'Brenner', 'Gretz', 'Ott', 'Rieger', 'Haug', 'Engel', 'Kuhn', 'Graf', 'Vogel', 'Ziegler', 'Frank', 'Eberle', 'Rapp'];
const STREETS = ['Hauptstraße', 'Kirchstraße', 'Schulstraße', 'Bahnhofstraße', 'Gartenweg', 'Lindenstraße', 'Bergstraße', 'Mühlweg', 'Uferstraße', 'Wiesenweg', 'Ahornweg', 'Am Ahornfeld', 'Rosenstraße', 'Brunnenstraße'];

interface PlannedPerson {
  personnelNumber: string;
  salutation: string;
  firstName: string;
  lastName: string;
  department: DepartmentPlan;
  birthDate: Date;
  joinedOn: Date;
  status: string;
}

function planPersons(): PlannedPerson[] {
  reseed(20261023);
  const persons: PlannedPerson[] = [];
  const names = new Set<string>();
  let number = 1001;
  const now = new Date();
  for (const department of DEPARTMENTS) {
    for (let i = 0; i < department.persons; i++) {
      const female = chance(0.18);
      let firstName = '';
      let lastName = '';
      do {
        firstName = pick(female ? FIRST_FEMALE : FIRST_MALE);
        lastName = pick(LAST);
      } while (names.has(`${firstName} ${lastName}`));
      names.add(`${firstName} ${lastName}`);
      const age = department.type === 'youth' ? between(10, 16) : department.type === 'veterans' ? between(66, 82) : between(18, 62);
      const birthDate = new Date(now.getFullYear() - age, between(0, 11), between(1, 28));
      const joinAge = department.type === 'youth' ? between(10, age) : Math.min(age, between(10, 30));
      const joinedOn = new Date(Math.min(new Date(birthDate.getFullYear() + joinAge, between(0, 11), 1).getTime(), now.getTime()));
      const probation = department.type === 'operational' && now.getTime() - joinedOn.getTime() < 2 * 365 * 86_400_000;
      persons.push({
        personnelNumber: String(number++),
        salutation: female ? 'Frau' : 'Herr',
        firstName,
        lastName,
        department,
        birthDate,
        joinedOn,
        status: department.type === 'youth' ? 'Jugend' : department.type === 'veterans' ? 'Altersabteilung' : probation ? 'Probezeit' : chance(0.06) ? 'Passiv' : 'Aktiv',
      });
    }
  }
  return persons;
}

/** Department column as MP-Feuer writes it ("Abt. Musterstadt", "Altersabt. Musterstadt"). */
const exportName = (d: DepartmentPlan) => (d.type === 'operational' ? `Abt. ${d.shortName}` : d.type === 'veterans' ? `Altersabt. ${d.name.replace(/^Altersabteilung /, '')}` : d.name);

async function personsWorkbook(persons: PlannedPerson[]): Promise<Buffer> {
  const headers = ['Pers.-Nr.', 'Anrede', 'Vorname', 'Nachname', 'Straße', 'PLZ', 'Ort', 'Handy', 'E-Mail', 'Geburtsdatum', 'Eintritt', 'Status', 'Bezeichnung'];
  const rows = persons.map((p, i) => [
    p.personnelNumber,
    p.salutation,
    p.firstName,
    p.lastName,
    `${STREETS[i % STREETS.length]} ${1 + ((i * 7) % 60)}`,
    p.department.postalCode,
    p.department.type === 'operational' ? p.department.shortName : 'Musterstadt',
    `0151 ${String(2_000_000 + i * 7919).slice(0, 7)}`,
    `${p.firstName}.${p.lastName}@example.org`.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'),
    dateText(p.birthDate),
    dateText(p.joinedOn),
    p.status,
    exportName(p.department),
  ]);
  return xlsx(headers, rows);
}

// --- incidents ----------------------------------------------------------------------------------

const KEYWORDS: { key: string; weight: number; minutes: [number, number]; situation: string; actions: string; cause: string }[] = [
  { key: 'B1', weight: 8, minutes: [40, 90], situation: 'Brennender Müllcontainer', actions: 'Ablöschen mit 1 C-Rohr unter PA', cause: 'Unbekannt' },
  { key: 'B2', weight: 4, minutes: [90, 180], situation: 'Rauch aus Kellerfenster eines Wohnhauses', actions: 'Innenangriff mit 1 C-Rohr, Belüftung, Kontrolle mit Wärmebildkamera', cause: 'Technischer Defekt' },
  { key: 'B3', weight: 1, minutes: [180, 360], situation: 'Scheune in Vollbrand', actions: 'Riegelstellung zum Wohnhaus, Brandbekämpfung mit 3 C-Rohren und DLK, Nachlöscharbeiten', cause: 'Unbekannt' },
  { key: 'B-BMA', weight: 9, minutes: [30, 60], situation: 'Auslösung Brandmeldeanlage', actions: 'Erkundung, Melder zurückgestellt, Übergabe an Betreiber', cause: 'Täuschungsalarm durch Wasserdampf' },
  { key: 'B-PKW', weight: 3, minutes: [45, 90], situation: 'PKW-Brand im Motorraum', actions: 'Ablöschen mit Schaum, Batterie abgeklemmt, Fahrbahn gereinigt', cause: 'Technischer Defekt' },
  { key: 'TH1', weight: 6, minutes: [30, 90], situation: 'Baum auf Fahrbahn', actions: 'Baum mit Motorsäge zerkleinert und Fahrbahn geräumt', cause: 'Sturm' },
  { key: 'TH-VU', weight: 3, minutes: [60, 150], situation: 'Verkehrsunfall, eine Person eingeklemmt', actions: 'Sicherung, Patientenbetreuung, Seitenöffnung mit hydraulischem Rettungsgerät', cause: 'Verkehrsunfall' },
  { key: 'TH-Öl', weight: 5, minutes: [30, 90], situation: 'Ölspur über ca. 500 m', actions: 'Abstreuen mit Bindemittel, Absicherung', cause: 'Defektes Fahrzeug' },
  { key: 'TH-Person', weight: 3, minutes: [30, 60], situation: 'Hilflose Person hinter verschlossener Tür', actions: 'Türöffnung, Übergabe an Rettungsdienst', cause: 'Medizinischer Notfall' },
  { key: 'TH-Wasser', weight: 3, minutes: [90, 240], situation: 'Wasser im Keller nach Starkregen', actions: 'Auspumpen mit Tauchpumpe und Wassersauger', cause: 'Unwetter' },
  { key: 'TH-Insekten', weight: 2, minutes: [30, 60], situation: 'Wespennest am Kindergarten', actions: 'Nest entfernt', cause: 'Natürlich' },
  { key: 'TH-Tier', weight: 1, minutes: [30, 90], situation: 'Katze auf Baum', actions: 'Rettung mit Steckleiter', cause: 'Natürlich' },
  { key: 'BSW', weight: 3, minutes: [180, 300], situation: 'Brandsicherheitswache Veranstaltung Stadthalle', actions: 'Brandsicherheitswache ohne Vorkommnisse', cause: '' },
];
const PLACES: Record<string, string[]> = {
  Musterstadt: ['Hauptstraße', 'Bahnhofstraße', 'Industriestraße', 'Ehinger Straße', 'Schloßberg'],
  Ahornfeld: ['Dorfstraße', 'Brückenweg'],
  Birkenhain: ['Rathausplatz', 'Ulmer Straße', 'Riedweg'],
  Weidenhain: ['Schulstraße', 'Hochsträß'],
};
const MESSAGE: Record<string, string> = { BSW: 'Brandsicherheitswache' };

interface PersonRef {
  id: string;
  personnelNumber: string | null;
  primaryDepartmentId?: string | null;
  firstName: string;
  lastName: string;
  status: string;
  qualifications: string[];
}

function weighted<T extends { weight: number }>(items: readonly T[]): T {
  let value = random() * items.reduce((sum, i) => sum + i.weight, 0);
  for (const item of items) {
    value -= item.weight;
    if (value <= 0) return item;
  }
  return items[items.length - 1];
}

/** Rows of the MP-Feuer personnel export: one per person and report. */
async function incidentsWorkbook(members: Map<string, PersonRef[]>): Promise<{ file: Buffer; incidents: number }> {
  const headers = [
    'Pers.-Nr.', 'Name', 'von', 'bis', 'BE', 'AS', 'V-A', 'Fzg.-Nr.', 'Bezeichnung', 'Funkrufname',
    'Einsatz-Nr.', 'Beginn', 'Ende', 'Einsatz-Ort', 'Ortsteil (Obj.)', 'Straße (Obj.)', 'PLZ (Obj.)', 'Ort (Obj.)',
    'Alarmstichwort', 'Leitstellen-Nr.', 'Erläuterung', 'Lage', 'Verlauf', 'Ursache', 'Leitung',
    'bei Ges. Stat. anzeigen', 'Zusatzfeld 2', 'Bezeichnung',
  ];
  reseed(4711);
  const operational = DEPARTMENTS.filter((d) => d.type === 'operational');
  const rows: string[][] = [];
  const numbers = new Map<string, number>();
  const now = new Date();
  const start = new Date(now.getFullYear() - 1, 0, 1);
  let time = addMinutes(start, between(60, 4000) * 60);
  let count = 0;

  while (time < addMinutes(now, -24 * 60)) {
    count++;
    const keyword = weighted(KEYWORDS);
    const home = weighted(operational.map((d) => ({ d, weight: d.persons }))).d;
    const support = keyword.key === 'B2' || keyword.key === 'B3' || keyword.key === 'TH-VU' || chance(0.08) ? pick(operational.filter((d) => d !== home)) : undefined;
    const begin = new Date(time);
    begin.setMinutes(Math.floor(begin.getMinutes() / 5) * 5, 0, 0);
    const duration = between(...keyword.minutes);
    const end = addMinutes(begin, duration);
    const street = `${pick(PLACES[home.shortName])} ${between(1, 80)}`;
    const dispatch = `${begin.getFullYear()}-${String(between(100000, 999999))}`;
    const ageDays = (now.getTime() - begin.getTime()) / 86_400_000;
    const commander = (members.get(home.name) ?? []).find((p) => p.qualifications.includes('group-leader'));

    for (const department of [home, support].filter((d): d is DepartmentPlan => !!d)) {
      const yearKey = `${department.name}|${begin.getFullYear()}`;
      const number = (numbers.get(yearKey) ?? 0) + 1;
      numbers.set(yearKey, number);
      const primary = department === home;
      // Older reports are released for billing, recent ones are still in the workflow.
      const status = ageDays > 45 ? 'zur Abrechnung freigegeben' : ageDays > 14 ? (chance(0.6) ? 'zur Entschädigungsauszahlung freigegeben' : '') : '';
      const arrival = primary ? begin : addMinutes(begin, between(5, 20));
      const pool = (members.get(department.name) ?? []).filter((p) => p.status === 'active');
      const crew = pool.toSorted(() => random() - 0.5).slice(0, Math.min(pool.length, primary ? between(6, 16) : between(4, 9)));
      const vehicles = keyword.key === 'BSW' ? [] : department.vehicles;
      crew.forEach((person, index) => {
        const vehicle = vehicles.length ? vehicles[index % Math.min(vehicles.length, Math.max(1, Math.ceil(crew.length / 6)))] : undefined;
        const standby = !primary && !vehicle;
        const breathing = !!vehicle && person.qualifications.includes('breathing-apparatus') && /^B[123]$|B-PKW/.test(keyword.key) && index % 3 === 1;
        rows.push([
          person.personnelNumber ?? '',
          `${person.lastName} ${person.firstName}`,
          localText(arrival),
          localText(end),
          standby ? 'Ja' : 'Nein',
          breathing ? 'Ja' : 'Nein',
          chance(0.12) ? 'Ja' : 'Nein',
          vehicle ? String(department.vehicles.indexOf(vehicle) + 1) : '',
          vehicle?.designation ?? '',
          vehicle?.radioCallSign ?? '',
          String(number),
          localText(arrival),
          localText(end),
          home.shortName,
          home.shortName,
          street,
          home.postalCode,
          'Musterstadt',
          keyword.key,
          dispatch,
          MESSAGE[keyword.key] ?? keyword.situation,
          primary ? keyword.situation : '',
          primary ? keyword.actions : 'Unterstützung der Abteilung ' + home.shortName,
          primary ? keyword.cause : '',
          primary && commander ? `${commander.firstName} ${commander.lastName}` : '',
          primary ? 'Ja' : 'Nein',
          status,
          exportName(department),
        ]);
      });
    }
    // Roughly 100 incidents per year, more in summer.
    const summer = [5, 6, 7].includes(time.getMonth());
    time = addMinutes(time, between(summer ? 600 : 1200, summer ? 5400 : 7600));
    time.setHours(between(0, 23));
  }
  return { file: await xlsx(headers, rows), incidents: count };
}

function dutyCalendar(officers: PersonRef[]): string {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7 * 12, 18, 0);
  const events: string[] = [];
  for (let week = 0; week < 16; week++) {
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + week * 7, 18, 0);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7, 18, 0);
    const officer = officers[week % officers.length];
    events.push(
      ['BEGIN:VEVENT', `UID:forga-seed-evd-${isoDate(from)}`, `DTSTART;TZID=Europe/Berlin:${icsTime(from)}`, `DTEND;TZID=Europe/Berlin:${icsTime(to)}`, `SUMMARY:EvD ${officer.firstName} ${officer.lastName}`, 'END:VEVENT'].join('\r\n'),
    );
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//f.orga//seed//DE', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

// --- steps --------------------------------------------------------------------------------------

async function login(): Promise<void> {
  const setup = await call<{ required: boolean }>('GET', 'core/setup');
  if (setup.required) {
    // The development server reads the same token from `apps/server/.env`.
    const setupToken = process.env['FORGA_SETUP_TOKEN'] ?? /^FORGA_SETUP_TOKEN=(.+)$/m.exec(readFileSync('apps/server/.env', 'utf8'))?.[1]?.trim();
    if (!setupToken) throw new Error('Ersteinrichtung nötig: FORGA_SETUP_TOKEN setzen (Wert aus dem Server-Protokoll oder der Umgebung des Servers).');
    console.log('Ersteinrichtung …');
    await call('POST', 'core/setup', { setupToken, brigadeName: BRIGADE, username: ADMIN.username, displayName: 'Administrator', email: 'admin@example.org', password: ADMIN.password });
  }
  await call('POST', 'core/login', ADMIN);
}

async function settings(): Promise<void> {
  const brigade = (await call<Record<string, string> | null>('GET', 'core/settings/brigade')) ?? {};
  await call('PUT', 'core/settings/brigade', {
    name: BRIGADE,
    street: 'Feuerwehrstraße 1',
    postalCode: '12345',
    city: 'Musterstadt',
    phone: '01234 5678-0',
    website: 'www.feuerwehr-musterstadt.example',
    email: 'info@example.org',
    // Address of the links in e-mails (password reset); the dev shell.
    publicUrl: process.env['FORGA_PUBLIC_URL'] ?? 'http://localhost:4200',
    ...Object.fromEntries(Object.entries(brigade).filter(([, value]) => value)),
  });
  const general = (await call<Record<string, unknown> | null>('GET', 'core/settings/incidents.general')) ?? {};
  await call('PUT', 'core/settings/incidents.general', { ...general, homeMunicipalities: ['Musterstadt'] });
  await call('POST', 'masterdata/catalog/templates/bw', {});
  await call('POST', 'masterdata/courses/templates/bw', {}).catch(() => undefined);
  // Statute values of the BW template (template values; a real brigade compares them with its own statute).
  const membership = (await call<Record<string, unknown> | null>('GET', 'core/settings/masterdata.membership')) ?? {};
  if (!membership['admissionDecidedBy']) await call('PUT', 'core/settings/masterdata.membership', { ...membership, ...BW_MEMBERSHIP_TEMPLATE });
  await call('POST', 'incidents/keywords/templates/bw', {});
  await call('POST', 'core/roles/templates', {});
}

async function organization(): Promise<Map<string, string>> {
  const existing = await call<{ id: string; name: string }[]>('GET', 'masterdata/departments');
  const ids = new Map(existing.map((d) => [d.name, d.id]));
  for (const plan of DEPARTMENTS) {
    if (ids.has(plan.name)) continue;
    const created = await call<{ id: string }>('POST', 'masterdata/departments', {
      name: plan.name,
      shortName: plan.shortName,
      type: plan.type,
      parentId: plan.parent ? ids.get(plan.parent) : null,
    });
    ids.set(plan.name, created.id);
  }
  const stations = await call<{ name: string; departmentId: string }[]>('GET', 'masterdata/stations');
  const vehicles = await call<{ radioCallSign: string }[]>('GET', 'masterdata/vehicles?includeRetired=true');
  for (const plan of DEPARTMENTS) {
    const departmentId = ids.get(plan.name)!;
    let stationId: string | null = null;
    if (plan.station) {
      const station = stations.find((s) => s.name === plan.station!.name) as { id?: string } | undefined;
      stationId =
        station?.id ??
        (await call<{ id: string }>('POST', 'masterdata/stations', { name: plan.station.name, departmentId, street: plan.station.street, postalCode: plan.postalCode, city: 'Musterstadt' })).id;
    }
    for (const vehicle of plan.vehicles) {
      if (vehicles.some((v) => v.radioCallSign === vehicle.radioCallSign)) continue;
      await call('POST', 'masterdata/vehicles', { ...vehicle, departmentId, stationId });
    }
  }
  console.log(`  ${DEPARTMENTS.length} Abteilungen, ${DEPARTMENTS.reduce((n, d) => n + d.vehicles.length, 0)} Fahrzeuge`);
  return ids;
}

/** Ranks and qualifications by age and seniority, only for persons that have none yet. */
async function careers(planned: PlannedPerson[], persons: PersonRef[]): Promise<void> {
  const byNumber = new Map(persons.map((p) => [p.personnelNumber, p]));
  let updated = 0;
  for (const plan of planned) {
    const person = byNumber.get(plan.personnelNumber);
    if (!person || person.qualifications.length || plan.department.type === 'youth') continue;
    reseed(Number(plan.personnelNumber));
    const years = new Date().getFullYear() - plan.joinedOn.getFullYear();
    const at = (offset: number) => isoDate(new Date(Math.min(new Date(plan.joinedOn.getFullYear() + offset, between(0, 11), between(1, 28)).getTime(), Date.now())));
    const qualifications: [string, number][] = [['truppmann-1', 0], ['truppmann-2', 1], ['radio-operator', 1]];
    if (years >= 3 && chance(0.7)) qualifications.push(['breathing-apparatus', 2]);
    if (years >= 4 && chance(0.5)) qualifications.push(['machinist', 3]);
    if (years >= 6 && chance(0.6)) qualifications.push(['squad-leader', 4]);
    if (years >= 10 && chance(0.35)) qualifications.push(['group-leader', 7]);
    if (years >= 15 && chance(0.25)) qualifications.push(['platoon-leader', 11]);
    for (const [qualification, offset] of qualifications) {
      if (offset > years) continue;
      // Breathing apparatus needs a yearly exercise, so the date of the last one is recent.
      const acquiredOn = qualification === 'breathing-apparatus' ? isoDate(new Date(Math.min(new Date(new Date().getFullYear(), between(0, 8), between(1, 28)).getTime(), Date.now()))) : at(offset);
      await call('POST', `masterdata/persons/${person.id}/qualifications`, { qualification, acquiredOn });
    }
    const ranks = ['fm', 'ofm', 'hfm', 'lm', 'olm', 'hlm', 'bm', 'obm'];
    const level = Math.min(ranks.length - 1, Math.floor(years / 3));
    if (years >= 2) await call('POST', `masterdata/persons/${person.id}/ranks`, { rank: ranks[level], since: at(Math.min(years, level * 3 + 2)) });
    updated++;
  }
  console.log(`  Laufbahn für ${updated} Personen ergänzt`);
}

/** Adds a qualification unless the person holds it already. */
async function ensureQualification(person: PersonRef, qualification: string, acquiredOn: string): Promise<void> {
  if (person.qualifications.includes(qualification)) return;
  await call('POST', `masterdata/persons/${person.id}/qualifications`, { qualification, acquiredOn });
  person.qualifications.push(qualification);
}

/**
 * One user per standard role. The department roles apply to Abteilung Musterstadt and belong to persons there whose
 * file fits the role: the department commander holds the office, the group leader the qualification; the equipment
 * and breathing apparatus officers hold theirs as well.
 */
async function users(persons: PersonRef[], departments: Map<string, string>): Promise<Map<string, PersonRef>> {
  const roles = await call<{ id: string; name: { de: string; en: string }; templateKey: string | null }[]>('GET', 'core/roles');
  const accounts = await call<{ username: string; personId: string | null }[]>('GET', 'core/users');
  const existing = new Set(accounts.map((u) => u.username));
  const departmentRoles = new Set(['department-commander', 'group-leader', 'member']);
  const musterstadt = departments.get('Abteilung Musterstadt')!;
  const available = persons.filter((p) => p.status === 'active');
  const local = available.filter((p) => p.primaryDepartmentId === musterstadt);
  const taken = new Set<string>(accounts.flatMap((u) => (u.personId ? [u.personId] : [])));
  // Persons per role: from Musterstadt with a fitting qualification (in the order of preference).
  const prefer = (...qualifications: string[]) => qualifications.map((q) => local.find((p) => p.qualifications.includes(q) && !taken.has(p.id))).find(Boolean) ?? local.find((p) => !taken.has(p.id));
  const chosen = new Map<string, PersonRef>();
  // Persons of users created earlier keep their role.
  for (const account of accounts) {
    const person = persons.find((p) => p.id === account.personId);
    if (person) chosen.set(account.username, person);
  }
  for (const [username, qualifications] of [
    ['member', ['breathing-apparatus']],
    ['department-commander', ['platoon-leader', 'group-leader']],
    ['group-leader', ['group-leader', 'squad-leader']],
  ] as const) {
    if (chosen.has(username)) continue;
    const person = prefer(...qualifications);
    if (!person) continue;
    chosen.set(username, person);
    taken.add(person.id);
  }
  let created = 0;
  for (const [index, role] of roles.filter((r) => r.templateKey).entries()) {
    const username = role.templateKey!;
    if (existing.has(username) || username === ADMIN.username) continue;
    let candidate = (index * 7) % available.length;
    while (taken.has(available[candidate].id)) candidate = (candidate + 1) % available.length;
    const person = chosen.get(username) ?? available[candidate];
    chosen.set(username, person);
    taken.add(person.id);
    await call('POST', 'core/users', {
      username,
      displayName: `${person.firstName} ${person.lastName} (${role.name.de})`,
      email: null,
      personId: person.id,
      password: USER_PASSWORD,
      roles: [{ roleId: role.id, departmentId: departmentRoles.has(username) ? musterstadt : null }],
    });
    created++;
  }
  // The files fit the roles: qualifications of the group leader and the officers, office of the department commander.
  const since = isoDate(new Date(new Date().getFullYear() - 3, 2, 1));
  const groupLeader = chosen.get('group-leader');
  if (groupLeader) await ensureQualification(groupLeader, 'group-leader', since);
  const equipmentOfficer = chosen.get('equipment-officer');
  if (equipmentOfficer) await ensureQualification(equipmentOfficer, 'equipment-officer', since);
  const apparatusOfficer = chosen.get('breathing-apparatus-officer');
  if (apparatusOfficer) {
    await ensureQualification(apparatusOfficer, 'breathing-apparatus', since);
    await ensureQualification(apparatusOfficer, 'breathing-apparatus-officer', since);
  }
  const commander = chosen.get('department-commander');
  if (commander) {
    const file = await call<{ offices: { office: string }[] }>('GET', `masterdata/persons/${commander.id}`);
    if (!file.offices.some((o) => o.office === 'department-commander')) {
      await call('POST', `masterdata/persons/${commander.id}/offices`, { office: 'department-commander', departmentId: musterstadt, from: since });
    }
    const department = (await call<{ id: string; commanderId: string | null }[]>('GET', 'masterdata/departments')).find((d) => d.id === musterstadt)!;
    if (!department.commanderId) await call('PUT', `masterdata/departments/${musterstadt}`, { ...department, commanderId: commander.id });
  }
  console.log(`  ${created} Benutzer angelegt (Passwort: ${USER_PASSWORD})`);
  for (const role of roles.filter((r) => r.templateKey)) console.log(`    ${role.templateKey!.padEnd(30)} ${role.name.de}`);
  return chosen;
}

/** Three groups in Musterstadt; the user "group-leader" leads the first. */
async function groups(persons: PersonRef[], departments: Map<string, string>, accounts: Map<string, PersonRef>): Promise<void> {
  const musterstadt = departments.get('Abteilung Musterstadt')!;
  if ((await call<unknown[]>('GET', `masterdata/groups?departmentId=${musterstadt}`)).length) return;
  const local = persons.filter((p) => p.primaryDepartmentId === musterstadt && (p.status === 'active' || p.status === 'probation'));
  const first = accounts.get('group-leader');
  const leaders = [first, ...local.filter((p) => p !== first && p.qualifications.includes('group-leader'))].filter((p): p is PersonRef => Boolean(p)).slice(0, 3);
  const others = local.filter((p) => !leaders.includes(p));
  for (const [index, leader] of leaders.entries()) {
    const memberIds = others.filter((_, i) => i % leaders.length === index).slice(0, 9).map((p) => p.id);
    await call('POST', 'masterdata/groups', { departmentId: musterstadt, name: `${index + 1}. Gruppe`, leaderId: leader.id, memberIds });
  }
  console.log(`  ${leaders.length} Gruppen in Musterstadt`);
}

/**
 * Course planning: targets for Musterstadt and the youth brigade, a past run with results, coming runs with
 * nominations, and further nominations without a run, so planning and needs show something.
 */
async function coursePlanning(departments: Map<string, string>): Promise<void> {
  const musterstadt = departments.get('Abteilung Musterstadt')!;
  const youth = departments.get('Jugendfeuerwehr Musterstadt')!;
  type Course = { id: string; key: string; targets: Record<string, number> } & Record<string, unknown>;
  const courses = await call<Course[]>('GET', 'masterdata/courses');
  const targets: Record<string, Record<string, number>> = {
    'truppmann-1': { [youth]: 10 },
    // Some targets above the current numbers, so the needs show gaps.
    'breathing-apparatus': { [musterstadt]: 44 },
    machinist: { [musterstadt]: 24 },
    'squad-leader': { [musterstadt]: 24 },
    'group-leader': { [musterstadt]: 15 },
  };
  for (const course of courses) {
    const wanted = targets[course.key];
    if (!wanted || Object.keys(course.targets).length) continue;
    const { id, version: _version, ...fields } = course;
    await call('PUT', `masterdata/courses/${id}`, { ...fields, targets: wanted });
  }
  if ((await call<unknown[]>('GET', 'masterdata/course-runs')).length) return;

  type Planning = { candidates: { id: string; primaryDepartmentId: string | null }[] };
  const year = new Date().getFullYear();
  const run = (course: string, startsOn: string, endsOn: string, location: string) => call<{ id: string }>('POST', 'masterdata/course-runs', { course, startsOn, endsOn, location });
  const candidates = async (course: string, departmentId: string, count: number) =>
    (await call<Planning>('GET', `masterdata/course-planning/${course}`)).candidates.filter((p) => p.primaryDepartmentId === departmentId).slice(0, count).map((p) => p.id);
  const nominate = async (course: string, personIds: string[], body: object = {}) => {
    if (personIds.length) await call('POST', 'masterdata/course-nominations/bulk', { course, personIds, desiredPeriod: String(year + 1), ...body });
  };

  // Past: Truppmann Teil 2 in the municipality, two passed and one failed.
  const past = await run('truppmann-2', daysAgo(70), daysAgo(60), 'Feuerwehrhaus Musterstadt');
  const attended = await candidates('truppmann-2', musterstadt, 3);
  await nominate('truppmann-2', attended, { runId: past.id, status: 'confirmed', desiredPeriod: String(year) });
  if (attended.length) {
    await call('POST', 'masterdata/course-results', { course: 'truppmann-2', runId: past.id, results: attended.map((personId, i) => ({ personId, result: i === 2 ? 'failed' : 'passed' })) });
  }
  // Coming runs with registered persons, further nominations without a run.
  const spring = await run('breathing-apparatus', `${year + 1}-03-07`, `${year + 1}-03-21`, 'Feuerwehrhaus Ahornfeld');
  await nominate('breathing-apparatus', await candidates('breathing-apparatus', musterstadt, 6), { runId: spring.id, status: 'registered', priority: 1 });
  const basic = await run('truppmann-1', `${year + 1}-02-14`, `${year + 1}-04-25`, 'Kreisfeuerwehrzentrale');
  await nominate('truppmann-1', await candidates('truppmann-1', youth, 4), { runId: basic.id, status: 'confirmed' });
  await nominate('machinist', await candidates('machinist', musterstadt, 4));
  await nominate('squad-leader', await candidates('squad-leader', musterstadt, 3), { priority: 1 });
  console.log('  Lehrgangstermine, Vormerkungen und Soll angelegt');
}

/** A valid German IBAN for a made-up account at the bank code 00000000, which no bank uses. */
function demoIban(account: number): string {
  const bban = `00000000${String(account).padStart(10, '0')}`;
  // Check digits per ISO 13616: BBAN + "DE00" with letters as numbers (D = 13, E = 14), 98 − remainder mod 97.
  const check = 98n - (BigInt(`${bban}131400`) % 97n);
  return `DE${String(check).padStart(2, '0')}${bban}`;
}

/** Bank accounts for some active members (made up, valid check digits), e.g. for the compensation payments. */
async function bankAccounts(persons: PersonRef[]): Promise<void> {
  let updated = 0;
  for (const [index, person] of persons.filter((p) => p.status === 'active').slice(0, 20).entries()) {
    const file = await call<{ bank?: { iban: string }; sensitiveHidden: boolean } & Record<string, unknown>>('GET', `masterdata/persons/${person.id}`);
    if (file.sensitiveHidden || file.bank?.iban) continue;
    await call('PUT', `masterdata/persons/${person.id}`, { ...file, bank: { iban: demoIban(4_711_000 + index * 37), accountHolder: `${person.firstName} ${person.lastName}` } });
    updated++;
  }
  console.log(`  ${updated} Bankverbindungen ergänzt`);
}

/** Training sessions every second week per department this year; past ones with attendance, older ones closed. */
async function training(members: Map<string, PersonRef[]>, departments: Map<string, string>): Promise<void> {
  reseed(1871);
  await call('POST', 'training/types/templates/bw', {});
  const year = new Date().getFullYear();
  const existing = await call<unknown[]>('GET', `training/sessions?from=${year}-01-01&to=${year}-12-31`);
  if (existing.length) {
    console.log(`  ${existing.length} Dienste vorhanden`);
    return;
  }
  const topics = ['Löschangriff', 'Technische Hilfe', 'Funk', 'Knoten und Stiche', 'Erste Hilfe', 'Leitern', 'Wasserförderung', 'Fahrzeugkunde'];
  let count = 0;
  for (const [index, [name, persons]] of [...members.entries()].entries()) {
    const departmentId = departments.get(name);
    if (!departmentId || persons.length < 3) continue;
    const first = new Date(year, 0, 9 + index * 2, 19, 30);
    const end = new Date(first.getTime() + 2 * 3_600_000);
    const sessions = await call<{ id: string; startsAt: string }[]>('POST', 'training/sessions/series', {
      session: { type: 'exercise', title: `Übungsdienst ${name.replace('Abteilung ', '')}`, startsAt: first.toISOString(), endsAt: end.toISOString(), departmentIds: [departmentId] },
      intervalWeeks: 2,
      until: `${year}-12-31`,
    });
    for (const session of sessions) {
      const startsAt = new Date(session.startsAt);
      const topic = pick(topics);
      await call('PUT', `training/sessions/${session.id}`, {
        type: 'exercise', title: `Übungsdienst ${name.replace('Abteilung ', '')}`, startsAt: session.startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3_600_000).toISOString(),
        departmentIds: [departmentId], topic,
      });
      count++;
      if (startsAt.getTime() > Date.now()) continue;
      const attendance = persons
        .filter((p) => p.status !== 'left')
        .map((p) => ({ personId: p.id, status: chance(0.7) ? 'present' : chance(0.6) ? 'excused' : 'absent', breathingApparatus: chance(0.2) }));
      if (!attendance.some((a) => a.status === 'present')) continue;
      await call('PUT', `training/sessions/${session.id}/attendance`, attendance.map((a) => ({ ...a, breathingApparatus: a.status === 'present' && a.breathingApparatus })));
      if (startsAt.getTime() < Date.now() - 14 * 86_400_000) await call('POST', `training/sessions/${session.id}/close`, {});
    }
  }
  console.log(`  ${count} Dienste geplant`);
}

/** Evidence of the breathing apparatus wearers: most are fit, some expire soon, a few are not fit. */
async function respiratoryProtection(persons: PersonRef[]): Promise<void> {
  reseed(112);
  await qualifyUser(persons, 'breathing-apparatus-officer', 'breathing-apparatus-officer');
  // Wearers count only as active members or on probation (`WEARER_STATUSES`).
  const wearers = persons.filter((p) => (p.status === 'active' || p.status === 'probation') && p.qualifications.includes('breathing-apparatus'));
  const existing = await call<{ evidence: unknown[] }>('GET', `respiratory-protection/persons/${wearers[0]?.id}`).catch(() => ({ evidence: [1] }));
  if (!wearers.length || existing.evidence.length) {
    console.log('  Nachweise vorhanden');
    return;
  }
  const evidence: Record<string, unknown>[] = [];
  for (const person of wearers) {
    const roll = random();
    // 75 % fit, 15 % with evidence expiring within 60 days, 10 % with an expired examination.
    const old = roll > 0.75 && roll <= 0.9 ? 330 : 0;
    const examination = roll > 0.9 ? 1200 : between(30, 700);
    evidence.push({ personId: person.id, kind: 'examination', date: daysAgo(examination), examiner: 'Betriebsarzt', result: 'no-concerns' });
    evidence.push({ personId: person.id, kind: 'briefing', date: daysAgo(old || between(20, 250)) });
    evidence.push({ personId: person.id, kind: 'stress-exercise', date: daysAgo(old ? old - 5 : between(20, 280)), facility: 'Atemschutzübungsstrecke Kreis', kilojoules: between(82, 110), passed: true });
    evidence.push({ personId: person.id, kind: 'exercise', date: daysAgo(between(10, 300)), minutes: between(15, 35) });
  }
  for (const item of evidence) await call('POST', 'respiratory-protection/evidence', item);
  console.log(`  ${evidence.length} Nachweise für ${wearers.length} Geräteträger`);
}

/** Compensation: take over released incidents and closed sessions, function allowances and one closed payout run. */
async function compensation(persons: PersonRef[]): Promise<void> {
  reseed(16);
  const year = new Date().getFullYear();
  const runs = await call<{ id: string }[]>('GET', 'compensation/runs');
  if (runs.length) {
    console.log('  Auszahlungsläufe vorhanden');
    return;
  }
  // The statute values are taken over explicitly from the sample statute (example values).
  const statute = (await call<Record<string, unknown> | null>('GET', 'core/settings/compensation.general')) ?? {};
  // The payer account of the SEPA file is an example (test IBAN), so the payout run demo has transfer files.
  await call('PUT', 'core/settings/compensation.general', { ...statute, ...SAMPLE_STATUTE, payer: { name: 'Stadt Musterstadt (Beispiel)', iban: 'DE02120300000000202051', bic: '' } });
  for (const y of [year - 1, year]) {
    await call('POST', 'incidents/reports/republish', { from: `${y}-01-01`, to: `${y}-12-31` });
    await call('POST', 'training/sessions/republish', { from: `${y}-01-01`, to: `${y}-12-31` });
  }
  const officers = persons.filter((p) => p.status === 'active' && p.qualifications.includes('group-leader'));
  const functions = ['commander', 'deputy-commander', 'department-commander-main', 'breathing-apparatus-officer', 'secretary', 'clothing-officer'];
  for (const [index, key] of functions.entries()) {
    const person = officers[(index * 5) % officers.length];
    if (person) await call('POST', 'compensation/functions', { personId: person.id, functionKey: key, from: `${year - between(1, 6)}-01-01` });
  }
  await call('POST', 'compensation/functions/generate', { year: year - 1 });
  // A closed and paid run for the previous year; the current year stays open.
  const run = await call<{ id: string; items: { id: string; amount: number | null }[]; problems: { code: string }[] }>('POST', 'compensation/runs', { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` });
  for (const item of run.items.filter((i) => i.amount === null)) await call('PUT', `compensation/items/${item.id}/amount`, { amount: between(40, 180), reason: 'Bescheinigung Arbeitgeber' });
  // Only if demo persons still lack a valid bank account, they are confirmed explicitly (paid another way).
  await call('POST', `compensation/runs/${run.id}/close`, { acceptMissingIban: run.problems.some((p) => p.code === 'no-iban') });
  await call('POST', `compensation/runs/${run.id}/hand-over`, {});
  await call('POST', `compensation/runs/${run.id}/paid`, {});
  const open = await call<unknown[]>('GET', 'compensation/items?open=true');
  console.log(`  Lauf ${year - 1} mit ${run.items.length} Posten ausgezahlt, ${open.length} offene Posten`);
}

/**
 * The person of the user of a role (`users`: user name = role template) gets the qualification of its office, e.g. the
 * equipment officer `equipment-officer`, so inspections recorded by them carry no qualification warning.
 */
async function qualifyUser(persons: PersonRef[], username: string, qualification: string): Promise<void> {
  const user = (await call<{ username: string; personId: string | null }[]>('GET', 'core/users')).find((u) => u.username === username);
  const person = persons.find((p) => p.id === user?.personId);
  if (!person || person.qualifications.includes(qualification)) return;
  await call('POST', `masterdata/persons/${person.id}/qualifications`, { qualification, acquiredOn: daysAgo(730) });
  person.qualifications.push(qualification);
  console.log(`  ${person.firstName} ${person.lastName} (${username}) hat die Qualifikation ${qualification}`);
}

/** Equipment: DGUV template, vehicles, typical equipment per vehicle with past inspections, some defects. */
async function equipment(persons: PersonRef[]): Promise<void> {
  reseed(305);
  await qualifyUser(persons, 'equipment-officer', 'equipment-officer');
  await call('POST', 'equipment/templates/dguv', {});
  await call('POST', 'equipment/vehicles/sync', {});
  // Vehicles are taken over without dates ("not recorded yet"): the last inspections as from the vehicle papers.
  const synced = await call<{ id: string; dues: { key: string; notRecorded: boolean }[]; inspections: { key: string; intervalMonths: number | null; inspector: string }[] }[]>('GET', 'equipment/items?categoryKey=vehicles');
  for (const vehicle of synced) {
    for (const inspection of vehicle.inspections.filter((i) => i.intervalMonths && vehicle.dues.some((d) => d.key === i.key && d.notRecorded))) {
      const date = daysAgo(between(10, inspection.intervalMonths! * 30 - 10));
      await call('POST', `equipment/items/${vehicle.id}/inspections`, { inspectionKey: inspection.key, date, inspectorCompany: inspection.inspector === 'expert' ? 'Prüfstelle (Beispiel)' : '', result: 'passed' });
    }
  }
  const existing = await call<unknown[]>('GET', 'equipment/items?categoryKey=breathing');
  if (existing.length) {
    console.log('  Geräte vorhanden');
    return;
  }
  const vehicles = await call<{ id: string; radioCallSign: string; designation: string; departmentId: string; stationId: string | null }[]>('GET', 'masterdata/vehicles');
  const officers = persons.filter((p) => p.status === 'active' && p.qualifications.includes('equipment-officer'));
  const loadout: [string, string, string, number, string][] = [
    ['scba', 'breathing', 'Pressluftatmer', 4, 'G1'],
    ['full-face-mask', 'breathing', 'Vollmaske', 4, 'G1'],
    ['air-cylinder', 'breathing', 'Atemluftflasche 6 l', 6, 'G1'],
    ['portable-ladder', 'ladders', 'Steckleiter 4-teilig', 1, 'Dach'],
    ['generator', 'electrical', 'Stromerzeuger 8 kVA', 1, 'G3'],
    ['cable-reel', 'electrical', 'Leitungsroller 50 m', 2, 'G3'],
    ['extinguisher', 'extinguishers', 'Pulverlöscher 12 kg', 1, 'G2'],
    ['handheld-radio', 'radio', 'Handfunkgerät', 3, 'Kabine'],
  ];
  let count = 0;
  for (const vehicle of vehicles) {
    const prefix = (vehicle.radioCallSign || vehicle.designation).replace(/[^0-9A-Za-z]/g, '').slice(-6);
    const big = /LF|HLF|RW|TLF/i.test(vehicle.designation);
    for (const [typeKey, categoryKey, name, quantity, place] of loadout) {
      for (let n = 1; n <= (big ? quantity : Math.min(quantity, 1)); n++) {
        const item = await call<{ id: string; inspections: { key: string; intervalMonths: number | null }[] }>('POST', 'equipment/items', {
          inventoryNumber: `${prefix}-${typeKey}-${n}`, name: `${name} ${n}`, typeKey, categoryKey, departmentId: vehicle.departmentId, vehicleId: vehicle.id, loadingPlace: place,
          manufacturer: pick(['Dräger', 'MSA', 'Vetter', 'Holmatro', 'Weber', 'Motorola']), yearBuilt: between(2008, 2024),
          barcode: chance(0.8) ? barcode('2000') : null, rfid: categoryKey === 'breathing' || chance(0.3) ? rfidChip() : null,
        });
        count++;
        for (const inspection of item.inspections.filter((i) => i.intervalMonths)) {
          // Most inspections are current, some are overdue.
          const monthsAgo = chance(0.85) ? between(0, inspection.intervalMonths! - 1) : inspection.intervalMonths! + between(0, 3);
          const date = daysAgo(monthsAgo * 30 + between(0, 20));
          const inspector = officers.length ? pick(officers).id : null;
          await call('POST', `equipment/items/${item.id}/inspections`, { inspectionKey: inspection.key, date, inspectorPersonId: inspector, result: 'passed' });
        }
        if (chance(0.03)) await call('POST', `equipment/items/${item.id}/defects`, { description: pick(['Riss im Gehäuse', 'Dichtung porös', 'Display ohne Anzeige', 'Kupplung schwergängig']) });
      }
    }
    // Hoses as single items (default of the template), each with its own record of pressure tests after washing.
    for (const [typeKey, name, quantity] of [['pressure-hose-b', 'B-Schlauch 20 m', big ? between(6, 10) : 2], ['pressure-hose-c', 'C-Schlauch 15 m', big ? between(6, 10) : 2]] as const) {
      for (let n = 1; n <= quantity; n++) {
        await call('POST', 'equipment/items', { inventoryNumber: `${prefix}-${typeKey}-${n}`, name: `${name} ${n}`, typeKey, categoryKey: 'hoses', departmentId: vehicle.departmentId, vehicleId: vehicle.id, loadingPlace: 'Heck', barcode: barcode('2000'), rfid: rfidChip() });
        count++;
      }
    }
  }
  console.log(`  ${count} Geräte für ${vehicles.length} Fahrzeuge`);
}

/** Barcodes run through per module; prefixes 20/21 are in-store numbers (no real GTIN), so modules never share one. */
const barcodes = new Map<string, number>();
const barcode = (prefix: '2000' | '2100') => {
  barcodes.set(prefix, (barcodes.get(prefix) ?? 0) + 1);
  return `${prefix}${String(barcodes.get(prefix)).padStart(9, '0')}`;
};
/** 7-byte chip ID as an RFID reader writes it (with separators; stored normalized). */
const rfidChip = () => Array.from({ length: 7 }, () => between(0, 255).toString(16).padStart(2, '0')).join(':');

/** A purchase date between 2016 and 2025. */
const purchase = () => isoDate(new Date(between(2016, 2025), between(0, 11), between(1, 28)));
/** A date after `from` and before today. */
const later = (from: string) => {
  const start = new Date(from).getTime();
  return isoDate(new Date(start + random() * Math.max(0, Date.now() - start - 86_400_000)));
};

/**
 * Clothing store: articles with sizes, personal equipment for every active member of the operational departments
 * (jacket, trousers, boots, helmet; overtrousers for breathing apparatus wearers), spare pieces in stock,
 * washing and impregnation (most current, some overdue), yearly inspections, consumables and a few replaced pieces.
 */
async function clothing(persons: PersonRef[]): Promise<void> {
  reseed(1207);
  await call('POST', 'clothing/articles/template', {});
  if ((await call<unknown[]>('GET', 'clothing/items?status=issued')).length) {
    console.log('  Kleiderkammer vorhanden');
    return;
  }
  const garment = ['44', '46', '48', '50', '52', '54', '56', '58', '60', '62', '64'];
  const sizes: Record<string, string[]> = {
    jacket: garment, trousers: garment, 'breathing-apparatus-trousers': ['S', 'M', 'L', 'XL', 'XXL'], boots: ['38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'],
    helmet: ['S', 'M', 'L'], gloves: ['7', '8', '9', '10', '11'], hood: [], cap: [], 't-shirt': ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
  };
  const manufacturers: Record<string, string[]> = {
    jacket: ['S-GARD', 'Texport', 'Lion'], trousers: ['S-GARD', 'Texport', 'Lion'], 'breathing-apparatus-trousers': ['Texport', 'S-GARD'],
    boots: ['HAIX', 'Völkl', 'Elten'], helmet: ['Dräger', 'MSA', 'Rosenbauer'],
  };
  const articles = await call<{ id: string; key: string; [field: string]: unknown }[]>('GET', 'clothing/articles');
  for (const article of articles) {
    if (!sizes[article.key] || (article['sizes'] as string[]).length) continue;
    const { id: _id, version: _version, ...input } = article;
    // Minimum stock for the common garment sizes.
    const minimumStock = ['jacket', 'trousers'].includes(article.key) ? { '50': 2, '52': 2, '54': 2 } : {};
    await call('PUT', `clothing/articles/${article.id}`, { ...input, sizes: sizes[article.key], minimumStock });
  }

  // Operational departments as they are in the instance (also when it holds other data than this script's).
  const operational = (await call<{ id: string; type: string }[]>('GET', 'masterdata/departments')).filter((d) => d.type === 'operational');
  const operationalIds = new Set(operational.map((d) => d.id));
  const members = persons.filter((p) => ['active', 'probation'].includes(p.status) && operationalIds.has(p.primaryDepartmentId ?? ''));
  const counters = new Map<string, number>();
  const prefixes: Record<string, string> = { jacket: 'J', trousers: 'H', 'breathing-apparatus-trousers': 'AH', boots: 'S', helmet: 'HM' };
  type Piece = { id: string; articleKey: string; departmentId: string; purchasedOn: string };
  const create = async (articleKey: string, departmentId: string, size: string, purchasedOn: string): Promise<Piece> => {
    const n = (counters.get(articleKey) ?? 0) + 1;
    counters.set(articleKey, n);
    const created = await call<{ id: string }>('POST', 'clothing/items', {
      articleKey, inventoryNumber: `${prefixes[articleKey]}-${String(n).padStart(4, '0')}`, size, departmentId, purchasedOn,
      manufacturer: pick(manufacturers[articleKey] ?? ['']), serialNumber: chance(0.7) ? String(between(100000, 999999)) : '',
      // Washable RFID tags in jackets and trousers, barcodes on most labels.
      barcode: chance(0.9) ? barcode('2100') : null, rfid: ['jacket', 'trousers', 'breathing-apparatus-trousers'].includes(articleKey) ? rfidChip() : null,
    });
    return { id: created.id, articleKey, departmentId, purchasedOn };
  };

  // Consumables handed out to each member: gloves now and then, a cap and T-shirts, hoods for breathing apparatus wearers.
  const handOuts = new Map<string, [string, string, number][]>();
  for (const person of members) {
    const handOut: [string, string, number][] = [['cap', '', 1], ['t-shirt', pick(sizes['t-shirt']), between(1, 3)]];
    const gloves = pick(sizes.gloves);
    for (let k = between(1, 3); k > 0; k--) handOut.push(['gloves', gloves, 1]);
    if (person.qualifications.includes('breathing-apparatus')) handOut.push(['hood', '', 1]);
    handOuts.set(person.id, handOut);
  }
  // Received into the store before: what is handed out plus a remainder, so the counter never drops below zero.
  const demand = new Map<string, number>();
  for (const [articleKey, size, quantity] of [...handOuts.values()].flat()) demand.set(`${articleKey}|${size}`, (demand.get(`${articleKey}|${size}`) ?? 0) + quantity);
  for (const [articleKey, articleSizes] of [['gloves', sizes.gloves], ['cap', ['']], ['t-shirt', sizes['t-shirt']], ['hood', ['']]] as const) {
    for (const size of articleSizes) {
      const quantity = (demand.get(`${articleKey}|${size}`) ?? 0) + between(3, 15);
      await call('POST', 'clothing/consumables/receipts', { articleKey, size, quantity, date: daysAgo(1600), notes: 'Erstausstattung' });
    }
  }

  const issued: Piece[] = [];
  let consumables = 0;
  let replaced = 0;
  for (const person of members) {
    const departmentId = person.primaryDepartmentId!;
    const garmentSize = pick(garment.slice(2, 9));
    const kit: [string, string][] = [['jacket', garmentSize], ['trousers', garmentSize], ['boots', pick(sizes.boots.slice(2, 9))], ['helmet', pick(sizes.helmet)]];
    if (person.qualifications.includes('breathing-apparatus')) kit.push(['breathing-apparatus-trousers', pick(sizes['breathing-apparatus-trousers'])]);
    // Size profile of the person, preselecting the stock at the issue desk.
    await call('PUT', `clothing/persons/${person.id}/sizes`, { sizes: Object.fromEntries(kit) });
    for (const [articleKey, size] of kit) {
      // Some members had a worn piece replaced: the old one was taken back and retired.
      if (articleKey !== 'helmet' && chance(0.12)) {
        const old = await create(articleKey, departmentId, size, isoDate(new Date(between(2012, 2015), between(0, 11), between(1, 28))));
        const issuedOn = later('2016-01-01');
        await call('POST', `clothing/items/${old.id}/issue`, { personId: person.id, date: issuedOn, acceptOverdueInspection: true });
        await call('POST', `clothing/items/${old.id}/return`, { date: later(issuedOn), retire: true, notes: pick(['verschlissen', 'Riss im Obermaterial', 'Reflexstreifen beschädigt', 'zu klein']) });
        replaced++;
      }
      const purchasedOn = purchase();
      const piece = await create(articleKey, departmentId, size, purchasedOn);
      await call('POST', `clothing/items/${piece.id}/issue`, { personId: person.id, date: later(purchasedOn), acceptOverdueInspection: true });
      issued.push(piece);
    }
    for (const [articleKey, size, quantity] of handOuts.get(person.id) ?? []) {
      await call('POST', 'clothing/consumables', { personId: person.id, articleKey, size, quantity, date: daysAgo(between(10, 1500)) });
      consumables++;
    }
  }

  // Spare pieces in the store of each operational department.
  let stock = 0;
  for (const department of operational) {
    const departmentId = department.id;
    const large = members.filter((m) => m.primaryDepartmentId === departmentId).length > 30;
    for (const [articleKey, count] of [['jacket', 3], ['trousers', 3], ['boots', 2], ['helmet', 2], ['breathing-apparatus-trousers', 1]] as const) {
      for (let k = 0; k < (large ? count + 2 : count); k++) {
        const piece = await create(articleKey, departmentId, pick(sizes[articleKey]), purchase());
        if (articleKey === 'jacket' || articleKey === 'trousers') issued.push(piece);
        stock++;
      }
    }
  }

  // Washing: impregnation within the last year for most textiles, some overdue; washing in between.
  const textile = new Set(['jacket', 'trousers', 'breathing-apparatus-trousers']);
  const laundries = ['Wäscherei Sauber GmbH', 'Textilpflege Weiß', 'Feuerwehrhaus (Waschmaschine)'];
  const batches = new Map<string, string[]>();
  const add = (kind: string, date: string, place: string, id: string) => batches.set(`${kind}|${date}|${place}`, [...(batches.get(`${kind}|${date}|${place}`) ?? []), id]);
  // Collection days every few weeks, so the pieces of one laundry trip share a date.
  const days = Array.from({ length: 30 }, (_, i) => daysAgo(i * 17 + 3));
  for (const piece of issued.filter((p) => textile.has(p.articleKey))) {
    // Washing is recorded after the purchase only.
    const owned = days.filter((d) => d >= piece.purchasedOn);
    const overdue = chance(0.1);
    const impregnated = overdue ? owned.filter((d) => d < daysAgo(380))[between(0, 5)] : owned.filter((d) => d >= daysAgo(360))[between(0, 20)];
    if (impregnated) add('impregnation', impregnated, pick(laundries.slice(0, 2)), piece.id);
    const washed = owned.filter((d) => d >= days[19]);
    for (let k = 0; k < between(0, 3); k++) if (washed.length) add('wash', pick(washed), pick(laundries), piece.id);
  }
  for (const [key, itemIds] of batches) {
    const [kind, date, place] = key.split('|');
    await call('POST', 'clothing/care', { itemIds, kind, date, place });
  }

  // Yearly inspections by the clothing officers; some are overdue.
  const all = await call<{ id: string; articleKey: string; status: string; purchasedOn: string | null }[]>('GET', 'clothing/items');
  const inspected = new Set(['jacket', 'trousers', 'breathing-apparatus-trousers', 'boots', 'helmet']);
  let inspections = 0;
  for (const piece of all.filter((p) => inspected.has(p.articleKey) && p.status !== 'retired')) {
    if (chance(0.15)) continue;
    const drawn = chance(0.9) ? daysAgo(between(5, 350)) : daysAgo(between(380, 500));
    // Not before the purchase.
    const date = piece.purchasedOn && drawn < piece.purchasedOn ? piece.purchasedOn : drawn;
    await call('POST', `clothing/items/${piece.id}/inspections`, { date, passed: chance(0.97), inspector: pick(['Kleiderwart', 'Gerätewart', 'Fachfirma']), notes: chance(0.1) ? pick(['Klettverschluss erneuert', 'Reflexstreifen nachgenäht', 'Innenfutter geprüft']) : '' });
    inspections++;
  }
  console.log(`  ${issued.length} Stücke ausgegeben, ${stock} im Lager, ${replaced} getauscht, ${batches.size} Wäschen, ${inspections} Prüfungen, ${consumables} Verbrauchsartikel`);
}

/** Cost recovery: authority settings, a few false alarms of fire alarm systems as chargeable incidents with notices. */
async function costRecovery(): Promise<void> {
  const general = (await call<Record<string, unknown> | null>('GET', 'core/settings/cost-recovery.general')) ?? {};
  await call('PUT', 'core/settings/cost-recovery.general', {
    ...general,
    // State-specific values are a template the brigade takes over explicitly (here: Baden-Württemberg).
    ...BW_TEMPLATE,
    authority: 'Stadt Musterstadt – Bürgermeisteramt',
    authorityAddress: 'Feuerwehrstraße 1, 12345 Musterstadt',
    bankAccount: 'IBAN DE00 0000 0000 0000 0000 00 (Beispiel)',
    budgetAccount: '1.2600.1100',
    signer: 'Im Auftrag – Ordnungsamt',
    statute: 'Feuerwehr-Kostenersatzsatzung der Stadt Musterstadt (Beispiel)',
    // Personnel rates come from the local statute; these are example values.
    personnelRates: [{ kind: 'volunteer', validFrom: `${new Date().getFullYear() - 2}-01-01`, amount: 22 }, { kind: 'fire-watch', validFrom: `${new Date().getFullYear() - 2}-01-01`, amount: 16 }],
    materials: [{ key: 'oil-binder', name: 'Ölbindemittel (Sack)', unit: 'Sack', price: 18.5 }],
  });
  const year = new Date().getFullYear();
  if ((await call<unknown[]>('GET', 'cost-recovery/notices')).length) {
    console.log('  Bescheide vorhanden');
    return;
  }
  const incidents = await call<{ id: string; alarmKeyword: string; version: number; reports: { id: string; primary: boolean }[] }[]>('GET', `incidents/incidents?from=${year - 1}-01-01&to=${year}-12-31`);
  const alarms = incidents.filter((i) => /BMA/i.test(i.alarmKeyword)).slice(0, 3);
  for (const incident of alarms) {
    const primary = incident.reports.find((r) => r.primary) ?? incident.reports[0];
    if (!primary) continue;
    // Released reports are changed through the workflow: unlock, add the operator as party, submit, release again.
    const status = (await call<{ status: string }>('GET', `incidents/reports/${primary.id}`)).status;
    if (status.startsWith('released')) await call('POST', `incidents/reports/${primary.id}/unlock`, { reason: 'Betreiber als Beteiligten ergänzt (Demodaten)', toStatus: 'draft' });
    const report = await call<Record<string, unknown>>('GET', `incidents/reports/${primary.id}`);
    const saved = await call<{ findings: { rule: string; level: string; subject: string | null; acknowledged: boolean }[] }>('PUT', `incidents/reports/${primary.id}`, {
      ...report,
      involvedParties: [{ role: 'owner', name: 'Muster Logistik GmbH', street: 'Industriestraße 4', postalCode: '12345', city: 'Musterstadt' }],
      statistics: report['statistics'] ?? { mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' },
    });
    // Notices need reports released for billing.
    const acknowledgements = saved.findings.filter((f) => f.level === 'warning' && !f.acknowledged).map((f) => ({ rule: f.rule, subject: f.subject, reason: 'Demodaten' }));
    if ((await call<{ status: string }>('GET', `incidents/reports/${primary.id}`)).status === 'draft') await call('POST', `incidents/reports/${primary.id}/submit`, { acknowledgements });
    await call('POST', `incidents/reports/${primary.id}/release`, { level: 'billing' });
    // Costs apply to the whole incident.
    await call('PUT', `incidents/incidents/${incident.id}/costs`, { chargeable: true, chargeableReason: 'Fehlalarm der Brandmeldeanlage', notes: 'Betreiber über Kostenpflicht informiert' });
  }
  // Notices can only be issued for incidents whose reports are released for billing: those first.
  const candidates = (await call<{ incidentId: string; released: boolean }[]>('GET', `cost-recovery/candidates?from=${year - 1}-01-01&to=${year}-12-31`)).toSorted((a, b) => Number(b.released) - Number(a.released));
  for (const [index, candidate] of candidates.slice(0, 2).entries()) {
    const notice = await call<{ id: string }>('POST', 'cost-recovery/notices', { incidentId: candidate.incidentId });
    if (index === 0 && candidate.released) {
      await call('POST', `cost-recovery/notices/${notice.id}/submit`, {});
      await call('POST', `cost-recovery/notices/${notice.id}/issue`, {});
    }
  }
  console.log(`  ${alarms.length} BMA-Fehlalarme kostenpflichtig, ${Math.min(candidates.length, 2)} Bescheide`);
}

/** Rules of the VwV 2022 and a draft promotion list for the next general meeting. */
async function promotions(): Promise<void> {
  const current = await call<{ rules?: unknown[] } | null>('GET', 'core/settings/promotions.general');
  if (!current?.rules?.length) {
    await call('PUT', 'core/settings/promotions.general', { ...current, rules: VWV_2022_RULES, certificatePlace: 'Musterstadt', certificateSigner: 'Kommandant' });
  }
  const lists = await call<unknown[]>('GET', 'promotions/lists');
  if (lists.length) return;
  const year = new Date().getFullYear();
  const list = await call<{ entries: unknown[] }>('POST', 'promotions/lists', { title: `Hauptversammlung ${year + 1}`, referenceDate: `${year + 1}-01-15`, effectiveDate: `${year + 1}-01-15` });
  console.log(`  Beförderungsliste mit ${list.entries.length} Vorschlägen`);
}

async function main(): Promise<void> {
  console.log(`f.orga seed → ${BASE}`);
  await login();
  // `--only clothing`: only the clothing store, for an instance that already has persons.
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  if (only === 'clothing') {
    console.log('Kleiderkammer …');
    await clothing(await call<PersonRef[]>('GET', 'masterdata/persons'));
    console.log('Fertig.');
    return;
  }
  console.log('Einstellungen und Vorlagen …');
  await settings();
  console.log('Organisation …');
  const departments = await organization();

  console.log('Personen (Personal.xlsx) …');
  const planned = planPersons();
  await importFile('Personal.xlsx', await personsWorkbook(planned), 'masterdata.persons', { createDepartments: false, updateExisting: true });
  let persons = await call<PersonRef[]>('GET', 'masterdata/persons');
  await careers(planned, persons);
  persons = await call<PersonRef[]>('GET', 'masterdata/persons');

  console.log('Benutzer je Rolle …');
  const accounts = await users(persons, departments);
  console.log('Gruppen, Lehrgänge und Bankverbindungen …');
  await groups(persons, departments, accounts);
  await coursePlanning(departments);
  await bankAccounts(persons);
  persons = await call<PersonRef[]>('GET', 'masterdata/persons');

  console.log('Einsätze (MP-EXCEL.xlsx) …');
  const byNumber = new Map(persons.map((p) => [p.personnelNumber, p]));
  const members = new Map<string, PersonRef[]>();
  for (const plan of planned) {
    const person = byNumber.get(plan.personnelNumber);
    if (person) members.set(plan.department.name, [...(members.get(plan.department.name) ?? []), person]);
  }
  const { file, incidents } = await incidentsWorkbook(members);
  console.log(`  ${incidents} Einsätze erzeugt`);
  await importFile('MP-EXCEL.xlsx', file, 'incidents.mp-feuer', { createKeywords: true });

  console.log('Dienstplan (evd.ics) …');
  const officers = persons.filter((p) => p.qualifications.includes('platoon-leader') || p.qualifications.includes('group-leader')).slice(0, 4);
  if (officers.length) await importFile('evd.ics', dutyCalendar(officers), 'incidents.duty-roster');

  console.log('Übungsdienst …');
  await training(members, departments);

  console.log('Atemschutz …');
  await respiratoryProtection(persons);

  console.log('Entschädigungen …');
  await compensation(persons);

  console.log('Geräte …');
  await equipment(persons);

  console.log('Kleiderkammer …');
  await clothing(persons);

  console.log('Kostenersatz …');
  await costRecovery();

  console.log('Beförderungen …');
  await promotions();

  console.log('Fertig.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
