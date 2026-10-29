import { useQuery } from '@tanstack/react-query';
import type { ActivityOption, PersonPrivacy, SessionPrivacyNotice, PrivacyBreach, PrivacyAssignee, PrivacyContacts, PrivacyNotice, PrivacyRequest, PrivacyTexts, ProcessingRegister, RecipientOption, RestrictedPerson, UninformedPerson } from '@forga/privacy-contracts';
import { api, withQuery } from '@forga/web-sdk';

export const PRIVACY = 'privacy.manage';

export const privacyKeys = {
  all: ['privacy'] as const,
  requests: (state: string) => ['privacy', 'requests', state] as const,
  request: (id: string) => ['privacy', 'request', id] as const,
  person: (id: string) => ['privacy', 'person', id] as const,
  texts: ['privacy', 'texts'] as const,
  notice: (version?: number) => ['privacy', 'notice', version ?? 'current'] as const,
  restricted: ['privacy', 'restricted'] as const,
  uninformed: ['privacy', 'uninformed'] as const,
  settings: (section: string) => ['core', 'settings', section] as const,
  register: ['privacy', 'register'] as const,
  breaches: (state: string) => ['privacy', 'breaches', state] as const,
  breach: (id: string) => ['privacy', 'breach', id] as const,
};

/** Whether the signed-in user still has to acknowledge the privacy notice (first sign-in, new version). */
export const NOTICE_STATE_KEY = ['privacy', 'notice-state'] as const;

export function useNoticeState() {
  return useQuery({ queryKey: NOTICE_STATE_KEY, queryFn: () => api<SessionPrivacyNotice>('privacy/notice/state'), staleTime: Infinity });
}

export function useRequests(state: 'open' | 'closed' | 'all', enabled = true) {
  return useQuery({ queryKey: privacyKeys.requests(state), queryFn: () => api<PrivacyRequest[]>(withQuery('privacy/requests', { state })), enabled });
}

export function useRequest(id: string) {
  return useQuery({ queryKey: privacyKeys.request(id), queryFn: () => api<PrivacyRequest>(`privacy/requests/${id}`) });
}

export function usePersonPrivacy(personId: string) {
  return useQuery({ queryKey: privacyKeys.person(personId), queryFn: () => api<PersonPrivacy>(`privacy/persons/${personId}`) });
}

export function useAssignees() {
  return useQuery({ queryKey: [...privacyKeys.all, 'assignees'], queryFn: () => api<PrivacyAssignee[]>('privacy/assignees'), staleTime: 60_000 });
}

export function useTexts() {
  return useQuery({ queryKey: privacyKeys.texts, queryFn: () => api<PrivacyTexts>('privacy/texts') });
}

export function useNotice(version?: number) {
  return useQuery({ queryKey: privacyKeys.notice(version), queryFn: () => api<PrivacyNotice>(withQuery('privacy/notice', { version })) });
}

export function useContacts() {
  return useQuery({ queryKey: privacyKeys.settings('privacy.contacts'), queryFn: () => api<PrivacyContacts>('core/settings/privacy.contacts') });
}

/** The register of processing activities (L8). */
export function useRegister() {
  return useQuery({ queryKey: privacyKeys.register, queryFn: () => api<ProcessingRegister>('privacy/register') });
}

/** Activities of the register to refer to (objection, data breach). */
export function useActivityOptions() {
  return useQuery({ queryKey: [...privacyKeys.register, 'activities'], queryFn: () => api<ActivityOption[]>('privacy/register/activities'), staleTime: 60_000 });
}

/** Recipients of the register to inform under Art. 19. */
export function useRecipientOptions() {
  return useQuery({ queryKey: [...privacyKeys.register, 'recipients'], queryFn: () => api<RecipientOption[]>('privacy/register/recipients') });
}

export function useBreaches(state: 'open' | 'closed' | 'all') {
  return useQuery({ queryKey: privacyKeys.breaches(state), queryFn: () => api<PrivacyBreach[]>(withQuery('privacy/breaches', { state })) });
}

export function useBreach(id: string) {
  return useQuery({ queryKey: privacyKeys.breach(id), queryFn: () => api<PrivacyBreach>(`privacy/breaches/${id}`) });
}

/** Restricted persons of the master data module; empty while the module is not active. */
export function useRestricted() {
  return useQuery({ queryKey: privacyKeys.restricted, queryFn: () => api<RestrictedPerson[]>('privacy/restricted').catch((): RestrictedPerson[] => []) });
}

/** Persons without recorded information (Art. 13/14); empty while the master data module is not active. */
export function useUninformed() {
  return useQuery({ queryKey: privacyKeys.uninformed, queryFn: () => api<UninformedPerson[]>('privacy/uninformed').catch((): UninformedPerson[] => []) });
}

/** The day in Europe/Berlin, `YYYY-MM-DD`. */
export const berlinToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

/** Whole hours from now until the instant (negative when it has passed). */
export const hoursUntil = (instant: string) => Math.floor((Date.parse(instant) - Date.now()) / 3_600_000);

/** Days from today until the date (negative when it has passed). */
export const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${berlinToday()}T00:00:00Z`)) / 86_400_000);
