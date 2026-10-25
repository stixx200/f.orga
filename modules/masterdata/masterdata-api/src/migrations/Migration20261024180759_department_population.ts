import { Migration } from '@mikro-orm/migrations';

export class Migration20261024180759_department_population extends Migration {

  override name = 'Migration20261024180759_department_population';

  override up(): void {
    this.addSql("alter table \"masterdata\".\"department\" add \"population\" int null;");
  }

  override down(): void {
    this.addSql("alter table \"masterdata\".\"department\" drop column \"population\";");
  }

}
