import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { BulkInspectionInput, type Defect, DefectInput, DefectUpdate, type Inspection, InspectionInput, type Item, type ItemIncident, ItemInput, ItemStatus, type ReportUsage, ReportUsageInput, RetireInput } from '@forga/equipment-contracts';
import { EntityManager } from '@mikro-orm/core';
import { INSPECT, ItemsService, READ, REPORT_DEFECTS as REPORT, WRITE } from './items.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const StatusInput = z.object({ status: ItemStatus.exclude(['retired']) });
const TriggerInput = z.object({ inspectionKey: z.string().min(1) });

@Controller('equipment')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly em: EntityManager,
  ) {}

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
  ): Promise<Item[]> {
    return this.items.list(user, { categoryKey, departmentId, vehicleId, status, q, includeRetired: includeRetired === 'true', dueBefore });
  }

  @Post('items')
  @RequirePermissions(WRITE)
  create(@Body(new ZodPipe(ItemInput)) input: Parsed<typeof ItemInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.create(user, input);
  }

  /** Also for members who only report defects (QR code). */
  @Get('items/:id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return (await this.items.toDtos([await this.items.load(this.em.fork(), id, user)]))[0];
  }

  @Get('items/:id/incidents')
  @RequirePermissions(READ)
  incidents(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<ItemIncident[]> {
    return this.items.incidentsOf(user, id);
  }

  @Put('items/:id')
  @RequirePermissions(WRITE)
  update(@Param('id') id: string, @Body(new ZodPipe(ItemInput)) input: Parsed<typeof ItemInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.update(user, id, input);
  }

  @Put('items/:id/status')
  @RequirePermissions(WRITE)
  status(@Param('id') id: string, @Body(new ZodPipe(StatusInput)) input: Parsed<typeof StatusInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.changeStatus(user, id, input.status);
  }

  @Post('items/:id/retire')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  retire(@Param('id') id: string, @Body(new ZodPipe(RetireInput)) input: Parsed<typeof RetireInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.retire(user, id, input);
  }

  @Get('items/:id/inspections')
  @RequirePermissions(READ)
  inspections(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Inspection[]> {
    return this.items.inspections(user, id);
  }

  @Post('items/:id/inspections')
  @RequirePermissions(INSPECT)
  inspect(@Param('id') id: string, @Body(new ZodPipe(InspectionInput)) input: Parsed<typeof InspectionInput>, @CurrentUser() user: AuthenticatedUser): Promise<Inspection> {
    return this.items.inspect(user, id, input);
  }

  @Post('items/:id/trigger')
  @HttpCode(200)
  @RequirePermissions(INSPECT)
  trigger(@Param('id') id: string, @Body(new ZodPipe(TriggerInput)) input: Parsed<typeof TriggerInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.items.trigger(user, id, input.inspectionKey);
  }

  @Post('inspections/bulk')
  @HttpCode(200)
  @RequirePermissions(INSPECT)
  bulk(@Body(new ZodPipe(BulkInspectionInput)) input: Parsed<typeof BulkInspectionInput>, @CurrentUser() user: AuthenticatedUser) {
    return this.items.bulkInspect(user, input);
  }

  @Get('defects')
  @RequirePermissions(READ)
  defects(@CurrentUser() user: AuthenticatedUser, @Query('open') open?: string, @Query('itemId') itemId?: string): Promise<Defect[]> {
    return this.items.defects(user, { open: open === 'true', itemId });
  }

  @Get('me/items')
  @RequirePermissions(REPORT)
  reportable(@CurrentUser() user: AuthenticatedUser, @Query('q') q = ''): Promise<{ id: string; inventoryNumber: string; name: string }[]> {
    return this.items.reportable(user, q);
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

  @Put('defects/:id')
  @RequirePermissions(WRITE)
  updateDefect(@Param('id') id: string, @Body(new ZodPipe(DefectUpdate)) input: Parsed<typeof DefectUpdate>, @CurrentUser() user: AuthenticatedUser): Promise<Defect> {
    return this.items.updateDefect(user, id, input);
  }

  /** Equipment used in an incident report (section "Geräte" of the report). */
  @Get('reports/:reportId/usage')
  usage(@Param('reportId') reportId: string): Promise<ReportUsage[]> {
    return this.items.forReport(reportId);
  }

  @Put('reports/:reportId/usage')
  setUsage(@Param('reportId') reportId: string, @Body(new ZodPipe(ReportUsageInput)) input: Parsed<typeof ReportUsageInput>, @CurrentUser() user: AuthenticatedUser): Promise<ReportUsage[]> {
    return this.items.setUsage(user, reportId, input);
  }

  /** Equipment used in a training session (tab "Geräte" of the session). */
  @Get('sessions/:sessionId/usage')
  sessionUsage(@Param('sessionId') sessionId: string): Promise<ReportUsage[]> {
    return this.items.forReport(sessionId, 'training');
  }

  @Put('sessions/:sessionId/usage')
  setSessionUsage(@Param('sessionId') sessionId: string, @Body(new ZodPipe(ReportUsageInput)) input: Parsed<typeof ReportUsageInput>, @CurrentUser() user: AuthenticatedUser): Promise<ReportUsage[]> {
    return this.items.setUsage(user, sessionId, input, 'training');
  }
}
