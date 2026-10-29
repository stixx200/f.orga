import type { LocalizedText } from '@forga/core-contracts';

/**
 * How an API token appears as recipient in the register and the access report: „Schnittstelle „Name“ – Empfänger“
 * (L23). Tokens created before recipient and purpose existed show the name only.
 */
export function tokenRecipientName(token: { name: string; recipient?: string | null }): LocalizedText {
  const recipient = token.recipient ? ` – ${token.recipient}` : '';
  return { de: `Schnittstelle „${token.name}“${recipient}`, en: `Interface "${token.name}"${recipient}` };
}
