import { Migration } from '@mikro-orm/migrations';

export class Migration20261023081647_history_parent extends Migration {

  override name = 'Migration20261023081647_history_parent';

  override up(): void {
    this.addSql("alter table \"core\".\"history\" add \"parent_entity\" varchar(255) null, add \"parent_id\" varchar(255) null;");
    this.addSql("create index \"history_parent_entity_parent_id_index\" on \"core\".\"history\" (\"parent_entity\", \"parent_id\");");
  }

  override down(): void {
    this.addSql("drop index \"core\".\"history_parent_entity_parent_id_index\";");
    this.addSql("alter table \"core\".\"history\" drop column \"parent_entity\", drop column \"parent_id\";");
  }

}
