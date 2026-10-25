import { Migration } from '@mikro-orm/migrations';

export class Migration20261024184441_incident_offense extends Migration {

  override name = 'Migration20261024184441_incident_offense';

  override up(): void {
    this.addSql("create table \"cost_recovery\".\"incident_offense\" (\"incident_id\" varchar(255) not null, \"offense_key\" varchar(255) not null, \"set_by\" varchar(255) not null, \"set_at\" timestamptz not null, primary key (\"incident_id\"));");
  }

  override down(): void {
    this.addSql("drop table if exists \"cost_recovery\".\"incident_offense\" cascade;");
  }

}
