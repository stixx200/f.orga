import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import {
  type Article,
  ArticleInput,
  type Care,
  CareInput,
  ConsumableIssueInput,
  type Inspection,
  InspectionInput,
  type IssueRecord,
  type Item,
  type ItemDetail,
  ItemInput,
  ItemIssueInput,
  ItemReturnInput,
  type PersonClothing,
} from '@forga/clothing-contracts';
import { ClothingService, ISSUE, MANAGE, READ, SELF } from './clothing.service.js';

type Parsed<T extends { parse: (v: unknown) => unknown }> = ReturnType<T['parse']>;

@Controller('clothing')
export class ClothingController {
  constructor(private readonly clothing: ClothingService) {}

  @Get('articles')
  articles(): Promise<Article[]> {
    return this.clothing.articles();
  }

  @Post('articles')
  @RequirePermissions(MANAGE)
  createArticle(@Body(new ZodPipe(ArticleInput)) input: Parsed<typeof ArticleInput>, @CurrentUser() user: AuthenticatedUser): Promise<Article> {
    return this.clothing.createArticle(user, input);
  }

  @Put('articles/:id')
  @RequirePermissions(MANAGE)
  updateArticle(@Param('id') id: string, @Body(new ZodPipe(ArticleInput)) input: Parsed<typeof ArticleInput>, @CurrentUser() user: AuthenticatedUser): Promise<Article> {
    return this.clothing.updateArticle(user, id, input);
  }

  /** Adds the missing articles of the template (jacket, trousers, boots, gloves …). */
  @Post('articles/template')
  @RequirePermissions(MANAGE)
  applyTemplate(@CurrentUser() user: AuthenticatedUser): Promise<{ added: number }> {
    return this.clothing.applyTemplate(user);
  }

  @Get('items')
  @RequirePermissions(READ)
  items(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('articleKey') articleKey?: string,
    @Query('holderId') holderId?: string,
    @Query('q') query?: string,
  ): Promise<Item[]> {
    return this.clothing.items(user, { status, articleKey, holderId, query });
  }

  @Post('items')
  @RequirePermissions(MANAGE)
  createItem(@Body(new ZodPipe(ItemInput)) input: Parsed<typeof ItemInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.clothing.createItem(user, input);
  }

  @Get('items/:id')
  @RequirePermissions(READ)
  item(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<ItemDetail> {
    return this.clothing.item(user, id);
  }

  @Put('items/:id')
  @RequirePermissions(MANAGE)
  updateItem(@Param('id') id: string, @Body(new ZodPipe(ItemInput)) input: Parsed<typeof ItemInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.clothing.updateItem(user, id, input);
  }

  @Post('items/:id/issue')
  @HttpCode(200)
  @RequirePermissions(ISSUE)
  issueItem(@Param('id') id: string, @Body(new ZodPipe(ItemIssueInput)) input: Parsed<typeof ItemIssueInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.clothing.issueItem(user, id, input);
  }

  @Post('items/:id/return')
  @HttpCode(200)
  @RequirePermissions(ISSUE)
  returnItem(@Param('id') id: string, @Body(new ZodPipe(ItemReturnInput)) input: Parsed<typeof ItemReturnInput>, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.clothing.returnItem(user, id, input);
  }

  @Post('items/:id/retire')
  @HttpCode(200)
  @RequirePermissions(MANAGE)
  retireItem(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Item> {
    return this.clothing.retireItem(user, id);
  }

  @Post('items/:id/inspections')
  @RequirePermissions(ISSUE)
  inspect(@Param('id') id: string, @Body(new ZodPipe(InspectionInput)) input: Parsed<typeof InspectionInput>, @CurrentUser() user: AuthenticatedUser): Promise<Inspection> {
    return this.clothing.recordInspection(user, id, input);
  }

  /** Washing or impregnation of several pieces at once. */
  @Post('care')
  @RequirePermissions(ISSUE)
  care(@Body(new ZodPipe(CareInput)) input: Parsed<typeof CareInput>, @CurrentUser() user: AuthenticatedUser): Promise<Care[]> {
    return this.clothing.recordCare(user, input);
  }

  /** Handing out consumables (caps, gloves); only recorded in the person's history. */
  @Post('consumables')
  @RequirePermissions(ISSUE)
  issueConsumable(@Body(new ZodPipe(ConsumableIssueInput)) input: Parsed<typeof ConsumableIssueInput>, @CurrentUser() user: AuthenticatedUser): Promise<IssueRecord> {
    return this.clothing.issueConsumable(user, input);
  }

  @Get('persons/:personId')
  person(@Param('personId') personId: string, @CurrentUser() user: AuthenticatedUser): Promise<PersonClothing> {
    return this.clothing.personClothing(user, personId);
  }

  /** "My area": the own protective equipment. */
  @Get('me')
  @RequirePermissions(SELF)
  me(@CurrentUser() user: AuthenticatedUser): Promise<PersonClothing> {
    if (!user.personId) throw new NotFoundException({ code: 'clothing.noPerson' });
    return this.clothing.personClothing(user, user.personId);
  }
}
