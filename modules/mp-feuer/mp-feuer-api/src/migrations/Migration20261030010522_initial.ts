import { Migration } from '@mikro-orm/migrations';

export class Migration20261030010522_initial extends Migration {

  override name = 'Migration20261030010522_initial';

  override up(): void {
    this.addSql("create schema if not exists \"mp_feuer\";");
    this.addSql("create table \"mp_feuer\".\"mapping\" (\"id\" uuid not null, \"kind\" varchar(255) not null, \"value\" varchar(255) not null, \"normalized\" varchar(255) not null, \"key\" varchar(255) not null, \"profile\" varchar(255) not null, \"created_by\" varchar(255) null, \"created_at\" timestamptz not null, \"last_used_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("alter table \"mp_feuer\".\"mapping\" add constraint \"mapping_kind_normalized_unique\" unique (\"kind\", \"normalized\");");
    this.addSql("create table \"mp_feuer\".\"run\" (\"id\" uuid not null, \"user_id\" varchar(255) not null, \"created_by\" varchar(255) not null, \"status\" varchar(255) not null, \"phase\" varchar(255) null, \"files\" jsonb not null, \"archives\" jsonb not null, \"mappings\" jsonb not null, \"unmatched\" jsonb not null, \"progress\" jsonb null, \"error\" varchar(255) null, \"cancel_requested\" boolean not null default false, \"lock\" varchar(255) null, \"checked_signature\" text null, \"remembered_count\" int not null default 0, \"messages_removed_at\" timestamptz null, \"created_at\" timestamptz not null, \"started_at\" timestamptz null, \"finished_at\" timestamptz null, \"checked_at\" timestamptz null, primary key (\"id\"));");
    this.addSql("alter table \"mp_feuer\".\"run\" add constraint \"run_lock_unique\" unique (\"lock\");");
    this.addSql("create table \"mp_feuer\".\"run_dataset\" (\"id\" uuid not null, \"run_id\" uuid not null, \"profile\" varchar(255) not null, \"position\" int not null, \"row_count\" int not null, \"rows\" jsonb null, \"enabled\" boolean not null, \"options\" jsonb not null, \"from\" varchar(255) null, \"locked\" boolean not null, \"counts\" jsonb null, \"results\" jsonb not null, \"unmatched\" int not null default 0, \"parts\" int not null default 0, \"parts_done\" int not null default 0, \"duration_ms\" int null, primary key (\"id\"));");
    this.addSql("alter table \"mp_feuer\".\"run_dataset\" add constraint \"run_dataset_run_id_foreign\" foreign key (\"run_id\") references \"mp_feuer\".\"run\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("alter table \"mp_feuer\".\"run_dataset\" drop constraint \"run_dataset_run_id_foreign\";");
    this.addSql("drop table if exists \"mp_feuer\".\"mapping\" cascade;");
    this.addSql("drop table if exists \"mp_feuer\".\"run\" cascade;");
    this.addSql("drop table if exists \"mp_feuer\".\"run_dataset\" cascade;");
  }

}
