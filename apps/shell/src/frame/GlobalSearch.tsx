import { Combobox, TextInput, useCombobox } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { SearchHit } from '@forga/core-contracts';
import { api, useLocalized, useTranslation, withQuery } from '@forga/web-sdk';

/** Searches all modules at once (`GET /api/core/search`); each module contributes its own hits on the server. */
export function GlobalSearch() {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query.trim(), 250);
  const combobox = useCombobox();
  const { data: hits = [] } = useQuery({
    queryKey: ['search', debounced],
    enabled: debounced.length >= 2,
    queryFn: () => api<SearchHit[]>(withQuery('core/search', { q: debounced })),
  });
  const groups = [...new Set(hits.map((h) => localized(h.group)))];

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(to) => {
        combobox.closeDropdown();
        setQuery('');
        navigate(to);
      }}
    >
      <Combobox.Target>
        <TextInput
          w="100%"
          maw={460}
          leftSection={<IconSearch size={18} stroke={1.75} />}
          placeholder={t('header.search')}
          aria-label={t('header.search')}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={debounced.length < 2 || hits.length === 0}>
        <Combobox.Options>
          {groups.map((group) => (
            <Combobox.Group key={group} label={group}>
              {hits
                .filter((h) => localized(h.group) === group)
                .map((h) => (
                  <Combobox.Option key={`${group}-${h.id}`} value={h.to}>
                    <strong>{h.title}</strong>
                    {h.description && <div style={{ fontSize: 12, color: 'var(--forga-meta)' }}>{h.description}</div>}
                  </Combobox.Option>
                ))}
            </Combobox.Group>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
