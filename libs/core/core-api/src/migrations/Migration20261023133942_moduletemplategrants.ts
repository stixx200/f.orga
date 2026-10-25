import { Migration } from '@mikro-orm/migrations';

export class Migration20261023133942_moduletemplategrants extends Migration {

  override name = 'Migration20261023133942_moduletemplategrants';

  override up(): void {
    this.addSql("alter table \"core\".\"module\" add \"granted_templates\" jsonb null;");
  }

  override down(): void {
    this.addSql("alter table \"core\".\"module\" drop column \"granted_templates\";");
  }

}
