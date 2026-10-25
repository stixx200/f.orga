import { Migration } from '@mikro-orm/migrations';

export class Migration20261023120838_rolealldepartments extends Migration {

  override name = 'Migration20261023120838_rolealldepartments';

  override up(): void {
    this.addSql("alter table \"core\".\"role\" add \"permissions_all_departments\" jsonb not null default '[]';");
  }

  override down(): void {
    this.addSql("alter table \"core\".\"role\" drop column \"permissions_all_departments\";");
  }

}
