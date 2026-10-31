import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { BrigadeSettings } from '@forga/core-contracts';
import { type Category, type Defect, EquipmentSettings, type EquipmentType, type Inspection, type Item, type ItemIncident, type ItemSummary } from '@forga/equipment-contracts';
import type { Department, PersonSummary, Station, Vehicle } from '@forga/masterdata-contracts';
import { api, can, localDate, useLocalized, useSession, withQuery } from '@forga/web-sdk';
import { treeLabel } from '@forga/web-ui';

export const READ = 'equipment.read';
export const WRITE = 'equipment.write';
export const INSPECT = 'equipment.inspect';
export const TRIGGER = 'equipment.trigger';
export const REPORT = 'equipment.defects.report';
export const SETTINGS = 'equipment.settings.manage';
/** For items of breathing apparatus categories only (breathing apparatus officer). */
export const BREATHING_WRITE = 'equipment.breathing.write';
export const BREATHING_INSPECT = 'equipment.breathing.inspect';

export const keys = {
  all: ['equipment'] as const,
  item: (id: string) => ['equipment', 'items', id] as const,
};

const LONG = 5 * 60_000;

export type ItemFilter = { categoryKey?: string; departmentId?: string; vehicleId?: string; status?: string; q?: string; includeRetired?: string; dueBefore?: string; withoutLabel?: string };

export const useItems = (filter: ItemFilter, enabled = true) => useQuery({ queryKey: [...keys.all, 'items', filter], queryFn: () => api<Item[]>(withQuery('equipment/items', filter)), enabled });
/** The item, or its summary for members who may only report defects. */
export const useItem = (id: string) => useQuery({ queryKey: keys.item(id), queryFn: () => api<Item | ItemSummary>(`equipment/items/${id}`) });
export const useInspections = (id: string, enabled = true) => useQuery({ queryKey: [...keys.item(id), 'inspections'], queryFn: () => api<Inspection[]>(`equipment/items/${id}/inspections`), enabled });
export const useEquipmentSettings = () =>
  useQuery({ queryKey: ['core', 'settings', 'equipment.settings'], queryFn: async () => EquipmentSettings.parse((await api<EquipmentSettings | null>('core/settings/equipment.settings')) ?? {}), staleTime: LONG });
const useBrigade = () => useQuery({ queryKey: ['core', 'settings', 'brigade'], queryFn: () => api<BrigadeSettings | null>('core/settings/brigade'), staleTime: LONG });
export const useItemIncidents = (id: string) => useQuery({ queryKey: [...keys.item(id), 'incidents'], queryFn: () => api<ItemIncident[]>(`equipment/items/${id}/incidents`) });
export const useDefects = (filter: { open?: string; itemId?: string }) => useQuery({ queryKey: [...keys.all, 'defects', filter], queryFn: () => api<Defect[]>(withQuery('equipment/defects', filter)) });
export const useCategories = () => useQuery({ queryKey: [...keys.all, 'categories'], queryFn: () => api<Category[]>('equipment/categories'), staleTime: LONG });
export const useRecentCategories = () => useQuery({ queryKey: [...keys.all, 'bulk-recent'], queryFn: () => api<{ categoryKeys: string[] }>('equipment/inspections/bulk/recent') });
export const useTypes = () => useQuery({ queryKey: [...keys.all, 'types'], queryFn: () => api<EquipmentType[]>('equipment/types'), staleTime: LONG });
export const useDepartments = () => useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
export const useStations = () => useQuery({ queryKey: ['masterdata', 'stations'], queryFn: () => api<Station[]>('masterdata/stations'), staleTime: LONG });
export const useVehicles = () => useQuery({ queryKey: ['masterdata', 'vehicles'], queryFn: () => api<Vehicle[]>('masterdata/vehicles'), staleTime: LONG });
export const usePersons = () =>
  useQuery({ queryKey: ['masterdata', 'persons', 'summaries'], queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []), staleTime: LONG });

/**
 * What the user may do with an item: write (status, defects) and inspect with the general permission, or for
 * breathing apparatus also with the breathing apparatus permission.
 */
export function useItemAccess() {
  const session = useSession().data;
  const { data: categories = [] } = useCategories();
  const breathing = (categoryKey: string) => Boolean(categories.find((c) => c.key === categoryKey)?.breathingApparatus);
  const may = (general: string, special: string) => (item: { departmentId: string; categoryKey: string }) =>
    can(session, general, item.departmentId) || (breathing(item.categoryKey) && can(session, special, item.departmentId));
  const canInspect = may(INSPECT, BREATHING_INSPECT);
  const canTrigger = (item: { departmentId: string; categoryKey: string }) => can(session, TRIGGER, item.departmentId) || canInspect(item);
  return {
    canWrite: may(WRITE, BREATHING_WRITE),
    canInspect,
    canTrigger,
    /** Anywhere: bulk booking is offered (recording, marking due, or moving). */
    booksAnything: can(session, INSPECT) || can(session, BREATHING_INSPECT) || can(session, TRIGGER) || can(session, WRITE) || can(session, BREATHING_WRITE),
    recordsAnything: can(session, INSPECT) || can(session, BREATHING_INSPECT),
    movesAnything: can(session, WRITE) || can(session, BREATHING_WRITE),
  };
}

/** "Due soon" ends after the configured days (setting `equipment.settings`). */
export function useDueSoon(): { today: string; soon: string; days: number } {
  const { data } = useEquipmentSettings();
  const days = data?.dueSoonDays ?? EquipmentSettings.parse({}).dueSoonDays;
  const [today] = useState(() => localDate());
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + days);
  return { today, soon: end.toISOString().slice(0, 10), days };
}

/**
 * Address the QR labels point to: the public address of the brigade settings, so labels printed on a computer in
 * the local network still open f.orga on the phone. Without it the address of this page (`configured: false`).
 */
export function useLabelBase(): { base: string; configured: boolean } {
  const { data } = useBrigade();
  const configured = /^https?:\/\//.test(data?.publicUrl ?? '');
  return { base: configured ? data!.publicUrl.replace(/\/$/, '') : window.location.origin, configured };
}

export function useCategoryName() {
  const { data = [] } = useCategories();
  const localized = useLocalized();
  return (key: string) => treeLabel(data, key, (c) => localized(c.name));
}

/** Current place, then "Florian Musterstadt 1/44 · G1" or the station. */
export function usePlace() {
  const { data: vehicles = [] } = useVehicles();
  const { data: stations = [] } = useStations();
  return (item: Pick<Item, 'vehicleId' | 'stationId' | 'loadingPlace' | 'location'>) => {
    const vehicle = vehicles.find((x) => x.id === item.vehicleId);
    const assigned = item.vehicleId
      ? [vehicle ? vehicle.radioCallSign || vehicle.designation : '', item.loadingPlace].filter(Boolean).join(' · ')
      : [stations.find((x) => x.id === item.stationId)?.name, item.loadingPlace].filter(Boolean).join(' · ');
    return [item.location, assigned].filter(Boolean).join(' · ');
  };
}
