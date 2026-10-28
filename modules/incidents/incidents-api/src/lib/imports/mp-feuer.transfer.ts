import { groupRows, type TransferArchive, transferFlag, transferPersonName, transferPersons, type TransferRow } from '@forga/core-api';

/**
 * Reports (`EIN_STAMM`) with their personnel (`EIN_PERS`, child rows with `EIN_INDEX` = `EIN_ID`). The report fields are
 * only in the first row of a report, the personnel rows repeat the key (department, incident number, begin).
 * Personnel numbers of MP-Feuer are counted per department, so persons are passed by name. The own times and kilometres
 * of a person's vehicle in the report (`EIN_FAHRZ`, by `EIN_INDEX` and `EIN_FZG_INDEX`) come with each personnel row.
 */
export function readIncidents(archives: readonly TransferArchive[]): TransferRow[] {
  const persons = transferPersons(archives);
  const rows: TransferRow[] = [];
  for (const archive of archives) {
    if (!archive.has('EIN_STAMM') || !archive.has('EIN_PERS')) continue;
    const personnel = groupRows(archive.query(`select * from EIN_PERS order by EIN_PER_ZEIT_V`), 'EIN_INDEX');
    // Vehicles per report with their own times and kilometres, keyed by report and vehicle.
    const vehicles = new Map(
      (archive.has('EIN_FAHRZ') ? archive.query('select * from EIN_FAHRZ') : []).map((v) => [`${v['EIN_INDEX']}|${v['EIN_FZG_INDEX']}`, v]),
    );
    for (const s of archive.query(`select * from EIN_STAMM where EIN_ZEIT_V <> '' order by EIN_ZEIT_V`)) {
      const key = { department: archive.label, incidentNumber: s['EIN_NR'] || s['EIN_ID'], begin: s['EIN_ZEIT_V'] };
      rows.push({
        archive: archive.key,
        values: {
          ...key,
          dispatchNumber: s['EIN_LS_NR'],
          end: s['EIN_ZEIT_B'],
          // Reports without alarm keyword (e.g. administrative support) are keyed by their incident type.
          keyword: s['EIN_ALARMSTICHWORT'] || s['EIN_ART'] || s['EIN_KATEGORIE_OW'],
          message: s['EIN_ERLAEUTERUNG'],
          street: s['EIN_ORT_STRASSE'],
          postalCode: s['EIN_ORT_PLZ'],
          city: s['EIN_ORT_ORT'] || s['EIN_ORT'],
          district: s['EIN_ORT_ORTSTEIL'],
          object: s['EIN_ORT_ZUSATZ'] || s['EIN_ORT_OBJEKT'],
          primary: transferFlag(s['EIN_MERKMAL_ST_GLOBAL']),
          status: s['EIN_ZUSATZ_2'],
          situation: s['EIN_LAGE'],
          actions: s['EIN_VERLAUF'],
          narrative: s['EIN_BERICHT'],
          cause: s['EIN_URSACHE'],
          commander: s['EIN_LEITUNG'],
          statistics: s['EIN_STATISTIK'],
          incidentType: s['EIN_ART'],
          rescued: s['EIN_RETTUNG_P_S'],
          dead: s['EIN_VERLUSTE_S'],
          animalsRescued: s['EIN_RETTUNG_T_S'],
          chargeable: transferFlag(s['EIN_MERKMAL_KO']),
        },
      });
      for (const p of personnel.get(s['EIN_ID']) ?? []) {
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
    }
  }
  return rows;
}
