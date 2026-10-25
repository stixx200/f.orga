import { useQuery } from '@tanstack/react-query';
import type { Category, Defect, EquipmentType, Inspection, Item, ItemIncident } from '@forga/equipment-contracts';
import type { Department, PersonSummary, Station, Vehicle } from '@forga/masterdata-contracts';
import { api, useLocalized, withQuery } from '@forga/web-sdk';

export const READ = 'equipment.read';
export const WRITE = 'equipment.write';
export const INSPECT = 'equipment.inspect';
export const REPORT = 'equipment.defects.report';
export const SETTINGS = 'equipment.settings.manage';

export const keys = {
  all: ['equipment'] as const,
  item: (id: string) => ['equipment', 'items', id] as const,
};

const LONG = 5 * 60_000;

export type ItemFilter = { categoryKey?: string; departmentId?: string; vehicleId?: string; status?: string; q?: string; includeRetired?: string; dueBefore?: string };

export const useItems = (filter: ItemFilter, enabled = true) => useQuery({ queryKey: [...keys.all, 'items', filter], queryFn: () => api<Item[]>(withQuery('equipment/items', filter)), enabled });
export const useItem = (id: string) => useQuery({ queryKey: keys.item(id), queryFn: () => api<Item>(`equipment/items/${id}`) });
export const useInspections = (id: string) => useQuery({ queryKey: [...keys.item(id), 'inspections'], queryFn: () => api<Inspection[]>(`equipment/items/${id}/inspections`) });
export const useItemIncidents = (id: string) => useQuery({ queryKey: [...keys.item(id), 'incidents'], queryFn: () => api<ItemIncident[]>(`equipment/items/${id}/incidents`) });
export const useDefects = (filter: { open?: string; itemId?: string }) => useQuery({ queryKey: [...keys.all, 'defects', filter], queryFn: () => api<Defect[]>(withQuery('equipment/defects', filter)) });
export const useCategories = () => useQuery({ queryKey: [...keys.all, 'categories'], queryFn: () => api<Category[]>('equipment/categories'), staleTime: LONG });
export const useTypes = () => useQuery({ queryKey: [...keys.all, 'types'], queryFn: () => api<EquipmentType[]>('equipment/types'), staleTime: LONG });
export const useDepartments = () => useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
export const useStations = () => useQuery({ queryKey: ['masterdata', 'stations'], queryFn: () => api<Station[]>('masterdata/stations'), staleTime: LONG });
export const useVehicles = () => useQuery({ queryKey: ['masterdata', 'vehicles'], queryFn: () => api<Vehicle[]>('masterdata/vehicles'), staleTime: LONG });
export const usePersons = () =>
  useQuery({ queryKey: ['masterdata', 'persons', 'summaries'], queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []), staleTime: LONG });

export function useCategoryName() {
  const { data = [] } = useCategories();
  const localized = useLocalized();
  return (key: string) => {
    const c = data.find((x) => x.key === key);
    return c ? localized(c.name) : key;
  };
}

/** "Florian Musterstadt 1/44 · G1" or the station. */
export function usePlace() {
  const { data: vehicles = [] } = useVehicles();
  const { data: stations = [] } = useStations();
  return (item: Pick<Item, 'vehicleId' | 'stationId' | 'loadingPlace'>) => {
    if (item.vehicleId) {
      const v = vehicles.find((x) => x.id === item.vehicleId);
      return [v ? v.radioCallSign || v.designation : '', item.loadingPlace].filter(Boolean).join(' · ');
    }
    const s = stations.find((x) => x.id === item.stationId);
    return [s?.name, item.loadingPlace].filter(Boolean).join(' · ');
  };
}
