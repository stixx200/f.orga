import { Button, Chip, Group, MultiSelect, Stack, Text, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PersonSummary } from '@forga/masterdata-contracts';
import { can, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, matchesSearch, PageHeader, StatusBadge, type Tone } from '@forga/web-ui';
import { READ, useCatalog, useCatalogNames, useDepartments, usePersons, WRITE } from '../api';
import { HonorCertificatesDialog } from './HonorCertificatesDialog';

const STATUSES = ['active', 'probation', 'youth', 'veterans', 'passive', 'left'] as const;
type Status = (typeof STATUSES)[number];

export const STATUS_TONES: Record<PersonSummary['status'], Tone> = {
  active: 'done',
  probation: 'warning',
  passive: 'neutral',
  youth: 'highlight',
  veterans: 'neutral',
  left: 'neutral',
};

/**
 * Persons with search and filters by status, department, qualification and rank; each filter takes several values
 * (any of them matches). The departments start with the own ones.
 */
export function PersonsPage() {
  const { t, i18n } = useTranslation('masterdata');
  const navigate = useNavigate();
  const session = useSession().data;
  const [statuses, setStatuses] = useState<Status[]>(['active']);
  const [query, setQuery] = useState('');
  const [chosenDepartments, setDepartmentIds] = useState<string[] | null>(null);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [ranks, setRanks] = useState<string[]>([]);
  const [certificates, setCertificates] = useState(false);
  const { data: persons = [], isLoading } = usePersons(undefined, { includeLeft: true });

  // Until the user chooses: the own departments (of the own person, otherwise those the user may read persons in).
  const ownDepartments = useMemo(() => {
    const own = persons.find((p) => p.id === session?.user.personId)?.departmentIds;
    const grant = session?.permissions[READ];
    return own?.length ? own : Array.isArray(grant) ? grant : [];
  }, [persons, session]);
  const departmentIds = chosenDepartments ?? ownDepartments;
  const { data: departments = [] } = useDepartments();
  const { data: qualificationEntries = [] } = useCatalog('qualification');
  const { data: rankEntries = [] } = useCatalog('rank');
  const rankName = useCatalogNames('rank');
  const qualificationName = useCatalogNames('qualification');
  const department = (id: string | null) => departments.find((d) => d.id === id)?.shortName ?? '';
  const name = (entry: { name: { de: string; en: string } }) => (i18n.language === 'en' ? entry.name.en : entry.name.de);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return persons
      .filter((p) => !statuses.length || statuses.includes(p.status))
      .filter((p) => !departmentIds.length || p.departmentIds.some((d) => departmentIds.includes(d)))
      .filter((p) => matchesSearch([p.firstName, p.lastName, p.personnelNumber, p.email, p.phoneMobile], q))
      .filter((p) => !qualifications.length || p.qualifications.some((x) => qualifications.includes(x)))
      .filter((p) => !ranks.length || (p.rank !== null && ranks.includes(p.rank)));
  }, [persons, statuses, departmentIds, query, qualifications, ranks]);

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('persons.title') }]}
        title={t('persons.title')}
        actions={
          <Group>
            <Button component={Link} to="/lists" variant="default">{t('persons.lists')}</Button>
            {can(session, WRITE) && <Button variant="default" onClick={() => setCertificates(true)}>{t('certificates.open')}</Button>}
            {can(session, WRITE) && <Button component={Link} to="/masterdata/persons/new">{t('persons.create')}</Button>}
          </Group>
        }
      />
      <Chip.Group multiple value={statuses} onChange={(v) => setStatuses(v as Status[])}>
        <Group gap="xs">
          {STATUSES.map((v) => (
            <Chip key={v} value={v} radius="xs">{t(`persons.views.${v}`)}</Chip>
          ))}
          <Button variant="subtle" size="compact-sm" onClick={() => setStatuses(statuses.length === STATUSES.length ? ['active'] : [...STATUSES])}>
            {statuses.length === STATUSES.length ? t('persons.views.reset') : t('persons.views.all')}
          </Button>
        </Group>
      </Chip.Group>
      <Group grow align="end">
        <TextInput type="search" label={t('persons.search')} placeholder={t('persons.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <MultiSelect label={t('persons.department')} placeholder={departmentIds.length ? undefined : t('persons.allDepartments')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentIds} onChange={setDepartmentIds} clearable searchable />
        <MultiSelect label={t('persons.qualification')} placeholder={qualifications.length ? undefined : t('persons.all')} data={qualificationEntries.map((q) => ({ value: q.key, label: name(q) }))} value={qualifications} onChange={setQualifications} clearable searchable />
        <MultiSelect label={t('persons.rank')} placeholder={ranks.length ? undefined : t('persons.all')} data={rankEntries.map((r) => ({ value: r.key, label: name(r) }))} value={ranks} onChange={setRanks} clearable searchable />
      </Group>
      <DataTable<PersonSummary>
        rows={rows}
        rowKey={(p) => p.id}
        onRowClick={(p) => !p.restricted && navigate(`/masterdata/persons/${p.id}`)}
        empty={isLoading ? t('loading') : t('persons.empty')}
        columns={[
          {
            key: 'name',
            header: t('persons.name'),
            render: (p) => (
              <>
                <Text fw={700} size="sm" c={p.restricted ? undefined : 'brand'}>{p.lastName}, {p.firstName}</Text>
                {p.personnelNumber && <Text size="xs" c="dimmed">{t('persons.number', { number: p.personnelNumber })}</Text>}
                {p.restricted && <Text size="xs" c="dimmed">{t('persons.restricted')}</Text>}
              </>
            ),
          },
          { key: 'department', header: t('persons.department'), render: (p) => department(p.primaryDepartmentId) },
          { key: 'rank', header: t('persons.rank'), render: (p) => rankName(p.rank, i18n.language) },
          { key: 'mobile', header: t('person.phoneMobile'), render: (p) => p.phoneMobile },
          {
            key: 'qualifications',
            header: t('persons.qualifications'),
            render: (p) => (
              <Group gap={4}>
                {p.qualifications.filter((q) => ['breathing-apparatus', 'machinist', 'group-leader', 'platoon-leader'].includes(q)).map((q) => <StatusBadge key={q}>{qualificationName(q, i18n.language)}</StatusBadge>)}
              </Group>
            ),
          },
          { key: 'status', header: t('persons.status'), render: (p) => <StatusBadge tone={STATUS_TONES[p.status]}>{t(`status.${p.status}`)}</StatusBadge> },
        ]}
      />
      <Text size="xs" c="dimmed">{t('persons.count', { count: rows.length })}</Text>
      {certificates && <HonorCertificatesDialog onClose={() => setCertificates(false)} />}
    </Stack>
  );
}
