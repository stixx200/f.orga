import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthenticatedUser, berlinDate, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import {
  type Candidate,
  DecideInput,
  EntryUpdate,
  type Exclusion,
  ExclusionInput,
  ListInput,
  ManualEntryInput,
  type PersonPromotion,
  type PromotionList,
  type PromotionListSummary,
  RuleTestInput,
} from '@forga/promotions-contracts';
import { DECIDE, EXCLUDE, PromotionsService, READ } from './promotions.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const Version = z.object({ version: z.number().int() });
const ListUpdate = ListInput.extend(Version.shape);
const ExclusionUpdate = ExclusionInput.extend(Version.shape);
const date = z.iso.date();

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  /** Next possible promotion of every eligible person on the date (default: today). */
  @Get('candidates')
  @RequirePermissions(READ)
  candidates(@CurrentUser() user: AuthenticatedUser, @Query('on') on?: string): Promise<Candidate[]> {
    return this.promotions.candidates(user, on ? date.parse(on) : berlinDate());
  }

  /** The rule editor tries an unsaved rule on a person. */
  @Post('rules/test')
  @HttpCode(200)
  @RequirePermissions('promotions.settings.manage')
  testRule(@CurrentUser() user: AuthenticatedUser, @Body(new ZodPipe(RuleTestInput)) input: Parsed<typeof RuleTestInput>) {
    return this.promotions.testRule(user, input);
  }

  @Get('persons/:id')
  @RequirePermissions(READ)
  person(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<PersonPromotion> {
    return this.promotions.person(user, id);
  }

  @Get('lists')
  @RequirePermissions(READ)
  lists(): Promise<PromotionListSummary[]> {
    return this.promotions.lists();
  }

  @Post('lists')
  @RequirePermissions(DECIDE)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodPipe(ListInput)) input: Parsed<typeof ListInput>): Promise<PromotionList> {
    return this.promotions.create(user, input);
  }

  @Get('lists/:id')
  @RequirePermissions(READ)
  list(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<PromotionList> {
    return this.promotions.list(user, id);
  }

  @Put('lists/:id')
  @RequirePermissions(DECIDE)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(ListUpdate)) input: Parsed<typeof ListUpdate>): Promise<PromotionList> {
    return this.promotions.update(user, id, input);
  }

  @Delete('lists/:id')
  @HttpCode(204)
  @RequirePermissions(DECIDE)
  remove(@Param('id') id: string): Promise<void> {
    return this.promotions.remove(id);
  }

  @Post('lists/:id/refresh')
  @HttpCode(200)
  @RequirePermissions(DECIDE)
  refresh(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(Version)) input: Parsed<typeof Version>): Promise<PromotionList> {
    return this.promotions.refresh(user, id, input.version);
  }

  /** Decision on an entry; checked per department in the service. */
  @Put('lists/:id/entries/:personId')
  @RequirePermissions(READ)
  updateEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('personId') personId: string,
    @Body(new ZodPipe(EntryUpdate)) input: Parsed<typeof EntryUpdate>,
  ): Promise<PromotionList> {
    return this.promotions.updateEntry(user, id, personId, input);
  }

  @Post('lists/:id/entries')
  @RequirePermissions(DECIDE)
  addManual(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(ManualEntryInput)) input: Parsed<typeof ManualEntryInput>): Promise<PromotionList> {
    return this.promotions.addManual(user, id, input);
  }

  @Delete('lists/:id/entries/:personId')
  @RequirePermissions(DECIDE)
  removeManual(@Param('id') id: string, @Param('personId') personId: string, @Query('version') version: string): Promise<PromotionList> {
    return this.promotions.removeManual(id, personId, Number(version));
  }

  @Post('lists/:id/decide')
  @HttpCode(200)
  @RequirePermissions(DECIDE)
  decide(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(DecideInput)) input: Parsed<typeof DecideInput>): Promise<PromotionList> {
    return this.promotions.decide(user, id, input);
  }

  @Post('lists/:id/reopen')
  @HttpCode(200)
  @RequirePermissions(DECIDE)
  reopen(@Param('id') id: string, @Body(new ZodPipe(Version)) input: Parsed<typeof Version>): Promise<PromotionList> {
    return this.promotions.reopen(id, input.version);
  }

  @Post('lists/:id/execute')
  @HttpCode(200)
  @RequirePermissions(DECIDE)
  execute(@Param('id') id: string, @Body(new ZodPipe(Version)) input: Parsed<typeof Version>): Promise<PromotionList> {
    return this.promotions.execute(id, input.version);
  }

  /** Certificates as serial PDF; with `personId` only that person's. */
  @Get('lists/:id/certificates.pdf')
  @RequirePermissions(DECIDE)
  async certificates(@Param('id') id: string, @Query('personId') personId: string | undefined, @Res() res: Response): Promise<void> {
    const { data } = await this.promotions.certificates(id, personId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Urkunden.pdf"');
    res.send(data);
  }

  @Get('exclusions')
  @RequirePermissions(EXCLUDE)
  exclusions(): Promise<Exclusion[]> {
    return this.promotions.exclusions();
  }

  @Post('exclusions')
  @RequirePermissions(EXCLUDE)
  createExclusion(@CurrentUser() user: AuthenticatedUser, @Body(new ZodPipe(ExclusionInput)) input: Parsed<typeof ExclusionInput>): Promise<Exclusion> {
    return this.promotions.createExclusion(user, input);
  }

  @Put('exclusions/:id')
  @RequirePermissions(EXCLUDE)
  updateExclusion(@Param('id') id: string, @Body(new ZodPipe(ExclusionUpdate)) input: Parsed<typeof ExclusionUpdate>): Promise<Exclusion> {
    return this.promotions.updateExclusion(id, input);
  }

  @Delete('exclusions/:id')
  @HttpCode(204)
  @RequirePermissions(EXCLUDE)
  removeExclusion(@Param('id') id: string): Promise<void> {
    return this.promotions.removeExclusion(id);
  }
}
