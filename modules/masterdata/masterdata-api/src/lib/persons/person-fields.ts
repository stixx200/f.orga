import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Post } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { Audit, RequirePermissions, SettingsService, ZodPipe } from '@forga/core-api';
import {
  OPTIONAL_PERSON_FIELDS,
  type OptionalPersonField,
  PersonFieldSettings,
  PersonFieldsClear,
  type PersonFieldsCleared,
  type PersonFieldState,
} from '@forga/masterdata-contracts';
import { Person } from '../masterdata.entities.js';

export const PERSON_FIELDS_SETTING = 'masterdata.personFields';
const MANAGE = 'masterdata.settings.manage';

/** Value of a field without data: empty text, `unspecified` gender, no employer or bank account. */
const EMPTY: Record<OptionalPersonField, unknown> = {
  salutation: '',
  title: '',
  nickname: '',
  birthPlace: '',
  gender: 'unspecified',
  phonePrivate: '',
  phoneWork: '',
  employer: null,
  bank: null,
  notes: '',
};

/** Persons with a stored value of the field. */
function storedWhere(field: OptionalPersonField): FilterQuery<Person> {
  const empty = EMPTY[field];
  return (empty === null ? { [field]: { $ne: null } } : { [field]: { $ne: empty } }) as FilterQuery<Person>;
}

/**
 * Switched-off fields of the person file (setting `masterdata.personFields`, L10 of the data protection concept): the
 * person file, "My area" and the import leave them out; the brigade removes stored values with `clear`.
 */
@Injectable()
export class PersonFields {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
  ) {}

  async disabled(): Promise<Set<OptionalPersonField>> {
    const settings = PersonFieldSettings.parse((await this.settings.get(PERSON_FIELDS_SETTING)) ?? {});
    return new Set(settings.disabled);
  }

  /** The input without switched-off fields: they are not stored (existing values stay until `clear`). */
  strip<T extends object>(input: T, disabled: ReadonlySet<OptionalPersonField>): T {
    return Object.fromEntries(Object.entries(input).filter(([key]) => !disabled.has(key as OptionalPersonField))) as T;
  }

  /** A person as shown: switched-off fields empty. */
  blank<T extends object>(dto: T, disabled: ReadonlySet<OptionalPersonField>): T {
    const result = { ...dto } as Record<string, unknown>;
    for (const field of disabled) {
      if (!(field in result)) continue;
      // Employer and bank account are optional in the person (only with the sensitive fields).
      if (EMPTY[field] === null) delete result[field];
      else result[field] = EMPTY[field];
    }
    return result as T;
  }

  async states(): Promise<PersonFieldState[]> {
    const disabled = await this.disabled();
    const em = this.em.fork();
    return Promise.all(
      OPTIONAL_PERSON_FIELDS.map(async (field) => ({ field, enabled: !disabled.has(field), stored: await em.count(Person, storedWhere(field)) })),
    );
  }

  /**
   * Removes the values of switched-off fields from all persons and from the history of the persons (the history would
   * keep them otherwise). Only switched-off fields: `400 masterdata.fieldEnabled`.
   */
  async clear(fields: readonly OptionalPersonField[]): Promise<PersonFieldsCleared> {
    const disabled = await this.disabled();
    const enabled = fields.filter((f) => !disabled.has(f));
    if (enabled.length) throw new BadRequestException({ code: 'masterdata.fieldEnabled', fields: enabled });
    const em = this.em.fork();
    const counts: Record<string, number> = {};
    const connection = em.getConnection();
    for (const field of new Set(fields)) {
      // Native update: the change itself must not write the old value into the history again.
      counts[field] = await em.nativeUpdate(Person, storedWhere(field), { [field]: EMPTY[field] } as never);
      await connection.execute(`update "core"."history" set "changes" = "changes" - ?::text where "entity" = 'masterdata.person' and jsonb_exists("changes", ?)`, [field, field]);
    }
    // Entries that only changed removed fields are empty now.
    await connection.execute(`delete from "core"."history" where "entity" = 'masterdata.person' and "action" = 'updated' and "changes" = '{}'::jsonb`);
    await this.audit.log('masterdata.person-fields-cleared', { fields: [...new Set(fields)], counts });
    return { counts };
  }
}

@Controller('masterdata/person-fields')
@RequirePermissions(MANAGE)
export class PersonFieldsController {
  constructor(private readonly fields: PersonFields) {}

  @Get()
  states(): Promise<PersonFieldState[]> {
    return this.fields.states();
  }

  @Post('clear')
  @HttpCode(200)
  clear(@Body(new ZodPipe(PersonFieldsClear)) input: PersonFieldsClear): Promise<PersonFieldsCleared> {
    return this.fields.clear(input.fields);
  }
}
