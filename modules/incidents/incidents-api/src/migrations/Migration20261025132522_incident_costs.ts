import { Migration } from '@mikro-orm/migrations';

export class Migration20261025132522_incident_costs extends Migration {

  override name = 'Migration20261025132522_incident_costs';

  override up(): void {
    this.addSql("alter table \"incidents\".\"incident\" add \"chargeable\" boolean not null default false, add \"chargeable_reason\" text not null default '', add \"notes\" text not null default '';");
  }

  override down(): void {
    this.addSql("alter table \"incidents\".\"incident\" drop column \"chargeable\", drop column \"chargeable_reason\", drop column \"notes\";");
  }

}
