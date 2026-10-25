import { sepaCreditTransfer, sepaText, validIban } from './sepa.js';

describe('sepa', () => {
  it('checks IBANs', () => {
    expect(validIban('DE02 1203 0000 0000 2020 51')).toBe(true);
    expect(validIban('DE02120300000000202052')).toBe(false);
    expect(validIban('kein')).toBe(false);
  });

  it('keeps texts in the SEPA character set', () => {
    expect(sepaText('Müller & Söhne <Grüße>', 70)).toBe('Mueller Soehne Gruesse');
    expect(sepaText('x'.repeat(200), 140)).toHaveLength(140);
  });

  it('writes a pain.001.001.09 file with sums', () => {
    const file = sepaCreditTransfer(
      { name: 'Stadt Musterstadt', iban: 'DE02500105170137075030', bic: '' },
      [
        { endToEndId: 'P1', name: 'Jonas Test', iban: 'DE02120300000000202051', amount: 45.5, purpose: 'Entschädigung Feuerwehr' },
        { endToEndId: 'P2', name: 'Lena Test', iban: 'DE02500105170137075030', amount: 10, purpose: 'Entschädigung Feuerwehr' },
      ],
      { messageId: 'F-ORGA-2026-01', executionDate: '2026-04-15', createdAt: new Date('2026-04-10T08:00:00Z') },
    );
    expect(file).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.09');
    expect(file.match(/<NbOfTxs>2<\/NbOfTxs>/g)).toHaveLength(2);
    expect(file).toContain('<CtrlSum>55.50</CtrlSum>');
    expect(file).toContain('<InstdAmt Ccy="EUR">45.50</InstdAmt>');
    expect(file).toContain('<Id>NOTPROVIDED</Id>');
  });
});
