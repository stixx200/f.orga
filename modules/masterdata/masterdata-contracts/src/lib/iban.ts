/** IBAN without spaces, upper case. */
export const normalizeIban = (iban: string): string => iban.replace(/\s+/g, '').toUpperCase();

/** Format and check digits of an IBAN (ISO 13616, mod 97); spaces and lower case are allowed. */
export function isValidIban(iban: string): boolean {
  const value = normalizeIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  const digits = (value.slice(4) + value.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}
