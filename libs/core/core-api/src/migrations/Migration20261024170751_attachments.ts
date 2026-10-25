import { Migration } from '@mikro-orm/migrations';

export class Migration20261024170751_attachments extends Migration {

  override name = 'Migration20261024170751_attachments';

  override up(): void {
    this.addSql("create table \"core\".\"attachment\" (\"id\" uuid not null, \"owner_type\" varchar(255) not null, \"owner_id\" varchar(255) not null, \"file_name\" varchar(255) not null, \"content_type\" varchar(255) not null, \"size\" int not null, \"data\" bytea not null, \"created_by\" varchar(255) not null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"attachment_owner_type_owner_id_index\" on \"core\".\"attachment\" (\"owner_type\", \"owner_id\");");
  }

  override down(): void {
    this.addSql("drop table if exists \"core\".\"attachment\" cascade;");
  }

}
