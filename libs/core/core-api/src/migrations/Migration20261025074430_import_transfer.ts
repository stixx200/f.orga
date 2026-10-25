import { Migration } from '@mikro-orm/migrations';

export class Migration20261025074430_import_transfer extends Migration {

  override name = 'Migration20261025074430_import_transfer';

  override up(): void {
    this.addSql("create table \"core\".\"import_transfer\" (\"id\" uuid not null, \"user_id\" varchar(255) not null, \"archives\" jsonb not null, \"datasets\" jsonb not null, \"created_at\" timestamptz not null, primary key (\"id\"));");
  }

  override down(): void {
    this.addSql("drop table if exists \"core\".\"import_transfer\" cascade;");
  }

}
