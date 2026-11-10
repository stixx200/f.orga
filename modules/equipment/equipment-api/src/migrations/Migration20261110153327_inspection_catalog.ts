import { Migration } from '@mikro-orm/migrations';

/**
 * Inspection type as embedded in equipment types and items before the catalog ("Prüfarten"). Schema changes come from
 * `migration:create`; the data step converts the embedded copies into catalog entries and keys:
 *
 * - One catalog entry per inspection key and content (name, interval, trigger, inspector, checklist). The same key with
 *   other content gets the next free key `<key>-2`, `<key>-3` …; all references (overrides, triggers, recorded
 *   inspections of the item) are remapped to the entry that the item's inspection list uses.
 * - Equipment types and items keep their lists as keys (`inspection_keys`); item overrides and triggers are remapped.
 *
 * The data is read before the schema changes run (`execute` runs at once, `addSql` statements afterwards, in order).
 * Down converts the keys back into embedded copies, without forms.
 */
interface Embedded {
  key: string;
  name: { de: string; en: string };
  intervalMonths: number | null;
  trigger?: string;
  inspector?: string;
  checklist?: string[];
}

interface CatalogRow {
  key: string;
  name: { de: string; en: string };
  intervalMonths: number | null;
  trigger: string;
  inspector: string;
  checklist: string[];
}

const lit = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown): string => `${lit(JSON.stringify(value))}::jsonb`;
const remapKeys = (record: Record<string, number | string>, remap: Map<string, string>): Record<string, number | string> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [remap.get(key) ?? key, value]));

export class Migration20261110153327_inspection_catalog extends Migration {

  override name = 'Migration20261110153327_inspection_catalog';

  override async up(): Promise<void> {
    const types = (await this.execute('select id, key, inspections from equipment.equipment_type')) as unknown as { id: string; key: string; inspections: Embedded[] | null }[];
    const items = (await this.execute('select id, type_key, inspections, interval_overrides, triggered from equipment.item')) as unknown as {
      id: string;
      type_key: string | null;
      inspections: Embedded[] | null;
      interval_overrides: Record<string, number>;
      triggered: Record<string, string>;
    }[];
    const inspections = (await this.execute('select id, item_id, inspection_key from equipment.inspection')) as unknown as { id: string; item_id: string; inspection_key: string }[];

    // Catalog: one entry per content; a key already taken by other content gets a suffix.
    const catalog = new Map<string, CatalogRow>();
    const variants = new Map<string, Map<string, string>>();
    const resolve = (embedded: Embedded): string => {
      const content = JSON.stringify([embedded.name, embedded.intervalMonths ?? null, embedded.trigger ?? 'periodic', embedded.inspector ?? 'competent-person', embedded.checklist ?? []]);
      const byContent = variants.get(embedded.key) ?? new Map<string, string>();
      variants.set(embedded.key, byContent);
      const known = byContent.get(content);
      if (known) return known;
      let key = embedded.key;
      for (let n = 2; catalog.has(key); n++) key = `${embedded.key}-${n}`;
      catalog.set(key, {
        key,
        name: embedded.name,
        intervalMonths: embedded.intervalMonths ?? null,
        trigger: embedded.trigger ?? 'periodic',
        inspector: embedded.inspector ?? 'competent-person',
        checklist: embedded.checklist ?? [],
      });
      byContent.set(content, key);
      return key;
    };

    // Equipment types: their keys, and the remapping of their inspection keys for the items that use the type.
    const typeKeys = new Map<string, string[]>();
    const typeRemap = new Map<string, Map<string, string>>();
    for (const type of types) {
      const remap = new Map<string, string>();
      const keys = (type.inspections ?? []).map((embedded) => {
        const key = resolve(embedded);
        remap.set(embedded.key, key);
        return key;
      });
      typeKeys.set(type.id, keys);
      typeRemap.set(type.key, remap);
    }

    // Items: own inspection keys (`null` = those of the type); overrides and triggers follow the list the item uses.
    const itemStatements: string[] = [];
    const itemRemap = new Map<string, Map<string, string>>();
    for (const item of items) {
      let remap: Map<string, string>;
      let own: string[] | null = null;
      if (item.inspections) {
        remap = new Map();
        own = item.inspections.map((embedded) => {
          const key = resolve(embedded);
          remap.set(embedded.key, key);
          return key;
        });
      } else {
        remap = (item.type_key && typeRemap.get(item.type_key)) || new Map<string, string>();
      }
      itemRemap.set(item.id, remap);
      const overrides = remapKeys(item.interval_overrides ?? {}, remap);
      const triggered = remapKeys(item.triggered ?? {}, remap);
      itemStatements.push(`update equipment.item set inspection_keys = ${own ? json(own) : 'null'}, interval_overrides = ${json(overrides)}, triggered = ${json(triggered)} where id = ${lit(item.id)};`);
    }

    // Recorded inspections keep the key of the item's list.
    const inspectionStatements: string[] = [];
    for (const row of inspections) {
      const key = itemRemap.get(row.item_id)?.get(row.inspection_key);
      if (key && key !== row.inspection_key) inspectionStatements.push(`update equipment.inspection set inspection_key = ${lit(key)} where id = ${lit(row.id)};`);
    }

    // Schema changes, then the converted data (the columns are renamed by the schema changes).
    this.addSql('create table "equipment"."inspection_type" ("id" uuid not null, "key" varchar(255) not null, "name" jsonb not null, "interval_months" int null, "trigger" varchar(255) not null default \'periodic\', "inspector" varchar(255) not null default \'competent-person\', "checklist" jsonb not null default \'[]\', "form" jsonb not null default \'{"kind":"none"}\', "version" int not null default 1, primary key ("id"));');
    this.addSql('alter table "equipment"."inspection_type" add constraint "inspection_type_key_unique" unique ("key");');
    this.addSql('alter table "equipment"."item" rename column "inspections" to "inspection_keys";');
    this.addSql('alter table "equipment"."equipment_type" rename column "inspections" to "inspection_keys";');
    this.addSql('alter table "equipment"."inspection" add "form" jsonb null;');
    for (const entry of catalog.values()) {
      this.addSql(`insert into "equipment"."inspection_type" ("id", "key", "name", "interval_months", "trigger", "inspector", "checklist", "form", "version") values (gen_random_uuid(), ${lit(entry.key)}, ${json(entry.name)}, ${entry.intervalMonths ?? 'null'}, ${lit(entry.trigger)}, ${lit(entry.inspector)}, ${json(entry.checklist)}, ${json({ kind: 'none' })}, 1);`);
    }
    for (const type of types) this.addSql(`update equipment.equipment_type set inspection_keys = ${json(typeKeys.get(type.id) ?? [])} where id = ${lit(type.id)};`);
    for (const statement of itemStatements) this.addSql(statement);
    for (const statement of inspectionStatements) this.addSql(statement);
  }

  override async down(): Promise<void> {
    const catalog = (await this.execute('select key, name, interval_months, trigger, inspector, checklist from equipment.inspection_type')) as unknown as {
      key: string; name: { de: string; en: string }; interval_months: number | null; trigger: string; inspector: string; checklist: string[];
    }[];
    const entries = new Map(catalog.map((row): [string, Embedded & { trigger: string; inspector: string; checklist: string[] }] => [row.key, { key: row.key, name: row.name, intervalMonths: row.interval_months, trigger: row.trigger, inspector: row.inspector, checklist: row.checklist }]));
    const embed = (keys: string[] | null) => (keys ?? []).flatMap((key) => {
      const entry = entries.get(key);
      return entry ? [{ key, name: entry.name, intervalMonths: entry.intervalMonths, trigger: entry.trigger, inspector: entry.inspector, checklist: entry.checklist }] : [];
    });
    const types = (await this.execute('select id, inspection_keys from equipment.equipment_type')) as unknown as { id: string; inspection_keys: string[] }[];
    const items = (await this.execute('select id, inspection_keys from equipment.item where inspection_keys is not null')) as unknown as { id: string; inspection_keys: string[] }[];

    // The embedded copies first (the columns still hold keys), then the schema goes back.
    for (const type of types) this.addSql(`update equipment.equipment_type set inspection_keys = ${json(embed(type.inspection_keys))} where id = ${lit(type.id)};`);
    for (const item of items) this.addSql(`update equipment.item set inspection_keys = ${json(embed(item.inspection_keys))} where id = ${lit(item.id)};`);
    this.addSql('alter table "equipment"."equipment_type" rename column "inspection_keys" to "inspections";');
    this.addSql('alter table "equipment"."item" rename column "inspection_keys" to "inspections";');
    this.addSql('alter table "equipment"."inspection" drop column "form";');
    this.addSql('drop table if exists "equipment"."inspection_type" cascade;');
  }

}
