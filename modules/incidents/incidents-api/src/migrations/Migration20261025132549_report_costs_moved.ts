import { Migration } from '@mikro-orm/migrations';

export class Migration20261025132549_report_costs_moved extends Migration {

  override name = 'Migration20261025132549_report_costs_moved';

  override up(): void {
    this.addSql("alter table \"incidents\".\"report\" drop column \"chargeable\", drop column \"chargeable_reason\", drop column \"notes\";");
  }

  override down(): void {
    this.addSql("alter table \"incidents\".\"report\" add \"chargeable\" bool not null default false, add \"chargeable_reason\" text not null default '', add \"notes\" text not null default '';");
  }

}
