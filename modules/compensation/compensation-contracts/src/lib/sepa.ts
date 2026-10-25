/** Debtor account of the payouts (the municipality) for SEPA credit transfers. */
export interface SepaPayer {
  name: string;
  iban: string;
  bic: string;
}

export interface SepaTransfer {
  /** Unique within the file, e.g. the person ID. */
  endToEndId: string;
  name: string;
  iban: string;
  amount: number;
  purpose: string;
}

/** IBAN without spaces, upper case. */
export const normalizeIban = (iban: string) => iban.replace(/\s+/g, '').toUpperCase();

/** Checksum of an IBAN (ISO 13616, mod 97). */
export function validIban(iban: string): boolean {
  const value = normalizeIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  const digits = (value.slice(4) + value.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}

/** Characters allowed in SEPA texts (Latin character set); umlauts are replaced, others become spaces. */
export function sepaText(text: string, max: number): string {
  const replaced = text
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 /\-?:().,'+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return replaced.slice(0, max);
}

const amount = (value: number) => value.toFixed(2);
const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * SEPA credit transfer file (pain.001.001.09) with one payment block. `executionDate` is the requested date,
 * `messageId` must be unique per file (max. 35 characters).
 */
export function sepaCreditTransfer(payer: SepaPayer, transfers: SepaTransfer[], options: { messageId: string; executionDate: string; createdAt: Date }): string {
  const total = transfers.reduce((sum, t) => sum + Math.round(t.amount * 100), 0) / 100;
  const id = sepaText(options.messageId, 35);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">',
    '<CstmrCdtTrfInitn>',
    '<GrpHdr>',
    `<MsgId>${xml(id)}</MsgId>`,
    `<CreDtTm>${options.createdAt.toISOString().slice(0, 19)}</CreDtTm>`,
    `<NbOfTxs>${transfers.length}</NbOfTxs>`,
    `<CtrlSum>${amount(total)}</CtrlSum>`,
    `<InitgPty><Nm>${xml(sepaText(payer.name, 70))}</Nm></InitgPty>`,
    '</GrpHdr>',
    '<PmtInf>',
    `<PmtInfId>${xml(id)}</PmtInfId>`,
    '<PmtMtd>TRF</PmtMtd>',
    `<NbOfTxs>${transfers.length}</NbOfTxs>`,
    `<CtrlSum>${amount(total)}</CtrlSum>`,
    '<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>',
    `<ReqdExctnDt><Dt>${options.executionDate}</Dt></ReqdExctnDt>`,
    `<Dbtr><Nm>${xml(sepaText(payer.name, 70))}</Nm></Dbtr>`,
    `<DbtrAcct><Id><IBAN>${normalizeIban(payer.iban)}</IBAN></Id></DbtrAcct>`,
    payer.bic ? `<DbtrAgt><FinInstnId><BICFI>${payer.bic.replace(/\s+/g, '').toUpperCase()}</BICFI></FinInstnId></DbtrAgt>` : '<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>',
    '<ChrgBr>SLEV</ChrgBr>',
    ...transfers.flatMap((t) => [
      '<CdtTrfTxInf>',
      `<PmtId><EndToEndId>${xml(sepaText(t.endToEndId, 35))}</EndToEndId></PmtId>`,
      `<Amt><InstdAmt Ccy="EUR">${amount(t.amount)}</InstdAmt></Amt>`,
      `<Cdtr><Nm>${xml(sepaText(t.name, 70))}</Nm></Cdtr>`,
      `<CdtrAcct><Id><IBAN>${normalizeIban(t.iban)}</IBAN></Id></CdtrAcct>`,
      `<RmtInf><Ustrd>${xml(sepaText(t.purpose, 140))}</Ustrd></RmtInf>`,
      '</CdtTrfTxInf>',
    ]),
    '</PmtInf>',
    '</CstmrCdtTrfInitn>',
    '</Document>',
  ];
  return `${lines.join('\n')}\n`;
}
