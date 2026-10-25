import { Migration } from '@mikro-orm/migrations';

export class Migration20261024174751_breathing_device extends Migration {

  override name = 'Migration20261024174751_breathing_device';

  override up(): void {
    this.addSql("alter table \"incidents\".\"report_personnel\" add \"breathing_device\" varchar(255) null;");
  }

  override down(): void {
    this.addSql("alter table \"incidents\".\"report_personnel\" drop column \"breathing_device\";");
  }

}
