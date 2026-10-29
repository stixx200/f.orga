import { Migration } from '@mikro-orm/migrations';

export class Migration20261029180702_initial extends Migration {

  override name = 'Migration20261029180702_initial';

  override up(): void {
    this.addSql("create schema if not exists \"core\";");
    this.addSql("create table \"core\".\"access_log\" (\"id\" uuid not null, \"user_id\" varchar(255) not null, \"person_id\" varchar(255) null, \"person_key\" varchar(255) not null, \"area\" varchar(255) not null, \"day\" varchar(10) not null, \"count\" int not null default 1, \"first_at\" timestamptz not null, \"last_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"access_log_person_id_index\" on \"core\".\"access_log\" (\"person_id\");");
    this.addSql("create index \"access_log_day_index\" on \"core\".\"access_log\" (\"day\");");
    this.addSql("alter table \"core\".\"access_log\" add constraint \"access_log_user_id_person_key_area_day_unique\" unique (\"user_id\", \"person_key\", \"area\", \"day\");");
    this.addSql("create table \"core\".\"attachment\" (\"id\" uuid not null, \"owner_type\" varchar(255) not null, \"owner_id\" varchar(255) not null, \"file_name\" varchar(255) not null, \"content_type\" varchar(255) not null, \"size\" int not null, \"data\" bytea not null, \"created_by\" varchar(255) not null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"attachment_owner_type_owner_id_index\" on \"core\".\"attachment\" (\"owner_type\", \"owner_id\");");
    this.addSql("create table \"core\".\"audit\" (\"id\" uuid not null, \"timestamp\" timestamptz not null, \"user_id\" varchar(255) null, \"impersonator_id\" varchar(255) null, \"action\" varchar(255) not null, \"details\" jsonb not null, primary key (\"id\"));");
    this.addSql("create index \"audit_timestamp_index\" on \"core\".\"audit\" (\"timestamp\");");
    this.addSql("create table \"core\".\"brigade_asset\" (\"key\" varchar(255) not null, \"content_type\" varchar(255) not null, \"data\" bytea not null, \"updated_at\" timestamptz not null, primary key (\"key\"));");
    this.addSql("create table \"core\".\"consent\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"key\" varchar(255) not null, \"definition_version\" int not null, \"title\" jsonb not null, \"text\" jsonb not null, \"given_on\" varchar(10) not null, \"given_via\" varchar(255) not null, \"recorded_by\" varchar(255) null, \"withdrawn_on\" varchar(10) null, \"withdrawn_via\" varchar(255) null, \"withdrawn_by\" varchar(255) null, \"request_id\" varchar(255) null, \"superseded_on\" varchar(10) null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"consent_person_id_index\" on \"core\".\"consent\" (\"person_id\");");
    this.addSql("create index \"consent_key_index\" on \"core\".\"consent\" (\"key\");");
    this.addSql("create table \"core\".\"history\" (\"id\" uuid not null, \"entity\" varchar(255) not null, \"entity_id\" varchar(255) not null, \"parent_entity\" varchar(255) null, \"parent_id\" varchar(255) null, \"action\" varchar(255) not null, \"changes\" jsonb not null, \"user_id\" varchar(255) null, \"impersonator_id\" varchar(255) null, \"timestamp\" timestamptz not null, \"redactions\" jsonb null, primary key (\"id\"));");
    this.addSql("create index \"history_entity_entity_id_index\" on \"core\".\"history\" (\"entity\", \"entity_id\");");
    this.addSql("create index \"history_parent_entity_parent_id_index\" on \"core\".\"history\" (\"parent_entity\", \"parent_id\");");
    this.addSql("create table \"core\".\"import_mapping\" (\"id\" uuid not null, \"kind\" varchar(255) not null, \"value\" varchar(255) not null, \"normalized\" varchar(255) not null, \"key\" varchar(255) not null, \"profile\" varchar(255) not null, \"created_by\" varchar(255) null, \"created_at\" timestamptz not null, \"last_used_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"import_mapping\" add constraint \"import_mapping_kind_normalized_unique\" unique (\"kind\", \"normalized\");");
    this.addSql("create table \"core\".\"import_upload\" (\"id\" uuid not null, \"user_id\" varchar(255) not null, \"file_name\" varchar(255) not null, \"headers\" jsonb not null, \"rows\" jsonb not null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create table \"core\".\"import_url\" (\"user_id\" varchar(255) not null, \"url\" text not null, \"display\" varchar(255) not null, \"saved_at\" timestamptz not null, primary key (\"user_id\"));");
    this.addSql("create table \"core\".\"module\" (\"id\" varchar(255) not null, \"active\" boolean not null default true, \"granted_templates\" jsonb null, \"updated_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create table \"core\".\"privacy_breach\" (\"id\" uuid not null, \"title\" varchar(200) not null, \"discovered_at\" timestamptz not null, \"occurred_from\" varchar(10) null, \"occurred_until\" varchar(10) null, \"description\" text not null default '', \"activity_keys\" jsonb not null default '[]', \"data_categories\" text not null default '', \"health\" boolean not null default false, \"affected_count\" int null, \"affected_person_ids\" jsonb not null default '[]', \"affected_source\" text not null default '', \"consequences\" text not null default '', \"measures\" text not null default '', \"risk\" varchar(255) null, \"authority_notified_on\" varchar(10) null, \"authority_reference\" varchar(200) not null default '', \"authority_not_required\" boolean not null default false, \"authority_note\" text not null default '', \"subjects_notified_on\" varchar(10) null, \"subjects_notified_via\" varchar(255) null, \"subjects_note\" text not null default '', \"status\" varchar(255) not null default 'open', \"closed_on\" varchar(10) null, \"created_at\" timestamptz not null, \"created_by\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"privacy_breach_status_index\" on \"core\".\"privacy_breach\" (\"status\");");
    this.addSql("create table \"core\".\"privacy_document\" (\"id\" uuid not null, \"kind\" varchar(255) not null default 'access-report', \"person_id\" varchar(255) not null, \"language\" varchar(255) not null, \"include_json\" boolean not null default false, \"status\" varchar(255) not null default 'pending', \"error\" varchar(255) null, \"content\" bytea null, \"size\" int null, \"created_at\" timestamptz not null, \"created_by\" varchar(255) null, \"expires_at\" timestamptz not null, \"deleted_at\" timestamptz null, \"handed_over_on\" varchar(255) null, \"channel\" varchar(255) null, \"handed_over_by\" varchar(255) null, \"downloaded_by_person_at\" timestamptz null, \"request_id\" varchar(255) null, primary key (\"id\"));");
    this.addSql("create index \"privacy_document_person_id_index\" on \"core\".\"privacy_document\" (\"person_id\");");
    this.addSql("create index \"privacy_document_expires_at_index\" on \"core\".\"privacy_document\" (\"expires_at\");");
    this.addSql("create table \"core\".\"privacy_notice\" (\"version\" serial primary key, \"published_at\" timestamptz not null, \"sections\" jsonb not null, \"template\" boolean not null);");
    this.addSql("create table \"core\".\"privacy_request\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"kind\" varchar(255) not null, \"received_on\" varchar(10) not null, \"channel\" varchar(255) not null, \"identity_checked\" boolean not null default false, \"identity_note\" text not null default '', \"content\" text not null default '', \"language\" varchar(255) not null default 'de', \"activity_key\" varchar(255) null, \"activity\" text not null default '', \"due_on\" varchar(10) not null, \"extended_until\" varchar(10) null, \"extension_reason\" text not null default '', \"extension_notified_on\" varchar(10) null, \"status\" varchar(255) not null default 'received', \"closed_on\" varchar(10) null, \"rejection_reason\" text not null default '', \"assignee_id\" varchar(255) null, \"notes\" text not null default '', \"recipients\" jsonb not null default '[]', \"access_report_document_id\" varchar(255) null, \"rectification\" jsonb null, \"erasure\" jsonb null, \"created_at\" timestamptz not null, \"created_by\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"privacy_request_person_id_index\" on \"core\".\"privacy_request\" (\"person_id\");");
    this.addSql("create index \"privacy_request_status_index\" on \"core\".\"privacy_request\" (\"status\");");
    this.addSql("create table \"core\".\"rate_limit\" (\"id\" varchar(255) not null, \"scope\" varchar(255) not null, \"count\" int not null, \"window_start\" timestamptz not null, \"blocked_until\" timestamptz null, \"updated_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"rate_limit_scope_index\" on \"core\".\"rate_limit\" (\"scope\");");
    this.addSql("create index \"rate_limit_updated_at_index\" on \"core\".\"rate_limit\" (\"updated_at\");");
    this.addSql("create table \"core\".\"retention_case\" (\"id\" uuid not null, \"category\" varchar(255) not null, \"rule_key\" varchar(255) not null, \"record_id\" varchar(255) not null, \"label\" text not null, \"neutral_label\" text not null, \"reason\" jsonb null, \"event_date\" varchar(10) not null, \"due_since\" varchar(10) not null, \"attachments\" int not null default 0, \"status\" varchar(255) not null default 'due', \"action\" varchar(255) not null, \"after_decision\" varchar(255) null, \"special_case\" boolean not null default false, \"blocked_by\" varchar(255) null, \"offer_id\" varchar(255) null, \"offered_at\" timestamptz null, \"archive\" varchar(255) null, \"offer_note\" text null, \"decided_on\" varchar(10) null, \"decision_note\" text null, \"deferred_until\" varchar(10) null, \"defer_reason\" text null, \"executed_at\" timestamptz null, \"executed_action\" varchar(255) null, \"created_at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"retention_case_category_record_id_index\" on \"core\".\"retention_case\" (\"category\", \"record_id\");");
    this.addSql("create index \"retention_case_status_index\" on \"core\".\"retention_case\" (\"status\");");
    this.addSql("create index \"retention_case_offer_id_index\" on \"core\".\"retention_case\" (\"offer_id\");");
    this.addSql("create table \"core\".\"role\" (\"id\" uuid not null, \"name\" jsonb not null, \"template_key\" varchar(255) null, \"description\" jsonb not null default '{\"de\":\"\",\"en\":\"\"}', \"permissions\" jsonb not null, \"permissions_all_departments\" jsonb not null default '[]', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"role\" add constraint \"role_template_key_unique\" unique (\"template_key\");");
    this.addSql("create table \"core\".\"setting\" (\"section\" varchar(255) not null, \"value\" jsonb not null, \"version\" int not null default 1, primary key (\"section\"));");
    this.addSql("create table \"core\".\"user\" (\"id\" uuid not null, \"username\" varchar(255) not null, \"display_name\" varchar(255) not null, \"email\" varchar(255) null, \"password_hash\" varchar(255) null, \"person_id\" varchar(255) null, \"language\" varchar(255) not null default 'de', \"receive_digest\" boolean not null default true, \"hidden_tasks\" jsonb not null default '[]', \"active\" boolean not null default true, \"locked_at\" timestamptz null, \"technical\" boolean not null default false, \"last_login\" timestamptz null, \"oidc_subject\" varchar(255) null, \"privacy_notice_version\" int null, \"privacy_notice_acknowledged_at\" timestamptz null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"user\" add constraint \"user_username_unique\" unique (\"username\");");
    this.addSql("alter table \"core\".\"user\" add constraint \"user_person_id_unique\" unique (\"person_id\");");
    this.addSql("alter table \"core\".\"user\" add constraint \"user_oidc_subject_unique\" unique (\"oidc_subject\");");
    this.addSql("create table \"core\".\"session\" (\"id\" varchar(255) not null, \"ref\" uuid not null, \"user_id\" uuid not null, \"created_at\" timestamptz not null, \"expires_at\" timestamptz not null, \"last_activity_at\" timestamptz not null, \"persistent\" boolean not null default false, \"user_agent\" varchar(255) null, \"address\" varchar(255) null, \"impersonator_id\" uuid null, \"impersonation_reason\" text null, \"elevated_until\" timestamptz null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"session\" add constraint \"session_ref_unique\" unique (\"ref\");");
    this.addSql("create index \"session_expires_at_index\" on \"core\".\"session\" (\"expires_at\");");
    this.addSql("create table \"core\".\"role_assignment\" (\"id\" uuid not null, \"user_id\" uuid not null, \"role_id\" uuid not null, \"department_id\" varchar(255) null, primary key (\"id\"));");
    this.addSql("create table \"core\".\"password_reset\" (\"id\" uuid not null, \"user_id\" uuid not null, \"purpose\" varchar(255) not null default 'reset', \"email\" varchar(255) null, \"hash\" varchar(255) not null, \"created_at\" timestamptz not null, \"expires_at\" timestamptz not null, \"used_at\" timestamptz null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"password_reset\" add constraint \"password_reset_hash_unique\" unique (\"hash\");");
    this.addSql("create table \"core\".\"api_token\" (\"id\" uuid not null, \"name\" varchar(255) not null, \"recipient\" varchar(255) not null default '', \"purpose\" text not null default '', \"allowed_addresses\" jsonb not null default '[]', \"user_id\" uuid not null, \"scopes\" jsonb not null, \"prefix\" varchar(255) not null, \"hash\" varchar(255) not null, \"created_at\" timestamptz not null, \"expires_at\" timestamptz null, \"last_used_at\" timestamptz null, \"revoked_at\" timestamptz null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"api_token\" add constraint \"api_token_hash_unique\" unique (\"hash\");");
    this.addSql("create table \"core\".\"user_mfa\" (\"id\" uuid not null, \"user_id\" uuid not null, \"secret\" text not null, \"confirmed_at\" timestamptz null, \"last_step\" int null, \"recovery_codes\" jsonb not null default '[]', \"failures\" int not null default 0, \"failure_window_start\" timestamptz null, \"locked_until\" timestamptz null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"user_mfa\" add constraint \"user_mfa_user_id_unique\" unique (\"user_id\");");
    this.addSql("alter table \"core\".\"session\" add constraint \"session_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"session\" add constraint \"session_impersonator_id_foreign\" foreign key (\"impersonator_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"role_assignment\" add constraint \"role_assignment_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"role_assignment\" add constraint \"role_assignment_role_id_foreign\" foreign key (\"role_id\") references \"core\".\"role\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"password_reset\" add constraint \"password_reset_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"api_token\" add constraint \"api_token_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
    this.addSql("alter table \"core\".\"user_mfa\" add constraint \"user_mfa_user_id_foreign\" foreign key (\"user_id\") references \"core\".\"user\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("alter table \"core\".\"role_assignment\" drop constraint \"role_assignment_role_id_foreign\";");
    this.addSql("alter table \"core\".\"session\" drop constraint \"session_user_id_foreign\";");
    this.addSql("alter table \"core\".\"session\" drop constraint \"session_impersonator_id_foreign\";");
    this.addSql("alter table \"core\".\"role_assignment\" drop constraint \"role_assignment_user_id_foreign\";");
    this.addSql("alter table \"core\".\"password_reset\" drop constraint \"password_reset_user_id_foreign\";");
    this.addSql("alter table \"core\".\"api_token\" drop constraint \"api_token_user_id_foreign\";");
    this.addSql("alter table \"core\".\"user_mfa\" drop constraint \"user_mfa_user_id_foreign\";");
    this.addSql("drop table if exists \"core\".\"access_log\" cascade;");
    this.addSql("drop table if exists \"core\".\"attachment\" cascade;");
    this.addSql("drop table if exists \"core\".\"audit\" cascade;");
    this.addSql("drop table if exists \"core\".\"brigade_asset\" cascade;");
    this.addSql("drop table if exists \"core\".\"consent\" cascade;");
    this.addSql("drop table if exists \"core\".\"history\" cascade;");
    this.addSql("drop table if exists \"core\".\"import_mapping\" cascade;");
    this.addSql("drop table if exists \"core\".\"import_upload\" cascade;");
    this.addSql("drop table if exists \"core\".\"import_url\" cascade;");
    this.addSql("drop table if exists \"core\".\"module\" cascade;");
    this.addSql("drop table if exists \"core\".\"privacy_breach\" cascade;");
    this.addSql("drop table if exists \"core\".\"privacy_document\" cascade;");
    this.addSql("drop table if exists \"core\".\"privacy_notice\" cascade;");
    this.addSql("drop table if exists \"core\".\"privacy_request\" cascade;");
    this.addSql("drop table if exists \"core\".\"rate_limit\" cascade;");
    this.addSql("drop table if exists \"core\".\"retention_case\" cascade;");
    this.addSql("drop table if exists \"core\".\"role\" cascade;");
    this.addSql("drop table if exists \"core\".\"setting\" cascade;");
    this.addSql("drop table if exists \"core\".\"user\" cascade;");
    this.addSql("drop table if exists \"core\".\"session\" cascade;");
    this.addSql("drop table if exists \"core\".\"role_assignment\" cascade;");
    this.addSql("drop table if exists \"core\".\"password_reset\" cascade;");
    this.addSql("drop table if exists \"core\".\"api_token\" cascade;");
    this.addSql("drop table if exists \"core\".\"user_mfa\" cascade;");
  }

}
