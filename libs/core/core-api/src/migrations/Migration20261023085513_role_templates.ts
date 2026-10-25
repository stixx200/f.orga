import { Migration } from '@mikro-orm/migrations';

export class Migration20261023085513_role_templates extends Migration {

  override name = 'Migration20261023085513_role_templates';

  override up(): void {
    this.addSql("alter table \"core\".\"role\" add \"template_key\" varchar(255) null;");
    this.addSql("alter table \"core\".\"role\" add constraint \"role_template_key_unique\" unique (\"template_key\");");
  }

  override down(): void {
    this.addSql("alter table \"core\".\"role\" drop constraint \"role_template_key_unique\";");
    this.addSql("alter table \"core\".\"role\" drop column \"template_key\";");
  }

}
