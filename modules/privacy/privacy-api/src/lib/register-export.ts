import ExcelJS from 'exceljs';
import type { BrigadeSettings, Language, LocalizedText } from '@forga/core-contracts';
import { type ProcessingRegister, type RegisterActivity, THIRD_PARTY_HINT } from '@forga/privacy-contracts';
import { addStyledSheet, PDF_TABLE_LAYOUT, pdfHeaderCell, renderLetterPdf } from '@forga/core-api';
import { formatDay, lines } from './privacy-text.js';

interface ExportContext {
  register: ProcessingRegister;
  language: Language;
  brigade: BrigadeSettings | null;
  now: Date;
  /** Only the activities with health data, as the basis of a data protection impact assessment (L26). */
  dpia?: boolean;
}

const T = {
  title: { de: 'Verzeichnis von Verarbeitungstätigkeiten', en: 'Record of processing activities' },
  subtitle: { de: 'nach Art. 30 Abs. 1 DSGVO', en: 'under Art. 30(1) GDPR' },
  draft: {
    de: 'Entwurf aus f.orga: Zwecke, Kategorien, Fristen und technische Empfänger kommen aus der Anwendung, Rechtsgrundlage und weitere Empfänger ergänzt die Gemeinde. Das Verzeichnis führt der Verantwortliche; der Entwurf ersetzt keine Prüfung.',
    en: 'Draft from f.orga: purposes, categories, periods and technical recipients come from the application, the municipality adds the legal basis and further recipients. The controller keeps the record; the draft does not replace a review.',
  },
  controller: { de: 'Verantwortlicher', en: 'Controller' },
  representedBy: { de: 'vertreten durch', en: 'represented by' },
  dpo: { de: 'Datenschutzbeauftragter', en: 'Data protection officer' },
  missing: { de: '[in den Einstellungen Datenschutz eintragen]', en: '[enter in the data protection settings]' },
  overview: { de: 'Übersicht', en: 'Overview' },
  activity: { de: 'Tätigkeit', en: 'Activity' },
  module: { de: 'Modul', en: 'Module' },
  purpose: { de: 'Zweck', en: 'Purpose' },
  subjects: { de: 'Betroffene', en: 'Data subjects' },
  categories: { de: 'Daten', en: 'Data' },
  special: { de: 'Besondere Kategorien (Art. 9)', en: 'Special categories (Art. 9)' },
  thirdParties: { de: 'Daten Dritter', en: 'Data of third parties' },
  recipients: { de: 'Empfänger', en: 'Recipients' },
  thirdCountry: { de: 'Drittland', en: 'Third country' },
  none: { de: 'keine', en: 'none' },
  retention: { de: 'Löschfrist', en: 'Erasure period' },
  legalBasis: { de: 'Rechtsgrundlage', en: 'Legal basis' },
  legalBasisOpen: { de: 'mit dem DSB festlegen', en: 'to be decided with the DPO' },
  hint: { de: 'Hinweis', en: 'Hint' },
  remarks: { de: 'Bemerkungen', en: 'Remarks' },
  reviewed: { de: 'Geprüft', en: 'Reviewed' },
  draftBadge: { de: 'Entwurf', en: 'Draft' },
  dpiaHint: {
    de: 'Prüfen, ob eine Datenschutz-Folgenabschätzung nötig ist (Art. 35 DSGVO): Gesundheitsdaten (Art. 9).',
    en: 'Check whether a data protection impact assessment is needed (Art. 35 GDPR): health data (Art. 9).',
  },
  dpiaTitle: { de: 'Angaben für eine Datenschutz-Folgenabschätzung', en: 'Information for a data protection impact assessment' },
  dpiaSubtitle: { de: 'nach Art. 35 DSGVO', en: 'under Art. 35 GDPR' },
  dpiaIntro: {
    de: 'Auszug aus dem Verzeichnis von Verarbeitungstätigkeiten: die Tätigkeiten mit Gesundheitsdaten mit Zweck, Daten, Empfängern, Fristen und den technischen und organisatorischen Maßnahmen. Ob eine Folgenabschätzung nötig ist und wie sie ausfällt, entscheidet der Verantwortliche mit dem Datenschutzbeauftragten; f.orga liefert nur die Angaben.',
    en: 'Extract of the record of processing activities: the activities with health data with purpose, data, recipients, periods and the technical and organisational measures. Whether an impact assessment is needed and its result is decided by the controller with the data protection officer; f.orga only provides the information.',
  },
  general: { de: 'Empfänger für alle Tätigkeiten', en: 'Recipients for all activities' },
  processors: { de: 'Technische Empfänger und Auftragsverarbeiter', en: 'Technical recipients and processors' },
  measures: { de: 'Technische und organisatorische Maßnahmen (Art. 32)', en: 'Technical and organisational measures (Art. 32)' },
  measure: { de: 'Maßnahme', en: 'Measure' },
  state: { de: 'Stand', en: 'State' },
  sheetRegister: { de: 'Verzeichnis', en: 'Register' },
  sheetMeasures: { de: 'Technische Maßnahmen', en: 'Technical measures' },
  sheetRecipients: { de: 'Empfänger', en: 'Recipients' },
  source: { de: 'Herkunft', en: 'Source' },
  sources: {
    module: { de: 'Modul', en: 'Module' },
    municipality: { de: 'Gemeinde', en: 'Municipality' },
    general: { de: 'alle Tätigkeiten', en: 'all activities' },
    token: { de: 'API-Token', en: 'API token' },
    processor: { de: 'Konfiguration', en: 'Configuration' },
  },
} satisfies Record<string, LocalizedText | Record<string, LocalizedText>>;

const join = (texts: LocalizedText[], language: Language, separator = '; ') => texts.map((t) => t[language]).join(separator);

/** The fields of an activity as label/value pairs, in the order of Art. 30(1). */
function rows(activity: RegisterActivity, language: Language): [string, string][] {
  const t = (text: LocalizedText) => text[language];
  const record = activity.record;
  return [
    [t(T.purpose), t(activity.purpose)],
    [t(T.subjects), join(activity.subjects, language) || '–'],
    [t(T.categories), join(activity.categories, language) || '–'],
    [t(T.special), activity.health ? (activity.healthNote?.[language] ?? t(T.special)) : '–'],
    [t(T.thirdParties), activity.thirdParties ? t(THIRD_PARTY_HINT) : '–'],
    [t(T.recipients), activity.recipients.map((r) => (r.note ? `${r.name[language]} (${r.note})` : r.name[language])).join('; ') || '–'],
    [t(T.thirdCountry), record.thirdCountry || t(T.none)],
    [t(T.retention), t(activity.retention)],
    [t(T.legalBasis), record.legalBasis || `${t(T.legalBasisOpen)}${activity.legalBasisHint ? ` (${t(T.hint)}: ${t(activity.legalBasisHint)})` : ''}`],
    ...(activity.health ? [[t(T.hint), t(T.dpiaHint)] as [string, string]] : []),
  ];
}

/** Column headers of the fields of `rows`. */
const FIELDS = [T.purpose, T.subjects, T.categories, T.special, T.thirdParties, T.recipients, T.thirdCountry, T.retention, T.legalBasis];

function reviewed(activity: RegisterActivity, language: Language): string {
  const { reviewedAt, reviewedBy } = activity.record;
  return reviewedAt ? `${formatDay(reviewedAt, language)}${reviewedBy ? ` · ${reviewedBy}` : ''}` : T.draftBadge[language];
}

function controllerLines(register: ProcessingRegister, language: Language): string {
  const c = register.controller;
  const name = c.name || T.missing[language];
  return lines(name, c.address, c.representedBy && `${T.representedBy[language]} ${c.representedBy}`);
}

function dpoLines(register: ProcessingRegister, language: Language): string {
  const d = register.dpo;
  return lines(d.name || T.missing[language], d.address, d.email, d.phone);
}

/** A table with a header row in the brigade style. */
const table = (head: string[], body: string[][], widths: (number | string)[]) => ({
  table: { headerRows: 1, dontBreakRows: true, widths, body: [head.map((h) => pdfHeaderCell(h)), ...body.map((r) => r.map((text) => ({ text })))] },
  layout: PDF_TABLE_LAYOUT,
  fontSize: 8.5,
  margin: [0, 0, 0, 10],
});

/** The register as PDF in the brigade style: controller and DPO, overview, one section per activity, technical measures. */
export async function renderRegisterPdf(context: ExportContext & { logo: string | null }): Promise<Buffer> {
  const { register, language } = context;
  const t = (text: LocalizedText) => text[language];
  const content: unknown[] = [
    { text: context.dpia ? `${t(T.dpiaTitle)} ${t(T.dpiaSubtitle)}` : `${t(T.title)} ${t(T.subtitle)}`, style: 'title' },
    { text: t(context.dpia ? T.dpiaIntro : T.draft), style: 'small', margin: [0, 0, 0, 10] },
    {
      columns: [
        { stack: [{ text: t(T.controller), style: 'heading' }, { text: controllerLines(register, language) }] },
        { stack: [{ text: t(T.dpo), style: 'heading' }, { text: dpoLines(register, language) }] },
      ],
      columnGap: 20,
      margin: [0, 0, 0, 10],
    },
    { text: t(T.overview), style: 'heading' },
    table(
      [t(T.activity), t(T.module), t(T.subjects), t(T.special), t(T.reviewed)],
      register.activities.map((a) => [t(a.name), t(a.module.name), join(a.subjects, language, ', ') || '–', a.health ? (a.healthNote?.[language] ?? '✓') : '–', reviewed(a, language)]),
      ['*', 'auto', '*', '*', 'auto'],
    ),
  ];
  register.activities.forEach((activity, index) => {
    content.push({ text: `${index + 1}. ${t(activity.name)} (${t(activity.module.name)}) – ${t(T.reviewed)}: ${reviewed(activity, language)}`, style: 'heading', margin: [0, 12, 0, 4] });
    content.push({
      table: { widths: [120, '*'], body: [...rows(activity, language), ...(activity.record.remarks ? [[t(T.remarks), activity.record.remarks]] : [])].map(([label, value]) => [{ text: label, bold: true }, { text: value }]) },
      layout: PDF_TABLE_LAYOUT,
      fontSize: 9,
    });
  });
  if (register.general.length) {
    content.push({ text: t(T.general), style: 'heading', margin: [0, 12, 0, 4] });
    content.push({ ul: register.general.map((r) => (r.note ? `${r.name} (${r.note})` : r.name)) });
  }
  if (register.processors.length) {
    content.push({ text: t(T.processors), style: 'heading', margin: [0, 12, 0, 4] });
    content.push({ ul: register.processors.map((r) => r.name[language]) });
  }
  content.push({ text: t(T.measures), style: 'heading', margin: [0, 12, 0, 4] });
  content.push(table([t(T.measure), t(T.state)], register.measures.map((m) => [t(m.title), t(m.value)]), [120, '*']));
  return renderLetterPdf({ brigade: context.brigade, letterhead: null, logo: context.logo, title: t(context.dpia ? T.dpiaTitle : T.title), content, language, now: context.now, compactTitle: true });
}

/** The register as Excel to work on: one row per activity, recipients and technical measures on own sheets. */
export async function renderRegisterXlsx(context: ExportContext): Promise<Buffer> {
  const { register, language } = context;
  const t = (text: LocalizedText) => text[language];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'f.orga';
  const subtitle = `${t(T.controller)}: ${register.controller.name || t(T.missing)} · ${t(T.dpo)}: ${register.dpo.name || t(T.missing)} · ${formatDay(context.now.toISOString(), language)}`;
  const sheet = addStyledSheet(
    workbook,
    t(T.sheetRegister),
    context.dpia ? `${t(T.dpiaTitle)} ${t(T.dpiaSubtitle)}` : `${t(T.title)} ${t(T.subtitle)}`,
    subtitle,
    [t(T.activity), t(T.module), ...FIELDS.map(t), t(T.remarks), t(T.reviewed)],
    register.activities.map((a) => [t(a.name), t(a.module.name), ...rows(a, language).slice(0, FIELDS.length).map(([, value]) => value), a.record.remarks, reviewed(a, language)]),
    [26, 16, 40, 30, 40, 26, 40, 16, 34, 34, 30, 18],
  );
  sheet.eachRow((row, number) => {
    if (number > 3) row.eachCell((cell) => (cell.alignment = { vertical: 'top', wrapText: true }));
  });
  addStyledSheet(
    workbook,
    t(T.sheetRecipients),
    t(T.sheetRecipients),
    subtitle,
    [t(T.activity), t(T.recipients), t(T.source)],
    [
      ...register.activities.flatMap((a) => a.recipients.map((r) => [t(a.name), r.note ? `${r.name[language]} (${r.note})` : r.name[language], t(T.sources[r.source])])),
      ...register.general.map((r) => [t(T.sources.general), r.note ? `${r.name} (${r.note})` : r.name, t(T.sources.general)]),
    ],
    [30, 60, 18],
  );
  addStyledSheet(workbook, t(T.sheetMeasures), t(T.measures), subtitle, [t(T.measure), t(T.state)], register.measures.map((m) => [t(m.title), t(m.value)]), [26, 100]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
