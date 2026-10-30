import { useQuery } from '@tanstack/react-query';
import type { PersonalLink } from '@forga/personal-contracts';
import { api } from '@forga/web-sdk';

export const READ = 'personal.read';
export const MANAGE = 'personal.manage';

const linkKey = (personId: string) => ['personal', 'link', personId] as const;

export function usePersonalLink(personId: string) {
  return useQuery({
    queryKey: linkKey(personId),
    queryFn: () => api<PersonalLink | null>(`personal/persons/${personId}/link`),
  });
}

export function usePersonalLinks() {
  return useQuery({
    queryKey: ['personal', 'links'],
    queryFn: () => api<PersonalLink[]>('personal/links'),
  });
}

export { linkKey };
