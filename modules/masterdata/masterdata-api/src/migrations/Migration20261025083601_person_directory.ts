import { Migration } from '@mikro-orm/migrations';

export class Migration20261025083601_person_directory extends Migration {

  override name = 'Migration20261025083601_person_directory';

  /** The standard role of department commanders sees only the person directory of other departments, no longer their personnel files. */
  override up(): void {
    this.addSql(`update "core"."role" set "permissions_all_departments" = (
        select coalesce(jsonb_agg(p), '[]'::jsonb) from jsonb_array_elements_text("permissions_all_departments") p where p not in ('masterdata.persons.read', 'masterdata.persons.directory')
      ) || '["masterdata.persons.directory"]'::jsonb
      where "template_key" = 'department-commander' and jsonb_exists("permissions_all_departments", 'masterdata.persons.read')`);
  }

  override down(): void {
    this.addSql(`update "core"."role" set "permissions_all_departments" = (
        select coalesce(jsonb_agg(p), '[]'::jsonb) from jsonb_array_elements_text("permissions_all_departments") p where p not in ('masterdata.persons.read', 'masterdata.persons.directory')
      ) || '["masterdata.persons.read"]'::jsonb
      where "template_key" = 'department-commander' and jsonb_exists("permissions_all_departments", 'masterdata.persons.directory')`);
  }

}
