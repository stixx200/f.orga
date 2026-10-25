import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { SmtpSettings } from '@forga/core-contracts';
import { SettingsService } from '../settings/settings.js';
import { mailErrorCode } from './mail-errors.js';

export { mailErrorCode } from './mail-errors.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends e-mails via the SMTP server from the settings.
 * With `FORGA_MAIL_TRANSPORT=memory` (tests, demos) mails are only collected in `sent`.
 */
@Injectable()
export class MailService {
  readonly sent: Mail[] = [];
  /** Memory transport only: sending fails with this `mail.*` code while set (tests of the error handling). */
  failWith: string | null = null;
  private readonly logger = new Logger('Mail');

  constructor(private readonly settings: SettingsService) {}

  /** Throws `mail.notConfigured` unless SMTP server and sender are set (also with the memory transport). */
  async assertConfigured(): Promise<void> {
    const smtp = await this.settings.get<SmtpSettings>('smtp');
    if (!smtp?.host || !smtp.sender) throw new BadRequestException({ code: 'mail.notConfigured' });
  }

  /** Throws `mail.notConfigured`, or a `mail.*` code with status 502 if the SMTP server refuses or cannot be reached. */
  async send(mail: Mail): Promise<void> {
    if (process.env.FORGA_MAIL_TRANSPORT === 'memory') {
      if (this.failWith) throw new HttpException({ code: this.failWith }, HttpStatus.BAD_GATEWAY);
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
