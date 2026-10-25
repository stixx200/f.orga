import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { AmountsInput, type Item, ItemAmountInput, ManualItemInput, type MyCompensation, type YearTotal } from '@forga/compensation-contracts';
import { ItemsService, MANUAL, READ, RUNS } from './items.service.js';
import { YearTotals } from '../lists/year-totals.js';

type Parsed<T extends z.ZodType> = z.infer<T>;

@Controller('compensation')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly totals: YearTotals,
  ) {}

  /** Items of visible persons; `open=true` for items not yet paid out. */
  @Get('items')
  @RequirePermissions(READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query('open') open?: string, @Query('year') year?: string): Promise<Item[]> {
    return this.items.list(user, { open: open === 'true', year: year ? Number(year) : undefined });
  }

  @Get('persons/:personId/items')
  async person(@Param('personId') personId: string, @Query('year') year: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<Item[]> {
    if (!(await this.items.canReadPerson(user, personId))) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [READ] });
    return this.items.list(user, { personId, year: year ? Number(year) : undefined });
  }

  @Post('items')
  @RequirePermissions(MANUAL)
  create(@Body(new ZodPipe(ManualItemInput)) input: Parsed<typeof ManualItemInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.createManual(user, input);
  }

  /** Several amounts at once (list of the loss of earnings in a run). */
  @Put('items/amounts')
  @RequirePermissions(RUNS)
  amounts(@Body(new ZodPipe(AmountsInput)) input: Parsed<typeof AmountsInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item[]> {
    return this.items.setAmounts(user, input);
  }

  /** "Meine Entschädigung": own items of a year (always the person linked to the user). */
  @Get('me')
  @RequirePermissions('compensation.self')
  mine(@Query('year') year: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<MyCompensation> {
    return this.items.mine(user, Number(year) || new Date().getFullYear());
  }

  @Put('items/:id/amount')
  @RequirePermissions(RUNS)
  amount(@Param('id') id: string, @Body(new ZodPipe(ItemAmountInput)) input: Parsed<typeof ItemAmountInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.setAmount(user, id, input);
  }

  @Delete('items/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.items.removeManual(user, id);
  }

  /** Annual totals per person with the tax-free hint. */
  @Get('year-totals')
  @RequirePermissions(RUNS)
  yearTotals(@Query('year') year?: string): Promise<YearTotal[]> {
    return this.totals.compute(Number(year) || new Date().getFullYear());
  }
}
