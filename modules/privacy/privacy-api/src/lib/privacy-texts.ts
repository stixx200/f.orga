import { Body, ConflictException, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { PRIVACY_PERMISSION, PrivacyTextInput, PrivacyTextKey, PrivacyTexts } from '@forga/privacy-contracts';
import { Audit, type AuthenticatedUser, CurrentUser, RequirePermissions, SettingsService, ZodPipe } from '@forga/core-api';
import { PrivacyNoticeService } from './privacy-notice.js';

const SECTION = 'privacy.texts';

/**
 * Text blocks of privacy notice, access report and reply letters (setting `privacy.texts`): every change of a text is a
 * new version and a template again until someone marks it as reviewed with the data protection officer.
 */
@Controller('privacy/texts')
@RequirePermissions(PRIVACY_PERMISSION)
export class PrivacyTextsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly notices: PrivacyNoticeService,
    private readonly audit: Audit,
  ) {}

  @Get()
  texts(): Promise<PrivacyTexts> {
    return this.notices.texts();
  }

  @Put(':key')
  async change(@Param('key', new ZodPipe(PrivacyTextKey)) key: PrivacyTextKey, @Body(new ZodPipe(PrivacyTextInput)) input: PrivacyTextInput, @CurrentUser() user: AuthenticatedUser): Promise<PrivacyTexts> {
    const texts = await this.notices.texts();
    const block = texts[key];
    if (input.version !== block.version) throw new ConflictException({ code: 'conflict.stale', current: block.version, expected: input.version });
    if (input.text.de === block.text.de && input.text.en === block.text.en) return texts;
    texts[key] = { text: input.text, version: block.version + 1, changedAt: new Date().toISOString(), changedBy: user.displayName, reviewedAt: null, reviewedBy: null };
    await this.settings.set(SECTION, texts);
    await this.audit.log('privacy.text-changed', { key, version: block.version + 1 });
    return this.notices.texts();
  }

  /** "Als geprüft markieren": the block was reviewed with the data protection officer and applies. */
  @Post(':key/review')
  @HttpCode(200)
  async review(@Param('key', new ZodPipe(PrivacyTextKey)) key: PrivacyTextKey, @Body() body: { version?: unknown }, @CurrentUser() user: AuthenticatedUser): Promise<PrivacyTexts> {
    const texts = await this.notices.texts();
    const block = texts[key];
    if (body?.version !== block.version) throw new ConflictException({ code: 'conflict.stale', current: block.version, expected: body?.version });
    texts[key] = { ...block, reviewedAt: new Date().toISOString(), reviewedBy: user.displayName };
    await this.settings.set(SECTION, texts);
    await this.audit.log('privacy.text-reviewed', { key, version: block.version });
    return this.notices.texts();
  }
}
