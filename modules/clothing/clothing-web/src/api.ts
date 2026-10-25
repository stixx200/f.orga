import { useQuery } from '@tanstack/react-query';
import type { Article, Item, ItemDetail, PersonClothing } from '@forga/clothing-contracts';
import type { Department, PersonSummary } from '@forga/masterdata-contracts';
import { api, useLocalized, withQuery } from '@forga/web-sdk';

export const READ = 'clothing.read';
export const ISSUE = 'clothing.issue';
export const MANAGE = 'clothing.manage';
export const SELF = 'clothing.self';

export const keys = {
  all: ['clothing'] as const,
  item: (id: string) => ['clothing', 'items', id] as const,
  person: (id: string) => ['clothing', 'persons', id] as const,
};

const LONG = 5 * 60_000;

export type ItemFilter = { status?: string; articleKey?: string; holderId?: string; q?: string };

export const useArticles = () => useQuery({ queryKey: [...keys.all, 'articles'], queryFn: () => api<Article[]>('clothing/articles'), staleTime: LONG });
export const useItems = (filter: ItemFilter, enabled = true) => useQuery({ queryKey: [...keys.all, 'items', filter], queryFn: () => api<Item[]>(withQuery('clothing/items', filter)), enabled });
export const useItem = (id: string) => useQuery({ queryKey: keys.item(id), queryFn: () => api<ItemDetail>(`clothing/items/${id}`) });
export const usePersonClothing = (personId: string | null, self = false) =>
  useQuery({ queryKey: self ? [...keys.all, 'me'] : keys.person(personId ?? ''), queryFn: () => api<PersonClothing>(self ? 'clothing/me' : `clothing/persons/${personId}`), enabled: self || Boolean(personId) });
export const useDepartments = () => useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
export const usePersons = () =>
  useQuery({ queryKey: ['masterdata', 'persons', 'summaries'], queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []), staleTime: LONG });

/** Article name by key. */
export function useArticleName() {
  const { data = [] } = useArticles();
  const localized = useLocalized();
  return (key: string) => {
    const article = data.find((a) => a.key === key);
    return article ? localized(article.name) : key;
  };
}

/** "Lastname, Firstname" by person ID. */
export function usePersonName() {
  const { data = [] } = usePersons();
  return (id: string | null) => {
    const p = data.find((x) => x.id === id);
    return p ? `${p.lastName}, ${p.firstName}` : '';
  };
}
