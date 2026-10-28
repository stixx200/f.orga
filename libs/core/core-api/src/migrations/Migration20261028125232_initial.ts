import { Migration } from '@mikro-orm/migrations';

export class Migration20261028125232_initial extends Migration {

  override name = 'Migration20261028125232_initial';

  override up(): void {
    this.addSql("create schema if not exists \"core\";");
    this.addSql("create table \"core\".\"attachment\" (\"id\" uuid not null, \"owner_type\" varchar(255) not null, \"owner_id\" varchar(255) not null, \"file_name\" varchar(255) not null, \"content_type\" varchar(255) not null, \"size\" int not null, \"data\" bytea not null, \"created_by\" varchar(255) not null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"attachment_owner_type_owner_id_index\" on \"core\".\"attachment\" (\"owner_type\", \"owner_id\");");
    this.addSql("create table \"core\".\"audit\" (\"id\" uuid not null, \"timestamp\" timestamptz not null, \"user_id\" varchar(255) null, \"impersonator_id\" varchar(255) null, \"action\" varchar(255) not null, \"details\" jsonb not null, primary key (\"id\"));");
    this.addSql("create index \"audit_timestamp_index\" on \"core\".\"audit\" (\"timestamp\");");
    this.addSql("create table \"core\".\"brigade_asset\" (\"key\" varchar(255) not null, \"content_type\" varchar(255) not null, \"data\" bytea not null, \"updated_at\" timestamptz not null, primary key (\"key\"));");
    this.addSql("create table \"core\".\"history\" (\"id\" uuid not null, \"entity\" varchar(255) not null, \"entity_id\" varchar(255) not null, \"parent_entity\" varchar(255) null, \"parent_id\" varchar(255) null, \"action\" varchar(255) not null, \"changes\" jsonb not null, \"user_id\" varchar(255) null, \"impersonator_id\" varchar(255) null, \"timestamp\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"history_entity_entity_id_index\" on \"core\".\"history\" (\"entity\", \"entity_id\");");
    this.addSql("create index \"history_parent_entity_parent_id_index\" on \"core\".\"history\" (\"parent_entity\", \"parent_id\");");
    this.addSql("create table \"core\".\"import_transfer\" (\"id\" uuid not null, \"user_id\" varchar(255) not null, \"archives\" jsonb not null, \"datasets\" jsonb not null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create table \"core\".\"import_upload\" (\"id\" uuid not null, \"user_id\" varchar(255) not null, \"file_name\" varchar(255) not null, \"headers\" jsonb not null, \"rows\" jsonb not null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create table \"core\".\"module\" (\"id\" varchar(255) not null, \"active\" boolean not null default true, \"granted_templates\" jsonb null, \"updated_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create table \"core\".\"role\" (\"id\" uuid not null, \"name\" jsonb not null, \"template_key\" varchar(255) null, \"description\" jsonb not null default '{\"de\":\"\",\"en\":\"\"}', \"permissions\" jsonb not null, \"permissions_all_departments\" jsonb not null default '[]', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"role\" add constraint \"role_template_key_unique\" unique (\"template_key\");");
    this.addSql("create table \"core\".\"setting\" (\"section\" varchar(255) not null, \"value\" jsonb not null, \"version\" int not null default 1, primary key (\"section\"));");
    this.addSql("create table \"core\".\"user\" (\"id\" uuid not null, \"username\" varchar(255) not null, \"display_name\" varchar(255) not null, \"email\" varchar(255) null, \"password_hash\" varchar(255) null, \"person_id\" varchar(255) null, \"language\" varchar(255) not null default 'de', \"receive_digest\" boolean not null default true, \"hidden_tasks\" jsonb not null default '[]', \"active\" boolean not null default true, \"technical\" boolean not null default false, \"last_login\" timestamptz null, \"oidc_subject\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"user\" add constraint \"user_username_unique\" unique (\"username\");");
    this.addSql("alter table \"core\".\"user\" add constraint \"user_person_id_unique\" unique (\"person_id\");");
    this.addSql("alter table \"core\".\"user\" add constraint \"user_oidc_subject_unique\" unique (\"oidc_subject\");");
    this.addSql("create table \"core\".\"session\" (\"id\" varchar(255) not null, \"user_id\" uuid not null, \"created_at\" timestamptz not null, \"expires_at\" timestamptz not null, \"impersonator_id\" uuid null, \"impersonation_reason\" text null, primary key (\"id\"));");
    this.addSql("create index \"session_expires_at_index\" on \"core\".\"session\" (\"expires_at\");");
    this.addSql("create table \"core\".\"role_assignment\" (\"id\" uuid not null, \"user_id\" uuid not null, \"role_id\" uuid not null, \"department_id\" varchar(255) null, primary key (\"id\"));");
    this.addSql("create table \"core\".\"password_reset\" (\"id\" uuid not null, \"user_id\" uuid not null, \"purpose\" varchar(255) not null default 'reset', \"email\" varchar(255) null, \"hash\" varchar(255) not null, \"created_at\" timestamptz not null, \"expires_at\" timestamptz not null, \"used_at\" timestamptz null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"password_reset\" add constraint \"password_reset_hash_unique\" unique (\"hash\");");
    this.addSql("create table \"core\".\"api_token\" (\"id\" uuid not null, \"name\" varchar(255) not null, \"user_id\" uuid not null, \"scopes\" jsonb not null, \"prefix\" varchar(255) not null, \"hash\" varchar(255) not null, \"created_at\" timestamptz not null, \"expires_at\" timestamptz null, \"last_used_at\" timestamptz null, \"revoked_at\" timestamptz null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"api_token\" add constraint \"api_token_hash_unique\" unique (\"hash\");");
    this.addSql("alter table \"core\".\"session\" add constraint \"session_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"session\" add constraint \"session_impersonator_id_foreign\" foreign key (\"impersonator_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"role_assignment\" add constraint \"role_assignment_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"role_assignment\" add constraint \"role_assignment_role_id_foreign\" foreign key (\"role_id\") references \"core\".\"role\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"password_reset\" add constraint \"password_reset_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"api_token\" add constraint \"api_token_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("alter table \"core\".\"role_assignment\" drop constraint \"role_assignment_role_id_foreign\";");
    this.addSql("alter table \"core\".\"session\" drop constraint \"session_user_id_foreign\";");
    this.addSql("alter table \"core\".\"session\" drop constraint \"session_impersonator_id_foreign\";");
    this.addSql("alter table \"core\".\"role_assignment\" drop constraint \"role_assignment_user_id_foreign\";");
    this.addSql("alter table \"core\".\"password_reset\" drop constraint \"password_reset_user_id_foreign\";");
    this.addSql("alter table \"core\".\"api_token\" drop constraint \"api_token_user_id_foreign\";");
    this.addSql("drop table if exists \"core\".\"attachment\" cascade;");
    this.addSql("drop table if exists \"core\".\"audit\" cascade;");
    this.addSql("drop table if exists \"core\".\"brigade_asset\" cascade;");
    this.addSql("drop table if exists \"core\".\"history\" cascade;");
    this.addSql("drop table if exists \"core\".\"import_transfer\" cascade;");
    this.addSql("drop table if exists \"core\".\"import_upload\" cascade;");
    this.addSql("drop table if exists \"core\".\"module\" cascade;");
    this.addSql("drop table if exists \"core\".\"role\" cascade;");
    this.addSql("drop table if exists \"core\".\"setting\" cascade;");
    this.addSql("drop table if exists \"core\".\"user\" cascade;");
    this.addSql("drop table if exists \"core\".\"session\" cascade;");
    this.addSql("drop table if exists \"core\".\"role_assignment\" cascade;");
    this.addSql("drop table if exists \"core\".\"password_reset\" cascade;");
    this.addSql("drop table if exists \"core\".\"api_token\" cascade;");
  }

}
