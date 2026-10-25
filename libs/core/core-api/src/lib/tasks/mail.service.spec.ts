import { mailErrorCode } from './mail-errors.js';

describe('mailErrorCode', () => {
  it('names what to fix in the SMTP settings', () => {
    expect(mailErrorCode(Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }))).toBe('mail.authFailed');
    expect(mailErrorCode(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ESOCKET' }))).toBe('mail.connectionFailed');
    expect(mailErrorCode(Object.assign(new Error('Greeting never received'), { code: 'ETIMEDOUT' }))).toBe('mail.connectionFailed');
    expect(mailErrorCode(Object.assign(new Error('self-signed certificate'), { code: 'ESOCKET' }))).toBe('mail.tlsFailed');
    expect(mailErrorCode(Object.assign(new Error('Recipient rejected'), { code: 'EENVELOPE', responseCode: 550 }))).toBe('mail.rejected');
    expect(mailErrorCode(new Error('something else'))).toBe('mail.sendFailed');
  });
});
