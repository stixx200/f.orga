import { Migration } from '@mikro-orm/migrations';

export class Migration20261024173930_device_and_group extends Migration {

  override name = 'Migration20261024173930_device_and_group';

  override up(): void {
    this.addSql("alter table \"respiratory_protection\".\"evidence\" add \"examination_group\" varchar(255) null, add \"device\" varchar(255) null;");
  }

  override down(): void {
    this.addSql("alter table \"respiratory_protection\".\"evidence\" drop column \"examination_group\", drop column \"device\";");
  }

}
