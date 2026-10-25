import { Migration } from '@mikro-orm/migrations';

export class Migration20261023085535_externally_managed extends Migration {

  override name = 'Migration20261023085535_externally_managed';

  override up(): void {
    this.addSql("alter table \"incidents\".\"report\" add \"externally_managed\" boolean not null default false;");
  }

  override down(): void {
    this.addSql("alter table \"incidents\".\"report\" drop column \"externally_managed\";");
  }

}
