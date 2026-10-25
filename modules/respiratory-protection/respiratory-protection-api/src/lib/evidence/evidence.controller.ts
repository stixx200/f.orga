import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { type Evidence, EvidenceInput, type FitnessStatus, type PersonRespiratoryProtection, QuickEntryInput } from '@forga/respiratory-protection-contracts';
import { EVIDENCE, EvidenceService, READ } from './evidence.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;

@Controller('respiratory-protection')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  /** Traffic light of all visible breathing apparatus wearers. */
  @Get('status')
  @RequirePermissions(READ)
  async status(@CurrentUser() user: AuthenticatedUser, @Query('departmentId') departmentId?: string, @Query('color') color?: string): Promise<FitnessStatus[]> {
    const statuses = await this.evidence.visibleStatuses(user, await this.evidence.wearers(user, departmentId));
    return statuses.filter((s) => !color || s.color === color).toSorted((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }

  @Get('me')
  @RequirePermissions('respiratory-protection.self')
  own(@CurrentUser() user: AuthenticatedUser): Promise<PersonRespiratoryProtection> {
    return this.evidence.ownView(user);
  }

  @Get('persons/:personId')
  @RequirePermissions(READ)
  person(@Param('personId') personId: string, @CurrentUser() user: AuthenticatedUser): Promise<PersonRespiratoryProtection> {
    return this.evidence.personView(user, personId);
  }

  /** Examinations need `respiratory-protection.examinations`, other evidence `respiratory-protection.evidence`. */
  @Post('evidence')
  create(@Body(new ZodPipe(EvidenceInput)) input: Parsed<typeof EvidenceInput>, @CurrentUser() user: AuthenticatedUser): Promise<Evidence> {
    return this.evidence.create(user, input);
  }

  @Post('evidence/quick')
  @RequirePermissions(EVIDENCE)
  quick(@Body(new ZodPipe(QuickEntryInput)) input: Parsed<typeof QuickEntryInput>, @CurrentUser() user: AuthenticatedUser): Promise<Evidence[]> {
    return this.evidence.quickEntry(user, input);
  }

  @Put('evidence/:id')
  update(@Param('id') id: string, @Body(new ZodPipe(EvidenceInput)) input: Parsed<typeof EvidenceInput>, @CurrentUser() user: AuthenticatedUser): Promise<Evidence> {
    return this.evidence.update(user, id, input);
  }

  @Delete('evidence/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.evidence.remove(user, id);
  }
}
