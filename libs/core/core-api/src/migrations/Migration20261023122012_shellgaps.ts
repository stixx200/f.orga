import { Migration } from '@mikro-orm/migrations';

export class Migration20261023122012_shellgaps extends Migration {

  override name = 'Migration20261023122012_shellgaps';

  override up(): void {
    this.addSql("create table \"core\".\"brigade_asset\" (\"key\" varchar(255) not null, \"content_type\" varchar(255) not null, \"data\" bytea not null, \"updated_at\" timestamptz not null, primary key (\"key\"));");
    this.addSql("create table \"core\".\"password_reset\" (\"id\" uuid not null, \"user_id\" uuid not null, \"hash\" varchar(255) not null, \"created_at\" timestamptz not null, \"expires_at\" timestamptz not null, \"used_at\" timestamptz null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"password_reset\" add constraint \"password_reset_hash_unique\" unique (\"hash\");");
    this.addSql("alter table \"core\".\"password_reset\" add constraint \"password_reset_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("drop table if exists \"core\".\"brigade_asset\" cascade;");
    this.addSql("drop table if exists \"core\".\"password_reset\" cascade;");
  }

}
