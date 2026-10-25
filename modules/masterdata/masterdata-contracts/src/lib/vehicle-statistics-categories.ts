import type { LocalizedText } from '@forga/core-contracts';

export type VehicleStatisticsGroup = 'extinguishing' | 'aerial' | 'rescue-equipment' | 'other' | 'trailer' | 'medical';

export interface VehicleStatisticsCategory {
  /** Question ID of the state statistics import template, e.g. `F70`. */
  id: string;
  group: VehicleStatisticsGroup;
  name: LocalizedText;
}

/** Vehicle positions F63–F120 of the annual statistics template (Landesportal LFS BW). Fixed, not editable. */
export const VEHICLE_STATISTICS_CATEGORIES: readonly VehicleStatisticsCategory[] = [
  { id: 'F63', group: 'extinguishing', name: { de: 'TSF', en: 'TSF' } },
  { id: 'F64', group: 'extinguishing', name: { de: 'TSF-W', en: 'TSF-W' } },
  { id: 'F65', group: 'extinguishing', name: { de: 'StLF 10/6, MLF', en: 'StLF 10/6, MLF' } },
  { id: 'F66', group: 'extinguishing', name: { de: 'LF 8', en: 'LF 8' } },
  { id: 'F67', group: 'extinguishing', name: { de: 'LF 8/6, (H)LF 10/6, LF 10, HLF 10', en: 'LF 8/6, (H)LF 10/6, LF 10, HLF 10' } },
  { id: 'F68', group: 'extinguishing', name: { de: 'LF 16, LF 20', en: 'LF 16, LF 20' } },
  { id: 'F69', group: 'extinguishing', name: { de: 'LF 16-TS, LF KatS', en: 'LF 16-TS, LF KatS' } },
  { id: 'F70', group: 'extinguishing', name: { de: 'LF 16/12, (H)LF 20/16, HLF 20', en: 'LF 16/12, (H)LF 20/16, HLF 20' } },
  { id: 'F71', group: 'extinguishing', name: { de: 'LF 24', en: 'LF 24' } },
  { id: 'F72', group: 'extinguishing', name: { de: 'TLF 8/18, TLF 2000', en: 'TLF 8/18, TLF 2000' } },
  { id: 'F73', group: 'extinguishing', name: { de: 'TLF 16/24-Tr, TLF 3000', en: 'TLF 16/24-Tr, TLF 3000' } },
  { id: 'F74', group: 'extinguishing', name: { de: 'TLF 16/25', en: 'TLF 16/25' } },
  { id: 'F75', group: 'extinguishing', name: { de: 'TLF 24/50, TLF 20/40-SL', en: 'TLF 24/50, TLF 20/40-SL' } },
  { id: 'F76', group: 'extinguishing', name: { de: 'TLF 20/40, TLF 4000', en: 'TLF 20/40, TLF 4000' } },
  { id: 'F77', group: 'extinguishing', name: { de: 'Sonstige Löschfahrzeuge', en: 'Other fire engines' } },
  { id: 'F78', group: 'aerial', name: { de: 'DL 16-4', en: 'DL 16-4' } },
  { id: 'F79', group: 'aerial', name: { de: 'DL 12-9', en: 'DL 12-9' } },
  { id: 'F80', group: 'aerial', name: { de: 'DLAK 12-9', en: 'DLAK 12-9' } },
  { id: 'F81', group: 'aerial', name: { de: 'DL 18-12', en: 'DL 18-12' } },
  { id: 'F82', group: 'aerial', name: { de: 'DLAK 18-12', en: 'DLAK 18-12' } },
  { id: 'F83', group: 'aerial', name: { de: 'DL 23-12', en: 'DL 23-12' } },
  { id: 'F84', group: 'aerial', name: { de: 'DLAK 23-12', en: 'DLAK 23-12' } },
  { id: 'F85', group: 'aerial', name: { de: 'GM/TM', en: 'GM/TM' } },
  { id: 'F86', group: 'aerial', name: { de: 'Sonstige', en: 'Other' } },
  { id: 'F87', group: 'rescue-equipment', name: { de: 'RW 1', en: 'RW 1' } },
  { id: 'F88', group: 'rescue-equipment', name: { de: 'RW (RW 2/RW 3)', en: 'RW (RW 2/RW 3)' } },
  { id: 'F89', group: 'rescue-equipment', name: { de: 'GW-G1', en: 'GW-G1' } },
  { id: 'F90', group: 'rescue-equipment', name: { de: 'GW-G (GW-G2 alt)', en: 'GW-G (formerly GW-G2)' } },
  { id: 'F91', group: 'rescue-equipment', name: { de: 'GW-A', en: 'GW-A' } },
  { id: 'F92', group: 'rescue-equipment', name: { de: 'GW-AS', en: 'GW-AS' } },
  { id: 'F93', group: 'rescue-equipment', name: { de: 'GW-Öl', en: 'GW-Öl (oil)' } },
  { id: 'F94', group: 'rescue-equipment', name: { de: 'GW-Str', en: 'GW-Str' } },
  { id: 'F95', group: 'rescue-equipment', name: { de: 'VRW/VGW', en: 'VRW/VGW' } },
  { id: 'F96', group: 'rescue-equipment', name: { de: 'Sonstige RW', en: 'Other rescue vehicles' } },
  { id: 'F97', group: 'rescue-equipment', name: { de: 'Sonstige GW', en: 'Other equipment vehicles' } },
  { id: 'F98', group: 'other', name: { de: 'KdoW (ELW 1 alt)', en: 'KdoW (formerly ELW 1)' } },
  { id: 'F99', group: 'other', name: { de: 'ELW 1 (ELW 2 alt)', en: 'ELW 1 (formerly ELW 2)' } },
  { id: 'F100', group: 'other', name: { de: 'ELW 2 (ELW 3 alt)', en: 'ELW 2 (formerly ELW 3)' } },
  { id: 'F101', group: 'other', name: { de: 'SW 1000', en: 'SW 1000' } },
  { id: 'F102', group: 'other', name: { de: 'SW 2000', en: 'SW 2000' } },
  { id: 'F103', group: 'other', name: { de: 'FwK', en: 'FwK' } },
  { id: 'F104', group: 'other', name: { de: 'WLF', en: 'WLF' } },
  { id: 'F105', group: 'other', name: { de: 'AB', en: 'AB' } },
  { id: 'F106', group: 'other', name: { de: 'GW-T (auch als SW), GW-L', en: 'GW-T (also as SW), GW-L' } },
  { id: 'F107', group: 'other', name: { de: 'MTW', en: 'MTW' } },
  { id: 'F108', group: 'other', name: { de: 'Feuerlöschboot', en: 'Fireboat' } },
  { id: 'F109', group: 'other', name: { de: 'MZB', en: 'MZB' } },
  { id: 'F110', group: 'other', name: { de: 'RTB 2', en: 'RTB 2' } },
  { id: 'F111', group: 'other', name: { de: 'Sonstige Fahrzeuge', en: 'Other vehicles' } },
  { id: 'F112', group: 'trailer', name: { de: 'FwA-TS', en: 'FwA-TS' } },
  { id: 'F113', group: 'trailer', name: { de: 'Sonstige FwA', en: 'Other trailers' } },
  { id: 'F114', group: 'medical', name: { de: 'KTW', en: 'KTW' } },
  { id: 'F115', group: 'medical', name: { de: 'RTW', en: 'RTW' } },
  { id: 'F116', group: 'medical', name: { de: 'NAW', en: 'NAW' } },
  { id: 'F117', group: 'medical', name: { de: 'NEF', en: 'NEF' } },
  { id: 'F118', group: 'medical', name: { de: 'GRTW', en: 'GRTW' } },
  { id: 'F119', group: 'medical', name: { de: 'GKTW', en: 'GKTW' } },
  { id: 'F120', group: 'medical', name: { de: 'Sonstige Sanitätsfahrzeuge', en: 'Other ambulances' } },
];

export const VEHICLE_STATISTICS_CATEGORY_IDS = VEHICLE_STATISTICS_CATEGORIES.map((c) => c.id);
