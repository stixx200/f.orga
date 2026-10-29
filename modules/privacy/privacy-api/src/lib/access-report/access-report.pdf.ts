import type { BrigadeSettings, Language } from '@forga/core-contracts';
import { columnWidths, formatReportDay, PDF_TABLE_LAYOUT, pdfHeaderCell, type PersonDataBlock, type PersonDataSection, type PostalAddress, renderLetterPdf } from '@forga/core-api';
import type { AccessReportLetterTexts } from './access-report.texts.js';

const SERVICE_RED = '#8C1D18';
const META = '#595959';

/** What a section heading says about the processing: purpose, period, recipients, origin. */
export interface SectionInfo {
  purpose: string | null;
  retention: string | null;
  recipients: string[];
  origins: string[];
}

export interface AccessReportDocument {
  language: Language;
  now: Date;
  brigade: BrigadeSettings | null;
  letterhead: string | null;
  logo: string | null;
  personName: string;
  address: PostalAddress | null;
  letter: AccessReportLetterTexts;
  /** Art. 15 para. 1 a–d, g across all sections. */
  purposes: string[];
  categories: string[];
  recipients: string[];
  origins: string[];
  sections: { section: PersonDataSection; info: SectionInfo }[];
  /** Day the data subject request came in, if the report answers one. */
  requestDate: string | null;
  /** Machine-readable version, embedded as file attachment. */
  json: Buffer | null;
}

const L = {
  title: { de: 'Auskunft nach Art. 15 DSGVO', en: 'Access report under Art. 15 GDPR' },
  asOf: { de: 'Stand', en: 'as of' },
  subject: { de: 'Auskunft über Ihre personenbezogenen Daten (Art. 15 DSGVO)', en: 'Access to your personal data (Art. 15 GDPR)' },
  request: { de: 'Ihre Anfrage vom', en: 'Your request of' },
  information: { de: 'Angaben nach Art. 15 Abs. 1 DSGVO', en: 'Information under Art. 15(1) GDPR' },
  controller: { de: 'Verantwortlicher', en: 'Controller' },
  dpo: { de: 'Datenschutzbeauftragter', en: 'Data protection officer' },
  purposes: { de: 'Zwecke (a)', en: 'Purposes (a)' },
  categories: { de: 'Kategorien (b)', en: 'Categories (b)' },
  recipients: { de: 'Empfänger (c)', en: 'Recipients (c)' },
  retention: { de: 'Speicherdauer (d)', en: 'Storage period (d)' },
  retentionText: { de: 'je Bereich nach dem Aufbewahrungsplan; Angaben auf den folgenden Seiten', en: 'per area according to the retention plan; see the following pages' },
  rights: { de: 'Ihre Rechte (e)', en: 'Your rights (e)' },
  complaint: { de: 'Beschwerderecht (f)', en: 'Right to lodge a complaint (f)' },
  origin: { de: 'Herkunft (g)', en: 'Source (g)' },
  automated: { de: 'Automatisierte Entscheidung (h)', en: 'Automated decision-making (h)' },
  thirdCountry: { de: 'Drittländer (Abs. 2)', en: 'Third countries (para. 2)' },
  none: { de: 'keine', en: 'none' },
  perArea: { de: 'Je Bereich auf den folgenden Seiten.', en: 'Per area on the following pages.' },
  health: { de: 'Gesundheitsdaten', en: 'Health data' },
  healthNote: { de: 'Dieser Bereich enthält Gesundheitsdaten (Art. 9 DSGVO).', en: 'This area contains health data (Art. 9 GDPR).' },
  purpose: { de: 'Zweck', en: 'Purpose' },
  period: { de: 'Speicherdauer', en: 'Storage period' },
  recipient: { de: 'Empfänger', en: 'Recipients' },
  source: { de: 'Herkunft', en: 'Source' },
  thirdParties: { de: 'Andere Personen sind nicht genannt (Art. 15 Abs. 4 DSGVO).', en: 'Other persons are not named (Art. 15(4) GDPR).' },
  attachment: { de: 'Anhang: maschinenlesbare Fassung (JSON) als Datei in diesem PDF beigefügt.', en: 'Attachment: machine-readable version (JSON) embedded as file in this PDF.' },
  noAttachment: { de: 'Anhang: maschinenlesbare Fassung nicht beigefügt.', en: 'Attachment: machine-readable version not included.' },
  noData: { de: 'Zu Ihrer Person sind keine Daten gespeichert.', en: 'No data is stored about you.' },
  template: {
    de: 'Vorlage: Die Textbausteine dieses Schreibens sind noch nicht vom Datenschutzbeauftragten geprüft.',
    en: 'Template: the text blocks of this letter have not yet been checked by the data protection officer.',
  },
} as const;

function salutation(address: PostalAddress | null, name: string, language: Language): string {
  if (language === 'en') return `Dear ${name},`;
  const lastName = address?.lastName || name;
  const title = address?.title ? `${address.title} ` : '';
  if (/^herr/i.test(address?.salutation ?? '')) return `Sehr geehrter Herr ${title}${lastName},`;
  if (/^frau/i.test(address?.salutation ?? '')) return `Sehr geehrte Frau ${title}${lastName},`;
  return `Guten Tag ${name},`;
}

function blockContent(block: PersonDataBlock, width: number): unknown[] {
  const title = block.title ? [{ text: block.title, bold: true, margin: [0, 8, 0, 3] }] : [];
  if (block.kind === 'text') return [...title, { text: block.text, margin: [0, 0, 0, 4] }];
  if (block.kind === 'fields') {
    return [
      ...title,
      {
        table: { widths: ['36%', '*'], body: block.rows.map((r) => [{ text: r.label, color: META }, { text: r.value }]) },
        layout: 'noBorders',
        margin: [0, 0, 0, 4],
      },
    ];
  }
  const columns = block.columns.map((label, i) => ({ key: String(i), label: { de: label, en: label } }));
  return [
    ...title,
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: columnWidths(columns, block.rows, width),
        body: [block.columns.map((c) => pdfHeaderCell(c)), ...block.rows.map((row) => block.columns.map((_, i) => ({ text: row[i] ?? '' })))],
      },
      layout: PDF_TABLE_LAYOUT,
      fontSize: 8.5,
      margin: [0, 0, 0, 4],
    },
    ...(block.summary ?? []).map((line) => ({ text: line, style: 'small', margin: [0, 0, 0, 2] })),
  ];
}

/** The access report as PDF: cover letter with the information under Art. 15 para. 1, then one part per area. */
export async function renderAccessReport(doc: AccessReportDocument): Promise<Buffer> {
  const { language } = doc;
  const l = (key: keyof typeof L) => L[key][language];
  const today = formatReportDay(doc.now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }), language);
  const a = doc.address;
  const addressLines = a
    ? [a.salutation, [a.title, a.firstName, a.lastName].filter(Boolean).join(' '), a.street, [a.postalCode, a.city].filter(Boolean).join(' ')].filter(Boolean)
    : [doc.personName];
  const join = (values: string[]) => (values.length ? values.join('; ') : l('none'));
  const information: [string, string][] = [
    [l('controller'), doc.letter.controller],
    [l('dpo'), doc.letter.dataProtectionOfficer],
    [l('purposes'), doc.purposes.length ? `${doc.purposes.join('; ')}. ${l('perArea')}` : l('none')],
    [l('categories'), join(doc.categories)],
    [l('recipients'), join(doc.recipients)],
    [l('retention'), l('retentionText')],
    [l('rights'), doc.letter.rights],
    [l('complaint'), doc.letter.authority],
    [l('origin'), join(doc.origins)],
    [l('automated'), doc.letter.automatedDecision],
    [l('thirdCountry'), doc.letter.thirdCountry],
  ];
  const width = 483;

  const cover: unknown[] = [
    { stack: addressLines.map((line) => ({ text: line })), margin: [0, 6, 0, 18] },
    { text: [doc.brigade?.city, today].filter(Boolean).join(', '), alignment: 'right', margin: [0, 0, 0, 14] },
    { text: l('subject'), bold: true },
    ...(doc.requestDate ? [{ text: `${l('request')} ${formatReportDay(doc.requestDate, language)}`, margin: [0, 2, 0, 0] }] : []),
    { text: salutation(a, doc.personName, language), margin: [0, 14, 0, 8] },
    { text: doc.letter.introduction, margin: [0, 0, 0, 6] },
    ...(doc.letter.template ? [{ text: l('template'), style: 'small', color: SERVICE_RED, margin: [0, 0, 0, 6] }] : []),
    { text: l('information'), style: 'heading' },
    {
      table: { widths: ['30%', '*'], body: information.map(([label, value]) => [{ text: label, color: META }, { text: value }]) },
      layout: 'noBorders',
    },
    { text: doc.letter.closing, margin: [0, 14, 0, 2] },
    { text: doc.brigade?.name ?? '' },
  ];

  const parts = doc.sections.flatMap(({ section, info }, index) => {
    const meta = [
      info.purpose && `${l('purpose')}: ${info.purpose}`,
      info.retention && `${l('period')}: ${info.retention}`,
      `${l('recipient')}: ${info.recipients.length ? info.recipients.join(', ') : l('none')}`,
      info.origins.length && `${l('source')}: ${info.origins.join(', ')}`,
    ].filter(Boolean);
    return [
      {
        text: [
          { text: `${index + 1} ${section.title}` },
          ...(section.health ? [{ text: `  ·  ${l('health')}`, fontSize: 9, color: SERVICE_RED }] : []),
        ],
        style: 'title',
        ...(index === 0 ? { pageBreak: 'before' } : {}),
      },
      { text: meta.join(' · '), style: 'small', margin: [0, 0, 0, 6] },
      ...(section.health ? [{ text: l('healthNote'), bold: true, color: SERVICE_RED, fontSize: 9, margin: [0, 0, 0, 6] }] : []),
      ...section.blocks.flatMap((block) => blockContent(block, width)),
    ];
  });

  const content = [
    ...cover,
    ...(doc.sections.length ? parts : [{ text: l('noData'), pageBreak: 'before' }]),
    { text: l('thirdParties'), style: 'small', margin: [0, 16, 0, 2] },
    { text: doc.json ? l('attachment') : l('noAttachment'), style: 'small' },
  ];

  return renderLetterPdf({
    brigade: doc.brigade,
    letterhead: doc.letterhead,
    logo: doc.logo,
    title: `${l('title')} · ${doc.personName} · ${l('asOf')} ${today}`,
    compactTitle: true,
    content,
    language,
    now: doc.now,
    files: doc.json
      ? { [FILE_NAME[language]]: { src: `data:application/json;base64,${doc.json.toString('base64')}`, name: FILE_NAME[language], description: L.attachment[language] } }
      : undefined,
  });
}

const FILE_NAME = { de: 'auskunft.json', en: 'access-report.json' } as const;
