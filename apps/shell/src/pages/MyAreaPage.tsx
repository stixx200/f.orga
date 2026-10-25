import { Stack } from '@mantine/core';
import type { Session } from '@forga/core-contracts';
import { can, extensionsOf, useLocalized, useTranslation } from '@forga/web-sdk';
import { EmptyState, PageHeader } from '@forga/web-ui';

/** Sections of "My area" the user may see (extension point `core.me.sections`). */
export function mySections(session: Session) {
  return extensionsOf('core.me.sections').filter((e) => !e.permission || can(session, e.permission));
}

/** "My area": what the modules show the member about the linked person; one section per module. */
export function MyAreaPage({ session }: { session: Session }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const sections = mySections(session);
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.overview') }, { label: t('me.title') }]} title={t('me.title')} subtitle={session.user.displayName} />
      {!session.user.personId ? (
        <EmptyState title={t('me.noPerson')} text={t('me.noPersonText')} />
      ) : sections.length === 0 ? (
        <EmptyState title={t('me.empty')} />
      ) : (
        sections.map((section) => {
          const Section = section.component;
          return (
            <section key={section.module} aria-label={localized(section.label)}>
              <Section personId={session.user.personId} />
            </section>
          );
        })
      )}
    </Stack>
  );
}
