import { Migration } from '@mikro-orm/migrations';

export class Migration20261024164659_checkin_confirmed extends Migration {

  override name = 'Migration20261024164659_checkin_confirmed';

  override up(): void {
    this.addSql("alter table \"training\".\"attendance\" add \"confirmed\" boolean not null default true;");
  }

  override down(): void {
    this.addSql("alter table \"training\".\"attendance\" drop column \"confirmed\";");
  }

}
