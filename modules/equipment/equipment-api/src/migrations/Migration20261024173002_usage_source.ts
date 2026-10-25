import { Migration } from '@mikro-orm/migrations';

export class Migration20261024173002_usage_source extends Migration {

  override name = 'Migration20261024173002_usage_source';

  override up(): void {
    this.addSql("alter table \"equipment\".\"usage\" add \"source\" varchar(255) not null default 'incidents';");
  }

  override down(): void {
    this.addSql("alter table \"equipment\".\"usage\" drop column \"source\";");
  }

}
