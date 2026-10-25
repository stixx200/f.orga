import { Migration } from '@mikro-orm/migrations';

export class Migration20261024184838_amendments extends Migration {

  override name = 'Migration20261024184838_amendments';

  override up(): void {
    this.addSql("alter table \"cost_recovery\".\"notice\" add \"amends_id\" varchar(255) null, add \"amends_number\" varchar(255) null, add \"amended_by_id\" varchar(255) null, add \"amended_by_number\" varchar(255) null;");
  }

  override down(): void {
    this.addSql("alter table \"cost_recovery\".\"notice\" drop column \"amends_id\", drop column \"amends_number\", drop column \"amended_by_id\", drop column \"amended_by_number\";");
  }

}
