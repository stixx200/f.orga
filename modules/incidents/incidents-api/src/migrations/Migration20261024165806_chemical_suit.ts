import { Migration } from '@mikro-orm/migrations';

export class Migration20261024165806_chemical_suit extends Migration {

  override name = 'Migration20261024165806_chemical_suit';

  override up(): void {
    this.addSql("alter table \"incidents\".\"report_personnel\" add \"chemical_suit\" boolean not null default false;");
  }

  override down(): void {
    this.addSql("alter table \"incidents\".\"report_personnel\" drop column \"chemical_suit\";");
  }

}
