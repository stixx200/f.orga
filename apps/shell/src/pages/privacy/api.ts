import { useQuery } from '@tanstack/react-query';
import type {
  ActivityOption,
  PersonPrivacy,
  PrivacyBreach,
  PrivacyAssignee,
  PrivacyContacts,
  PrivacyNotice,
  PrivacyRequest,
  PrivacyTexts,
  ProcessingRegister,
  RecipientOption,
  RestrictedPerson,
  UninformedPerson,
} from '@forga/core-contracts';
import { api, withQuery } from '@forga/web-sdk';

export const PRIVACY = 'core.privacy.manage';

export const privacyKeys = {
  all: ['core', 'privacy'] as const,
  requests: (state: string) => ['core', 'privacy', 'requests', state] as const,
  request: (id: string) => ['core', 'privacy', 'request', id] as const,
  person: (id: string) => ['core', 'privacy', 'person', id] as const,
  texts: ['core', 'privacy', 'texts'] as const,
  notice: (version?: number) => ['core', 'privacy', 'notice', version ?? 'current'] as const,
  restricted: ['masterdata', 'privacy', 'restricted'] as const,
  uninformed: ['masterdata', 'privacy', 'uninformed'] as const,
  settings: (section: string) => ['core', 'settings', section] as const,
  register: ['core', 'privacy', 'register'] as const,
  breaches: (state: string) => ['core', 'privacy', 'breaches', state] as const,
  breach: (id: string) => ['core', 'privacy', 'breach', id] as const,
};

export function useRequests(state: 'open' | 'closed' | 'all', enabled = true) {
  return useQuery({ queryKey: privacyKeys.requests(state), queryFn: () => api<PrivacyRequest[]>(withQuery('core/privacy/requests', { state })), enabled });
}

export function useRequest(id: string) {
  return useQuery({ queryKey: privacyKeys.request(id), queryFn: () => api<PrivacyRequest>(`core/privacy/requests/${id}`) });
}

export function usePersonPrivacy(personId: string) {
  return useQuery({ queryKey: privacyKeys.person(personId), queryFn: () => api<PersonPrivacy>(`core/privacy/persons/${personId}`) });
}

export function useAssignees() {
  return useQuery({ queryKey: [...privacyKeys.all, 'assignees'], queryFn: () => api<PrivacyAssignee[]>('core/privacy/assignees'), staleTime: 60_000 });
}

export function useTexts() {
  return useQuery({ queryKey: privacyKeys.texts, queryFn: () => api<PrivacyTexts>('core/privacy/texts') });
}

export function useNotice(version?: number) {
  return useQuery({ queryKey: privacyKeys.notice(version), queryFn: () => api<PrivacyNotice>(withQuery('core/privacy/notice', { version })) });
}

export function useContacts() {
  return useQuery({ queryKey: privacyKeys.settings('privacy.contacts'), queryFn: () => api<PrivacyContacts>('core/settings/privacy.contacts') });
}

/** The register of processing activities (L8). */
export function useRegister() {
  return useQuery({ queryKey: privacyKeys.register, queryFn: () => api<ProcessingRegister>('core/privacy/register') });
}

/** Activities of the register to refer to (objection, data breach). */
export function useActivityOptions() {
  return useQuery({ queryKey: [...privacyKeys.register, 'activities'], queryFn: () => api<ActivityOption[]>('core/privacy/register/activities'), staleTime: 60_000 });
}

/** Recipients of the register to inform under Art. 19. */
export function useRecipientOptions() {
  return useQuery({ queryKey: [...privacyKeys.register, 'recipients'], queryFn: () => api<RecipientOption[]>('core/privacy/register/recipients') });
}

export function useBreaches(state: 'open' | 'closed' | 'all') {
  return useQuery({ queryKey: privacyKeys.breaches(state), queryFn: () => api<PrivacyBreach[]>(withQuery('core/privacy/breaches', { state })) });
}

export function useBreach(id: string) {
  return useQuery({ queryKey: privacyKeys.breach(id), queryFn: () => api<PrivacyBreach>(`core/privacy/breaches/${id}`) });
}

/** Restricted persons of the master data module; empty while the module is not active. */
export function useRestricted() {
  return useQuery({ queryKey: privacyKeys.restricted, queryFn: () => api<RestrictedPerson[]>('masterdata/privacy/restricted').catch((): RestrictedPerson[] => []) });
}

/** Persons without recorded information (Art. 13/14); empty while the master data module is not active. */
export function useUninformed() {
  return useQuery({ queryKey: privacyKeys.uninformed, queryFn: () => api<UninformedPerson[]>('masterdata/privacy/uninformed').catch((): UninformedPerson[] => []) });
}

/** The day in Europe/Berlin, `YYYY-MM-DD`. */
export const berlinToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

/** Whole hours from now until the instant (negative when it has passed). */
export const hoursUntil = (instant: string) => Math.floor((Date.parse(instant) - Date.now()) / 3_600_000);

/** Days from today until the date (negative when it has passed). */
export const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${berlinToday()}T00:00:00Z`)) / 86_400_000);
