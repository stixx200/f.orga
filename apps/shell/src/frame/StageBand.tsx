import { useStage, useTranslation } from '@forga/web-sdk';

/**
 * Band "Testsystem – nur Demodaten" across every page of the test system (`FORGA_STAGE=test`), also on the sign-in
 * page and the info terminal, so nobody mistakes it for the real system and enters real data.
 */
export function StageBand() {
  const { t } = useTranslation('shell');
  if (useStage() !== 'test') return null;
  return (
    <div
      role="note"
      style={{
        background: 'var(--forga-notice)',
        color: 'var(--forga-notice-text)',
        borderBottom: '1px solid var(--forga-grid)',
        padding: '4px 16px',
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {t('stageBand')}
      <span style={{ fontWeight: 400 }}> · {t('stageBandHint')}</span>
    </div>
  );
}
