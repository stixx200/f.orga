/**
 * Error code for a failed delivery, so the UI can say what to fix in the SMTP settings
 * instead of showing a generic server error.
 */
export function mailErrorCode(error: unknown): string {
  const { code, responseCode } = (error ?? {}) as { code?: string; responseCode?: number };
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) return 'mail.authFailed';
  if (code === 'ETLS' || /certificate|ssl|tls/i.test(error instanceof Error ? error.message : '')) return 'mail.tlsFailed';
  if (code === 'EENVELOPE' || (responseCode !== undefined && responseCode >= 550 && responseCode <= 554)) return 'mail.rejected';
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') return 'mail.connectionFailed';
  return 'mail.sendFailed';
}
