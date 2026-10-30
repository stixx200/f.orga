import { Migration } from '@mikro-orm/migrations';

export class Migration20261030010528_initial extends Migration {

  override name = 'Migration20261030010528_initial';

  override up(): void {
    this.addSql("create schema if not exists \"privacy\";");
    this.addSql("create table \"privacy\".\"access_log\" (\"id\" uuid not null, \"user_id\" varchar(255) not null, \"person_id\" varchar(255) null, \"person_key\" varchar(255) not null, \"area\" varchar(255) not null, \"day\" varchar(10) not null, \"count\" int not null default 1, \"first_at\" timestamptz not null, \"last_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"access_log_person_id_index\" on \"privacy\".\"access_log\" (\"person_id\");");
    this.addSql("create index \"access_log_day_index\" on \"privacy\".\"access_log\" (\"day\");");
    this.addSql("alter table \"privacy\".\"access_log\" add constraint \"access_log_user_id_person_key_area_day_unique\" unique (\"user_id\", \"person_key\", \"area\", \"day\");");
    this.addSql("create table \"privacy\".\"consent\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"key\" varchar(255) not null, \"definition_version\" int not null, \"title\" jsonb not null, \"text\" jsonb not null, \"given_on\" varchar(10) not null, \"given_via\" varchar(255) not null, \"recorded_by\" varchar(255) null, \"withdrawn_on\" varchar(10) null, \"withdrawn_via\" varchar(255) null, \"withdrawn_by\" varchar(255) null, \"request_id\" varchar(255) null, \"superseded_on\" varchar(10) null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"consent_person_id_index\" on \"privacy\".\"consent\" (\"person_id\");");
    this.addSql("create index \"consent_key_index\" on \"privacy\".\"consent\" (\"key\");");
    this.addSql("create table \"privacy\".\"notice_acknowledgement\" (\"user_id\" varchar(255) not null, \"version\" int not null, \"acknowledged_at\" timestamptz not null, primary key (\"user_id\"));");
    this.addSql("create table \"privacy\".\"breach\" (\"id\" uuid not null, \"title\" varchar(200) not null, \"discovered_at\" timestamptz not null, \"occurred_from\" varchar(10) null, \"occurred_until\" varchar(10) null, \"description\" text not null default '', \"activity_keys\" jsonb not null default '[]', \"data_categories\" text not null default '', \"health\" boolean not null default false, \"affected_count\" int null, \"affected_person_ids\" jsonb not null default '[]', \"affected_source\" text not null default '', \"consequences\" text not null default '', \"measures\" text not null default '', \"risk\" varchar(255) null, \"authority_notified_on\" varchar(10) null, \"authority_reference\" varchar(200) not null default '', \"authority_not_required\" boolean not null default false, \"authority_note\" text not null default '', \"subjects_notified_on\" varchar(10) null, \"subjects_notified_via\" varchar(255) null, \"subjects_note\" text not null default '', \"status\" varchar(255) not null default 'open', \"closed_on\" varchar(10) null, \"created_at\" timestamptz not null, \"created_by\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"breach_status_index\" on \"privacy\".\"breach\" (\"status\");");
    this.addSql("create table \"privacy\".\"document\" (\"id\" uuid not null, \"kind\" varchar(255) not null default 'access-report', \"person_id\" varchar(255) null, \"third_party\" jsonb null, \"language\" varchar(255) not null, \"include_json\" boolean not null default false, \"status\" varchar(255) not null default 'pending', \"error\" varchar(255) null, \"content\" bytea null, \"size\" int null, \"created_at\" timestamptz not null, \"created_by\" varchar(255) null, \"expires_at\" timestamptz not null, \"deleted_at\" timestamptz null, \"handed_over_on\" varchar(255) null, \"channel\" varchar(255) null, \"handed_over_by\" varchar(255) null, \"downloaded_by_person_at\" timestamptz null, \"request_id\" varchar(255) null, primary key (\"id\"));");
    this.addSql("create index \"document_person_id_index\" on \"privacy\".\"document\" (\"person_id\");");
    this.addSql("create index \"document_expires_at_index\" on \"privacy\".\"document\" (\"expires_at\");");
    this.addSql("create table \"privacy\".\"information\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"informed_on\" date not null, \"via\" varchar(255) not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"privacy\".\"information\" add constraint \"information_person_id_unique\" unique (\"person_id\");");
    this.addSql("create table \"privacy\".\"notice\" (\"version\" serial primary key, \"published_at\" timestamptz not null, \"sections\" jsonb not null, \"template\" boolean not null);");
    this.addSql("create table \"privacy\".\"request\" (\"id\" uuid not null, \"person_id\" varchar(255) null, \"third_party\" jsonb null, \"kind\" varchar(255) not null, \"received_on\" varchar(10) not null, \"channel\" varchar(255) not null, \"identity_checked\" boolean not null default false, \"identity_note\" text not null default '', \"content\" text not null default '', \"language\" varchar(255) not null default 'de', \"activity_key\" varchar(255) null, \"activity\" text not null default '', \"due_on\" varchar(10) not null, \"extended_until\" varchar(10) null, \"extension_reason\" text not null default '', \"extension_notified_on\" varchar(10) null, \"status\" varchar(255) not null default 'received', \"closed_on\" varchar(10) null, \"rejection_reason\" text not null default '', \"assignee_id\" varchar(255) null, \"notes\" text not null default '', \"recipients\" jsonb not null default '[]', \"access_report_document_id\" varchar(255) null, \"rectification\" jsonb null, \"erasure\" jsonb null, \"created_at\" timestamptz not null, \"created_by\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"request_person_id_index\" on \"privacy\".\"request\" (\"person_id\");");
    this.addSql("create index \"request_status_index\" on \"privacy\".\"request\" (\"status\");");
    this.addSql("create table \"privacy\".\"restriction\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"restricted_at\" timestamptz not null, \"reason\" varchar(255) not null, \"until\" date null, \"request_id\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"privacy\".\"restriction\" add constraint \"restriction_person_id_unique\" unique (\"person_id\");");
  }

  override down(): void {
    this.addSql("drop table if exists \"privacy\".\"access_log\" cascade;");
    this.addSql("drop table if exists \"privacy\".\"consent\" cascade;");
    this.addSql("drop table if exists \"privacy\".\"notice_acknowledgement\" cascade;");
    this.addSql("drop table if exists \"privacy\".\"breach\" cascade;");
    this.addSql("drop table if exists \"privacy\".\"document\" cascade;");
    this.addSql("drop table if exists \"privacy\".\"information\" cascade;");
    this.addSql("drop table if exists \"privacy\".\"notice\" cascade;");
    this.addSql("drop table if exists \"privacy\".\"request\" cascade;");
    this.addSql("drop table if exists \"privacy\".\"restriction\" cascade;");
  }

}
