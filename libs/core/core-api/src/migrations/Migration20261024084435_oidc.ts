import { Migration } from '@mikro-orm/migrations';

export class Migration20261024084435_oidc extends Migration {

  override name = 'Migration20261024084435_oidc';

  override up(): void {
    this.addSql("alter table \"core\".\"user\" add \"oidc_subject\" varchar(255) null;");
    this.addSql("alter table \"core\".\"user\" add constraint \"user_oidc_subject_unique\" unique (\"oidc_subject\");");
  }

  override down(): void {
    this.addSql("alter table \"core\".\"user\" drop constraint \"user_oidc_subject_unique\";");
    this.addSql("alter table \"core\".\"user\" drop column \"oidc_subject\";");
  }

}
