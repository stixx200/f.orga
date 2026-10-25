import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions, ZodPipe } from '@forga/core-api';
import { type FunctionHolder, FunctionHolderInput } from '@forga/compensation-contracts';
import { RUNS } from '../items/items.service.js';
import { FunctionsService } from './functions.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const Generate = z.object({ year: z.number().int().min(2000).max(2100) });

@Controller('compensation/functions')
@RequirePermissions(RUNS)
export class FunctionsController {
  constructor(private readonly functions: FunctionsService) {}

  @Get()
  list(): Promise<FunctionHolder[]> {
    return this.functions.list();
  }

  @Post()
  create(@Body(new ZodPipe(FunctionHolderInput)) input: Parsed<typeof FunctionHolderInput>): Promise<FunctionHolder> {
    return this.functions.create(input);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(FunctionHolderInput)) input: Parsed<typeof FunctionHolderInput>): Promise<FunctionHolder> {
    return this.functions.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.functions.remove(id);
  }

  /** Items for the allowances of a year. */
  @Post('generate')
  @HttpCode(200)
  generate(@Body(new ZodPipe(Generate)) input: Parsed<typeof Generate>) {
    return this.functions.generate(input.year);
  }
}
