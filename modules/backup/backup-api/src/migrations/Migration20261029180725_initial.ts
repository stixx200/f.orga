import { Migration } from '@mikro-orm/migrations';

export class Migration20261029180725_initial extends Migration {

  override name = 'Migration20261029180725_initial';

  override up(): void {
    this.addSql("create schema if not exists \"backup\";");
    this.addSql("create table \"backup\".\"restore\" (\"id\" uuid not null, \"run_id\" varchar(255) null, \"file_name\" varchar(255) not null, \"backup_created_at\" timestamptz null, \"safety_file_name\" varchar(255) null, \"user_id\" varchar(255) null, \"user_name\" varchar(255) null, \"started_at\" timestamptz not null, \"finished_at\" timestamptz null, \"method\" varchar(255) not null, \"phase\" varchar(255) not null, \"steps\" jsonb not null, \"error_code\" varchar(255) null, \"error_detail\" text null, \"previous_database\" varchar(255) null, \"real_data_reason\" text null, \"real_data_until\" timestamptz null, primary key (\"id\"));");
    this.addSql("create table \"backup\".\"run\" (\"id\" uuid not null, \"file_name\" varchar(255) null, \"target_path\" varchar(255) null, \"trigger\" varchar(255) not null, \"user_id\" varchar(255) null, \"user_name\" varchar(255) null, \"started_at\" timestamptz not null, \"finished_at\" timestamptz null, \"size\" bigint null, \"status\" varchar(255) not null, \"error_code\" varchar(255) null, \"error_detail\" text null, \"encrypted\" boolean null, \"passphrase_id\" varchar(255) null, \"instance\" varchar(255) null, \"app_version\" varchar(255) null, \"manifest\" jsonb null, \"verification\" jsonb null, \"keep_until\" timestamptz null, \"deleted_at\" timestamptz null, primary key (\"id\"));");
    this.addSql("create index \"run_file_name_index\" on \"backup\".\"run\" (\"file_name\");");
    this.addSql("create index \"run_started_at_index\" on \"backup\".\"run\" (\"started_at\");");
  }

  override down(): void {
    this.addSql("drop table if exists \"backup\".\"restore\" cascade;");
    this.addSql("drop table if exists \"backup\".\"run\" cascade;");
  }

}
