import { Migration } from '@mikro-orm/migrations';

export class Migration20261023120410_impersonation extends Migration {

  override name = 'Migration20261023120410_impersonation';

  override up(): void {
    this.addSql("alter table \"core\".\"audit\" add \"impersonator_id\" varchar(255) null;");
    this.addSql("alter table \"core\".\"history\" add \"impersonator_id\" varchar(255) null;");
    this.addSql("alter table \"core\".\"session\" add \"impersonator_id\" uuid null, add \"impersonation_reason\" text null;");
    this.addSql("alter table \"core\".\"session\" add constraint \"session_impersonator_id_foreign\" foreign key (\"impersonator_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("alter table \"core\".\"session\" drop constraint \"session_impersonator_id_foreign\";");
    this.addSql("alter table \"core\".\"audit\" drop column \"impersonator_id\";");
    this.addSql("alter table \"core\".\"history\" drop column \"impersonator_id\";");
    this.addSql("alter table \"core\".\"session\" drop column \"impersonator_id\", drop column \"impersonation_reason\";");
  }

}
