import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { SmtpSettings } from '@forga/core-contracts';
import { SettingsService } from '../settings/settings.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

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

/**
 * Sends e-mails via the SMTP server from the settings.
 * With `FORGA_MAIL_TRANSPORT=memory` (tests, demos) mails are only collected in `sent`.
 */
@Injectable()
export class MailService {
  readonly sent: Mail[] = [];
  private readonly logger = new Logger('Mail');

  constructor(private readonly settings: SettingsService) {}

  /** Throws `mail.notConfigured`, or a `mail.*` code with status 502 if the SMTP server refuses or cannot be reached. */
  async send(mail: Mail): Promise<void> {
    if (process.env.FORGA_MAIL_TRANSPORT === 'memory') {
      this.sent.push(mail);
      return;
    }
    const smtp = await this.settings.get<SmtpSettings>('smtp');
    if (!smtp?.host || !smtp.sender) throw new BadRequestException({ code: 'mail.notConfigured' });
    const transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      requireTLS: smtp.starttls && smtp.port !== 465,
      auth: smtp.username ? { user: smtp.username, pass: smtp.password ?? '' } : undefined,
      connectionTimeout: 15_000,
    });
    try {
      await transport.sendMail({ from: smtp.sender, to: mail.to, subject: mail.subject, text: mail.text });
    } catch (error) {
      const code = mailErrorCode(error);
      this.logger.warn(`Sending e-mail failed (${code}): ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException({ code }, HttpStatus.BAD_GATEWAY);
    }
  }
}
