import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import {
  BulkInspectionInput,
  type Defect,
  DefectInput,
  DefectUpdate,
  type Inspection,
  InspectionCancellation,
  InspectionCorrection,
  InspectionInput,
  type Item,
  type ItemIncident,
  ItemInput,
  ItemStatus,
  type ItemSummary,
  LabelsPrintedInput,
  type RecentBulkCategories,
  type ReportableItem,
  type ReportUsage,
  ReportUsageInput,
  RetireInput,
} from '@forga/equipment-contracts';
import { ItemsService, READ, REPORT_DEFECTS as REPORT } from './items.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const StatusInput = z.object({ status: ItemStatus.exclude(['retired']) });
const TriggerInput = z.object({ inspectionKey: z.string().min(1) });

@Controller('equipment')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get('items')
  @RequirePermissions(READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('categoryKey') categoryKey?: string,
    @Query('departmentId') departmentId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('includeRetired') includeRetired?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('withoutLabel') withoutLabel?: string,
  ): Promise<Item[]> {
    return this.items.list(user, { categoryKey, departmentId, vehicleId, status, q, includeRetired: includeRetired === 'true', dueBefore, withoutLabel: withoutLabel === 'true' });
  }

  /** Labels of these items printed; write permission for each item (breathing apparatus: also `equipment.breathing.write`). */
  @Post('items/labels/printed')
  @HttpCode(200)
  labelsPrinted(@Body(new ZodPipe(LabelsPrintedInput)) input: Parsed<typeof LabelsPrintedInput>, @CurrentUser() user: AuthenticatedUser): Promise<{ marked: number }> {
    return this.items.labelsPrinted(user, input.itemIds);
  }

  /** `equipment.write` in the department, for breathing apparatus categories also `equipment.breathing.write` (checked in the service); likewise editing and retiring. */
  @Post('items')
  create(@Body(new ZodPipe(ItemInput)) input: Parsed<typeof ItemInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.create(user, input);
  }

  /** Also for members who only report defects (QR code): they get the summary of the item. */
  @Get('items/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Item | ItemSummary> {
    return this.items.view(user, id);
  }

  @Get('items/:id/incidents')
  @RequirePermissions(READ)
  incidents(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<ItemIncident[]> {
    return this.items.incidentsOf(user, id);
  }

  @Put('items/:id')
  update(@Param('id') id: string, @Body(new ZodPipe(ItemInput)) input: Parsed<typeof ItemInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.update(user, id, input);
  }

  /** `equipment.write`, for breathing apparatus also `equipment.breathing.write` (checked per item). */
  @Put('items/:id/status')
  status(@Param('id') id: string, @Body(new ZodPipe(StatusInput)) input: Parsed<typeof StatusInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.changeStatus(user, id, input.status);
  }

  @Post('items/:id/retire')
  @HttpCode(200)
  retire(@Param('id') id: string, @Body(new ZodPipe(RetireInput)) input: Parsed<typeof RetireInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.retire(user, id, input);
  }

  @Get('items/:id/inspections')
  @RequirePermissions(READ)
  inspections(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Inspection[]> {
    return this.items.inspections(user, id);
  }

  /** `equipment.inspect`, for breathing apparatus also `equipment.breathing.inspect` (checked per item); likewise below. */
  @Post('items/:id/inspections')
  inspect(@Param('id') id: string, @Body(new ZodPipe(InspectionInput)) input: Parsed<typeof InspectionInput>, @CurrentUser() user: AuthenticatedUser): Promise<Inspection> {
    return this.items.inspect(user, id, input);
  }

  @Post('items/:id/trigger')
  @HttpCode(200)
  trigger(@Param('id') id: string, @Body(new ZodPipe(TriggerInput)) input: Parsed<typeof TriggerInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.trigger(user, id, input.inspectionKey);
  }

  /** Kinds this user booked most recently. */
  @Get('inspections/bulk/recent')
  @RequirePermissions(READ)
  recentBulk(@CurrentUser() user: AuthenticatedUser): Promise<RecentBulkCategories> {
    return this.items.recentBulkCategories(user.id);
  }

  @Post('inspections/bulk')
  @HttpCode(200)
  bulk(@Body(new ZodPipe(BulkInspectionInput)) input: Parsed<typeof BulkInspectionInput>, @CurrentUser() user: AuthenticatedUser) {
    return this.items.bulkInspect(user, input);
  }

  /** Corrects an inspection with a reason. */
  @Put('inspections/:id')
  correctInspection(@Param('id') id: string, @Body(new ZodPipe(InspectionCorrection)) input: Parsed<typeof InspectionCorrection>, @CurrentUser() user: AuthenticatedUser): Promise<Inspection> {
    return this.items.correctInspection(user, id, input);
  }

  /** Cancels an inspection with a reason; it stays in the history. */
  @Post('inspections/:id/cancel')
  @HttpCode(200)
  cancelInspection(@Param('id') id: string, @Body(new ZodPipe(InspectionCancellation)) input: Parsed<typeof InspectionCancellation>, @CurrentUser() user: AuthenticatedUser): Promise<Inspection> {
    return this.items.cancelInspection(user, id, input);
  }

  @Get('defects')
  @RequirePermissions(READ)
  defects(@CurrentUser() user: AuthenticatedUser, @Query('open') open?: string, @Query('itemId') itemId?: string): Promise<Defect[]> {
    return this.items.defects(user, { open: open === 'true', itemId });
  }

  @Get('me/items')
  @RequirePermissions(REPORT)
  reportable(@CurrentUser() user: AuthenticatedUser, @Query('q') q = '', @Query('code') code = ''): Promise<ReportableItem[]> {
    return this.items.reportable(user, q, code);
  }

  @Get('me/defects')
  @RequirePermissions(REPORT)
  ownDefects(@CurrentUser() user: AuthenticatedUser): Promise<Defect[]> {
    return this.items.ownDefects(user);
  }

  @Post('items/:id/defects')
  reportDefect(@Param('id') id: string, @Body(new ZodPipe(DefectInput)) input: Parsed<typeof DefectInput>, @CurrentUser() user: AuthenticatedUser): Promise<Defect> {
    return this.items.reportDefect(user, id, input);
  }

  /** `equipment.write`, for breathing apparatus also `equipment.breathing.write`. */
  @Put('defects/:id')
  updateDefect(@Param('id') id: string, @Body(new ZodPipe(DefectUpdate)) input: Parsed<typeof DefectUpdate>, @CurrentUser() user: AuthenticatedUser): Promise<Defect> {
    return this.items.updateDefect(user, id, input);
  }

  /** Equipment used in an incident report (section "Geräte" of the report); access like the report. */
  @Get('reports/:reportId/usage')
  usage(@Param('reportId') reportId: string, @CurrentUser() user: AuthenticatedUser): Promise<ReportUsage[]> {
    return this.items.usage(user, reportId, 'incidents');
  }

  @Put('reports/:reportId/usage')
  setUsage(@Param('reportId') reportId: string, @Body(new ZodPipe(ReportUsageInput)) input: Parsed<typeof ReportUsageInput>, @CurrentUser() user: AuthenticatedUser): Promise<ReportUsage[]> {
    return this.items.setUsage(user, reportId, input);
  }

  /** Equipment used in a training session (tab "Geräte" of the session); access like the session. */
  @Get('sessions/:sessionId/usage')
  sessionUsage(@Param('sessionId') sessionId: string, @CurrentUser() user: AuthenticatedUser): Promise<ReportUsage[]> {
    return this.items.usage(user, sessionId, 'training');
  }

  @Put('sessions/:sessionId/usage')
  setSessionUsage(@Param('sessionId') sessionId: string, @Body(new ZodPipe(ReportUsageInput)) input: Parsed<typeof ReportUsageInput>, @CurrentUser() user: AuthenticatedUser): Promise<ReportUsage[]> {
    return this.items.setUsage(user, sessionId, input, 'training');
  }
}
