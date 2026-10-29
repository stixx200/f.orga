import { Migration } from '@mikro-orm/migrations';

export class Migration20261029144250_initial extends Migration {

  override name = 'Migration20261029144250_initial';

  override up(): void {
    this.addSql("create schema if not exists \"info_terminal\";");
    this.addSql("create table \"info_terminal\".\"terminal\" (\"id\" uuid not null, \"station_id\" varchar(255) not null, \"name\" varchar(255) not null, \"department_ids\" text[] not null, \"allow_new_incident\" boolean not null default true, \"allow_training\" boolean not null default true, \"language\" varchar(255) not null default 'de', \"key_hash\" varchar(255) not null, \"key_prefix\" varchar(255) not null, \"key_encrypted\" text null, \"user_id\" varchar(255) not null, \"created_at\" timestamptz not null, \"created_by\" varchar(255) not null, \"revoked_at\" timestamptz null, \"revoked_by\" varchar(255) null, \"last_seen_at\" timestamptz null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"terminal_station_id_index\" on \"info_terminal\".\"terminal\" (\"station_id\");");
    this.addSql("alter table \"info_terminal\".\"terminal\" add constraint \"terminal_key_hash_unique\" unique (\"key_hash\");");
  }

  override down(): void {
    this.addSql("drop table if exists \"info_terminal\".\"terminal\" cascade;");
  }

}
