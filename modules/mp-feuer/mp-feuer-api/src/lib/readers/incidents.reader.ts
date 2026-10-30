import type { PartyRole, ReportStatus, Weather } from '@forga/incidents-contracts';
import { groupRows, type TransferArchive, transferFlag, transferPersonName, transferPersons, type TransferRow } from '../archive/transfer-archive.js';
import { statisticsColumns } from './statistics.js';

/** Release status from "Zusatzfeld 2" of MP-Feuer, e.g. "zur Abrechnung freigegeben". */
export function releaseStatus(text: string | undefined): ReportStatus {
  const value = (text ?? '').toLowerCase();
  if (value.includes('abrechnung')) return 'released-billing';
  if (value.includes('entschädigung') || value.includes('auszahlung')) return 'released-compensation';
  return 'draft';
}

/**
 * Rows for the profile `incidents.personnel`: reports (`EIN_STAMM`) with their personnel (`EIN_PERS`, child rows with
 * `EIN_INDEX` = `EIN_ID`). The report fields are only in the first row of a report, the personnel rows repeat the key
 * (department, incident number, begin).
 * Personnel numbers of MP-Feuer are counted per department, so persons are passed by name. The own times and kilometres
 * of a person's vehicle in the report (`EIN_FAHRZ`, by `EIN_INDEX` and `EIN_FZG_INDEX`) come with each personnel row.
 * A vehicle nobody is booked on becomes a row of its own. Material (`EIN_MAT`) is the equipment text, other
 * organisations (`EIN_SOEK`) and involved parties (`EIN_BETR`) travel as JSON, weather from the two weather columns.
 * An empty situation with a report text becomes "siehe Bericht".
 * MP-Feuer specifics become the columns of the profile: "bei Ges. Stat. anzeigen" the primary report, "Zusatzfeld 2"
 * the release status and the statistics key the statistics columns.
 */
export function readIncidents(archives: readonly TransferArchive[]): TransferRow[] {
  const persons = transferPersons(archives);
  const rows: TransferRow[] = [];
  for (const archive of archives) {
    if (!archive.has('EIN_STAMM') || !archive.has('EIN_PERS')) continue;
    const personnel = groupRows(archive.query(`select * from EIN_PERS order by EIN_PER_ZEIT_V`), 'EIN_INDEX');
    const vehicleRows = groupRows(archive.has('EIN_FAHRZ') ? archive.query('select * from EIN_FAHRZ') : [], 'EIN_INDEX');
    const material = groupRows(archive.has('EIN_MAT') ? archive.query('select * from EIN_MAT') : [], 'EIN_INDEX');
    const agencies = groupRows(archive.has('EIN_SOEK') ? archive.query('select * from EIN_SOEK') : [], 'EIN_INDEX');
    const parties = groupRows(archive.has('EIN_BETR') ? archive.query('select * from EIN_BETR') : [], 'EIN_INDEX');
    // Vehicles per report with their own times and kilometres, keyed by report and vehicle.
    const vehicles = new Map([...vehicleRows.values()].flat().map((v) => [`${v['EIN_INDEX']}|${v['EIN_FZG_INDEX']}`, v]));
    for (const s of archive.query(`select * from EIN_STAMM where EIN_ZEIT_V <> '' order by EIN_ZEIT_V`)) {
      const crew = personnel.get(s['EIN_ID']) ?? [];
      const fleet = vehicleRows.get(s['EIN_ID']) ?? [];
      const key = { department: archive.label, incidentNumber: s['EIN_NR'] || s['EIN_ID'], begin: s['EIN_ZEIT_V'] };
      const situation = cell(s, 'EIN_LAGE') || (cell(s, 'EIN_BERICHT') ? 'siehe Bericht' : '');
      rows.push({
        archive: archive.key,
        values: {
          ...key,
          dispatchNumber: s['EIN_LS_NR'],
          end: s['EIN_ZEIT_B'],
          departed: earliest(fleet, 'EIN_FZG_ZEIT_AUS'),
          // Reports without alarm keyword (e.g. administrative support) are keyed by their incident type.
          keyword: s['EIN_ALARMSTICHWORT'] || s['EIN_ART'] || s['EIN_KATEGORIE_OW'],
          message: s['EIN_ERLAEUTERUNG'],
          street: s['EIN_ORT_STRASSE'],
          postalCode: s['EIN_ORT_PLZ'],
          city: s['EIN_ORT_ORT'] || s['EIN_ORT'],
          district: s['EIN_ORT_ORTSTEIL'],
          object: s['EIN_ORT_ZUSATZ'] || s['EIN_ORT_OBJEKT'],
          primary: transferFlag(s['EIN_MERKMAL_ST_GLOBAL']),
          status: releaseStatus(s['EIN_ZUSATZ_2']),
          situation,
          actions: s['EIN_VERLAUF'],
          narrative: s['EIN_BERICHT'],
          remark: cell(s, 'EIN_BEMERKUNG'),
          cause: s['EIN_URSACHE'],
          commander: s['EIN_LEITUNG'],
          equipment: equipmentText(material.get(s['EIN_ID']) ?? []),
          weather: JSON.stringify(weatherOf(cell(s, 'EIN_WETTEREINFLUSS'), cell(s, 'EIN_WETTERLAGE'))),
          agencies: JSON.stringify(agencyList(agencies.get(s['EIN_ID']) ?? [])),
          involved: JSON.stringify(partyList(parties.get(s['EIN_ID']) ?? [])),
          ...statisticsColumns(s['EIN_STATISTIK'], { rescued: s['EIN_RETTUNG_P_S'], dead: s['EIN_VERLUSTE_S'], animalsRescued: s['EIN_RETTUNG_T_S'], incidentType: s['EIN_ART'] }),
          chargeable: transferFlag(s['EIN_MERKMAL_KO']),
        },
      });
      const linked = new Set(crew.map((p) => p['EIN_FZG_INDEX']).filter(Boolean));
      for (const p of crew) {
        const person = persons.get(p['EIN_PER_INDEX']);
        const vehicle = p['EIN_FZG_INDEX'] ? vehicles.get(`${s['EIN_ID']}|${p['EIN_FZG_INDEX']}`) : undefined;
        rows.push({
          archive: archive.key,
          values: {
            ...key,
            personName: person ? transferPersonName(person) : p['EIN_PER_NAME'],
            from: p['EIN_PER_ZEIT_V'],
            to: p['EIN_PER_ZEIT_B'],
            vehicle: p['EIN_FZG_RUFNAME'] || p['EIN_FZG_BEZEICHNUNG'],
            vehicleAlarmedAt: vehicle?.['EIN_FZG_ZEIT_ALARM'] ?? '',
            vehicleDepartedAt: vehicle?.['EIN_FZG_ZEIT_AUS'] ?? '',
            vehicleReturnedAt: vehicle?.['EIN_FZG_ZEIT_EIN'] ?? '',
            vehicleKilometres: vehicle?.['EIN_FZG_KILOMETER'] ?? '',
            standby: transferFlag(p['EIN_PER_MERKMAL_BE']),
            breathing: transferFlag(p['EIN_PER_MERKMAL_AS']),
            lossOfEarnings: transferFlag(p['EIN_PER_MERKMAL_VA']),
            function: p['EIN_PER_AUFGABE'],
          },
        });
      }
      for (const v of fleet) {
        if (linked.has(v['EIN_FZG_INDEX'])) continue;
        const name = cell(v, 'EIN_FZG_RUFNAME') || cell(v, 'EIN_FZG_BEZEICHNUNG');
        if (!name) continue;
        rows.push({ archive: archive.key, values: { ...key, ...vehicleTimes(v, name) } });
      }
    }
  }
  return rows;
}

const cell = (row: Record<string, string>, column: string) => (row[column] ?? '').trim();

function vehicleTimes(v: Record<string, string>, name: string): Record<string, string> {
  return {
    vehicle: name,
    vehicleAlarmedAt: v['EIN_FZG_ZEIT_ALARM'] ?? '',
    vehicleDepartedAt: v['EIN_FZG_ZEIT_AUS'] ?? '',
    vehicleReturnedAt: v['EIN_FZG_ZEIT_EIN'] ?? '',
    vehicleKilometres: v['EIN_FZG_KILOMETER'] ?? '',
  };
}

function earliest(rows: readonly Record<string, string>[], column: string): string {
  return rows.map((r) => r[column] ?? '').filter(Boolean).toSorted()[0] ?? '';
}

/** "2 Stk. Scheinwerfer", one line per material row. */
function equipmentText(rows: readonly Record<string, string>[]): string {
  return rows
    .map((r) => {
      const name = cell(r, 'EIN_MAT_BEZEICHNUNG');
      if (!name) return '';
      const count = [cell(r, 'EIN_MAT_ANZAHL'), cell(r, 'EIN_MAT_EINHEIT')].filter(Boolean).join(' ');
      const inventory = cell(r, 'EIN_MAT_INVENTAR_NR');
      return [count && `${count} `, name, inventory && ` (${inventory})`].filter(Boolean).join('');
    })
    .filter(Boolean)
    .join('\n');
}

const WEATHER: [RegExp, Weather['conditions'][number]][] = [
  [/regen|niederschlag/, 'rain'],
  [/schnee|glätte|glaette/, 'snow'],
  [/eis(?!en)|glatt/, 'ice'],
  [/sturm|wind/, 'storm'],
  [/gewitter|blitz/, 'thunderstorm'],
  [/nebel/, 'fog'],
  [/hitz|heiß|heiss/, 'heat'],
];

function weatherOf(influence: string, situation: string): Weather {
  const text = `${influence} ${situation}`.toLowerCase();
  const conditions = WEATHER.filter(([pattern]) => pattern.test(text)).map(([, condition]) => condition);
  const marked = /negativ|positiv/.test(influence.toLowerCase());
  return { influence: marked || conditions.length > 0, conditions };
}

function agencyOf(name: string): string {
  const text = name.toLowerCase();
  if (/polizei/.test(text)) return 'police';
  if (/notarzt|notärzt/.test(text)) return 'emergency-doctor';
  if (/rettung|hubschrauber|\brth\b/.test(text)) return 'ambulance';
  if (/\bthw\b/.test(text)) return 'thw';
  if (/feuerwehr|\bfw\b/.test(text)) return 'neighbouring-brigade';
  if (/stadtwerke|energieversorger/.test(text)) return 'utility';
  return name.trim();
}

function countOrText(value: string): { count: number | null; text: string } {
  const text = value.trim();
  if (!text) return { count: null, text: '' };
  return /^\d+$/.test(text) ? { count: Number(text), text: '' } : { count: null, text };
}

function agencyList(rows: readonly Record<string, string>[]): { organization: string; forces: number | null; vehicles: number | null; notes: string }[] {
  return rows.flatMap((r) => {
    const name = cell(r, 'EIN_SOEK_BEZEICHNUNG');
    if (!name) return [];
    const forces = countOrText(cell(r, 'EIN_SOEK_BESATZUNG'));
    const vehicles = countOrText(cell(r, 'EIN_SOEK_FAHRZEUG'));
    return [{ organization: agencyOf(name), forces: forces.count, vehicles: vehicles.count, notes: [forces.text, vehicles.text].filter(Boolean).join(', ') }];
  });
}

function partyRole(row: Record<string, string>): PartyRole {
  const on = (flag: string) => row[flag] === '1';
  if (on('EIN_BETR_MERKMAL_ZE')) return 'witness';
  if (on('EIN_BETR_MERKMAL_VE')) return 'causer';
  if (on('EIN_BETR_MERKMAL_ME')) return 'caller';
  if (on('EIN_BETR_MERKMAL_EI')) return 'owner';
  if (on('EIN_BETR_MERKMAL_GE')) return 'injured-party';
  return 'other';
}

function partyList(rows: readonly Record<string, string>[]): { role: PartyRole; name: string; street: string; postalCode: string; city: string; phone: string; licensePlate: string; notes: string }[] {
  return rows.flatMap((r) => {
    const person = [cell(r, 'EIN_BETR_VORNAME'), cell(r, 'EIN_BETR_NACHNAME')].filter(Boolean).join(' ');
    const name = person || cell(r, 'EIN_BETR_FIRMA');
    if (!name) return [];
    return [{
      role: partyRole(r),
      name,
      street: cell(r, 'EIN_BETR_STRASSE'),
      postalCode: cell(r, 'EIN_BETR_PLZ'),
      city: cell(r, 'EIN_BETR_ORT'),
      phone: cell(r, 'EIN_BETR_TEL_PRIV') || cell(r, 'EIN_BETR_MOB_PRIV') || cell(r, 'EIN_BETR_TEL_GES'),
      licensePlate: cell(r, 'EIN_BETR_KENNZEICHEN'),
      notes: r['EIN_BETR_MERKMAL_KO'] === '1' ? 'kostenpflichtig' : '',
    }];
  });
}
