/** Texts of the audit log page (shell) for the actions and detail keys of this module. */
export const audit = {
  de: {
    actions: {
      'compensation.run-closed': 'Auszahlungslauf abgeschlossen',
      'compensation.run-approved': 'Auszahlungslauf sachlich richtig gezeichnet',
      'compensation.run-handed-over': 'Auszahlungslauf an die Kasse übergeben',
      'compensation.run-paid': 'Auszahlungslauf ausgezahlt',
      'compensation.manual-payout-marked': 'Barauszahlung vermerkt',
    },
    keys: {
      runId: 'Auszahlungslauf',
      withoutIban: 'Ohne IBAN',
      payee: 'Empfänger',
    },
  },
  en: {
    actions: {
      'compensation.run-closed': 'Payout run closed',
      'compensation.run-approved': 'Payout run approved',
      'compensation.run-handed-over': 'Payout run handed over',
      'compensation.run-paid': 'Payout run paid',
      'compensation.manual-payout-marked': 'Manual payout recorded',
    },
    keys: {
      runId: 'Payout run',
      withoutIban: 'Without IBAN',
      payee: 'Payee',
    },
  },
};
