import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverLicenseFile, DriverLicenseOverview, DriverLicenseSettings, DriverLicenseState, MyDriverLicense } from '@forga/masterdata-contracts';
import { api } from '@forga/web-sdk';
import type { Tone } from '@forga/web-ui';

export const CHECK = 'masterdata.licenses.check';
export const SETTINGS = 'masterdata.settings.manage';

export const licenseKeys = {
  all: ['masterdata', 'driver-licenses'] as const,
  file: (personId: string) => ['masterdata', 'driver-licenses', 'file', personId] as const,
  overview: ['masterdata', 'driver-licenses', 'overview'] as const,
  mine: ['masterdata', 'driver-licenses', 'mine'] as const,
  settings: ['core', 'settings', 'masterdata.driverLicense'] as const,
};

export function useLicenseFile(personId: string) {
  return useQuery({ queryKey: licenseKeys.file(personId), queryFn: () => api<DriverLicenseFile>(`masterdata/persons/${personId}/driver-license`) });
}

export function useLicenseOverview() {
  return useQuery({ queryKey: licenseKeys.overview, queryFn: () => api<DriverLicenseOverview>('masterdata/driver-licenses') });
}

export function useLicenseSettings() {
  return useQuery({ queryKey: licenseKeys.settings, queryFn: () => api<DriverLicenseSettings | null>('core/settings/masterdata.driverLicense') });
}

export function useMyLicense() {
  return useQuery({ queryKey: licenseKeys.mine, queryFn: () => api<MyDriverLicense>('masterdata/me/driver-license') });
}

/** After a change: the file of the person, the overview, the tasks and the person (classes, latest check). */
export function useLicenseChanged() {
  const queryClient = useQueryClient();
  return (file: DriverLicenseFile) => {
    queryClient.setQueryData(licenseKeys.file(file.person.id), file);
    void queryClient.invalidateQueries({ queryKey: licenseKeys.overview });
    void queryClient.invalidateQueries({ queryKey: ['masterdata', 'persons', file.person.id] });
    void queryClient.invalidateQueries({ queryKey: ['core', 'tasks'] });
  };
}

export const STATE_TONES: Record<DriverLicenseState, Tone> = {
  'classes-missing': 'error',
  overdue: 'error',
  requested: 'warning',
  'first-check-missing': 'warning',
  due: 'warning',
  checked: 'done',
};

/** Classes offered in the check dialog right away (as on the licence); others are added from the list. */
export const COMMON_CLASSES = ['B', 'BE', 'C1', 'C1E', 'C', 'CE', 'T'] as const;
