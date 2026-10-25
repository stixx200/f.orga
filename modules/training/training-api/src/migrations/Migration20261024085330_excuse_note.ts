import { Migration } from '@mikro-orm/migrations';

export class Migration20261024085330_excuse_note extends Migration {

  override name = 'Migration20261024085330_excuse_note';

  override up(): void {
    this.addSql("alter table \"training\".\"attendance\" add \"note\" text not null default '';");
  }

  override down(): void {
    this.addSql("alter table \"training\".\"attendance\" drop column \"note\";");
  }

}
