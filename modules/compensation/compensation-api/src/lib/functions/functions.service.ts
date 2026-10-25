import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { allowanceShare, type FunctionHolder, FunctionHolderInput } from '@forga/compensation-contracts';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { FunctionHolderEntity } from '../compensation.entities.js';
import { type DesiredItem, ItemsService } from '../items/items.service.js';

type ParsedHolder = ReturnType<typeof FunctionHolderInput.parse>;

const toDto = (h: FunctionHolderEntity): FunctionHolder => ({ id: h.id, personId: h.personId, functionKey: h.functionKey, from: h.from, to: h.to ?? null, source: 'module', version: h.version });

/** Function holders and their annual allowances (§ 16 Abs. 2 FwG). */
@Injectable()
export class FunctionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly items: ItemsService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  /** Holders kept here for functions without an office, and the office holders of the person files for the others. */
  async list(): Promise<FunctionHolder[]> {
    const config = await this.items.config();
    const linked = new Set(config.functionAllowances.filter((f) => f.office).map((f) => f.key));
    const own = (await this.em.fork().find(FunctionHolderEntity, {}, { orderBy: { functionKey: 'asc', from: 'asc' } })).filter((h) => !linked.has(h.functionKey)).map(toDto);
    return [...own, ...(await this.fromOffices())].toSorted((a, b) => a.functionKey.localeCompare(b.functionKey) || a.from.localeCompare(b.from));
  }

  /** Holders of the functions linked to an office, from the person files (optionally only in the given departments). */
  private async fromOffices(): Promise<FunctionHolder[]> {
    const allowances = (await this.items.config()).functionAllowances.filter((f) => f.office);
    if (!allowances.length) return [];
    const holdings = await this.directory.offices({ offices: [...new Set(allowances.map((f) => f.office!))] });
    return allowances.flatMap((f) =>
      holdings
        .filter((h) => h.office === f.office && (!f.departmentIds.length || (h.departmentId !== null && f.departmentIds.includes(h.departmentId))))
        .map((h) => ({ id: `office:${f.key}:${h.personId}:${h.from}`, personId: h.personId, functionKey: f.key, from: h.from, to: h.to, source: 'masterdata' as const, version: 0 })),
    );
  }

  private async validate(input: ParsedHolder): Promise<void> {
    const config = await this.items.config();
    const allowance = config.functionAllowances.find((f) => f.key === input.functionKey);
    if (!allowance) throw new BadRequestException({ code: 'compensation.unknownFunction', key: input.functionKey });
    if (allowance.office) throw new BadRequestException({ code: 'compensation.functionFromOffices', key: input.functionKey });
    if (input.to && input.to < input.from) throw new BadRequestException({ code: 'compensation.endBeforeStart' });
    if (!(await this.directory.snapshots([input.personId])).length) throw new BadRequestException({ code: 'compensation.unknownPerson' });
  }

  async create(input: ParsedHolder): Promise<FunctionHolder> {
    await this.validate(input);
    const em = this.em.fork();
    const holder = em.create(FunctionHolderEntity, input);
    await em.flush();
    return toDto(holder);
  }

  async update(id: string, input: ParsedHolder): Promise<FunctionHolder> {
    await this.validate(input);
    const em = this.em.fork();
    const holder = await em.findOne(FunctionHolderEntity, id);
    if (!holder) throw new NotFoundException();
    Object.assign(holder, input);
    await em.flush();
    return toDto(holder);
  }

  async remove(id: string): Promise<void> {
    const em = this.em.fork();
    const holder = await em.findOne(FunctionHolderEntity, id);
    if (!holder) throw new NotFoundException();
    await em.remove(holder).flush();
  }

  /**
   * Items for the allowances of a year (dated 31 December). Running it again replaces open items;
   * amounts already paid out are corrected. Returns the functions with more holders than allowed.
   */
  async generate(year: number): Promise<{ items: number; exceeded: { functionKey: string; holders: number; maxHolders: number }[] }> {
    const config = await this.items.config();
    const holders = (await this.list()).filter((h) => h.from <= `${year}-12-31` && (!h.to || h.to >= `${year}-01-01`));
    const snapshots = new Map((await this.directory.snapshots([...new Set(holders.map((h) => h.personId))])).map((s) => [s.id, s]));
    let count = 0;
    const exceeded: { functionKey: string; holders: number; maxHolders: number }[] = [];
    for (const allowance of config.functionAllowances) {
      const own = holders.filter((h) => h.functionKey === allowance.key);
      const byPerson = new Map<string, number>();
      for (const h of own) byPerson.set(h.personId, (byPerson.get(h.personId) ?? 0) + allowanceShare(allowance.amount, year, h.from, h.to ?? null, config.functionSplit));
      const rows: DesiredItem[] = [...byPerson]
        .filter(([, amount]) => amount > 0)
        .map(([personId, amount]) => ({
          personId, departmentId: snapshots.get(personId)?.primaryDepartmentId ?? null, kind: 'flat-rate', label: `${allowance.name.de} ${year}`, date: `${year}-12-31`,
          from: null, to: null, hours: null, rate: null, amount: Math.min(amount, allowance.amount), workingHours: false,
        }));
      await this.items.apply('function', `${year}:${allowance.key}`, rows);
      count += rows.length;
      // Holders at the same time: the maximum over the year's days where holders change.
      const days = [...new Set(own.flatMap((h) => [h.from < `${year}-01-01` ? `${year}-01-01` : h.from]))];
      const peak = Math.max(0, ...days.map((d) => own.filter((h) => h.from <= d && (!h.to || h.to >= d)).length));
      if (allowance.maxHolders !== null && peak > allowance.maxHolders) exceeded.push({ functionKey: allowance.key, holders: peak, maxHolders: allowance.maxHolders });
    }
    return { items: count, exceeded };
  }
}
