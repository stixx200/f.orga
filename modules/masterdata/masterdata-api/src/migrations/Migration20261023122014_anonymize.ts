import { Migration } from '@mikro-orm/migrations';

export class Migration20261023122014_anonymize extends Migration {

  override name = 'Migration20261023122014_anonymize';

  override up(): void {
    this.addSql("alter table \"masterdata\".\"person\" add \"anonymized_at\" timestamptz null;");
  }

  override down(): void {
    this.addSql("alter table \"masterdata\".\"person\" drop column \"anonymized_at\";");
  }

}
