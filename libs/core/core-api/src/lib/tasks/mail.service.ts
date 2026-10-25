import { BadRequestException, Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { SmtpSettings } from '@forga/core-contracts';
import { SettingsService } from '../settings/settings.js';

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

  constructor(private readonly settings: SettingsService) {}

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
    });
    await transport.sendMail({ from: smtp.sender, to: mail.to, subject: mail.subject, text: mail.text });
  }
}
