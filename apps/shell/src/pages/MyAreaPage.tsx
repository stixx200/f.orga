import { Stack } from '@mantine/core';
import type { ComponentType } from 'react';
import type { Session } from '@forga/core-contracts';
import { can, extensionsOf, useLocalized, useTranslation } from '@forga/web-sdk';
import { EmptyState, PageHeader } from '@forga/web-ui';
import { ImpersonationsPanel } from '../privacy/Impersonations';

/** Contributions to "My area" the user may see (extension point `point`). */
function allowed(session: Session, point: string) {
  return extensionsOf(point).filter((e) => !e.permission || can(session, e.permission));
}

/** Sections of "My area" the user may see (extension point `core.me.sections`). */
export function mySections(session: Session) {
  return allowed(session, 'core.me.sections');
}

/**
 * "My area": what the modules show the member about the linked person; one section per module. Modules add panels
 * above the sections (`core.me.top`, e.g. the access reports) and actions below each section (`core.me.section-actions`,
 * props `{ area }`: the module of the section, e.g. „Berichtigung beantragen“).
 */
export function MyAreaPage({ session }: { session: Session }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const sections = mySections(session);
  const top = allowed(session, 'core.me.top');
  const actions = allowed(session, 'core.me.section-actions');
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.overview') }, { label: t('me.title') }]} title={t('me.title')} subtitle={session.user.displayName} />
      {!session.user.personId ? (
        <EmptyState title={t('me.noPerson')} text={t('me.noPersonText')} />
      ) : (
        <>
          {top.map((item) => {
            const Top = item.component;
            return <Top key={item.module} personId={session.user.personId} />;
          })}
          {sections.map((section) => {
            const Section = section.component;
            return (
              <section key={section.module} aria-label={localized(section.label)}>
                <Section personId={session.user.personId} />
                {actions.map((action) => {
                  const Action = action.component as ComponentType<{ area: string }>;
                  return <Action key={action.module} area={section.module} />;
                })}
              </section>
            );
          })}
          <section aria-label={t('transparency.impersonations.title')}>
            <ImpersonationsPanel />
          </section>
        </>
      )}
    </Stack>
  );
}
