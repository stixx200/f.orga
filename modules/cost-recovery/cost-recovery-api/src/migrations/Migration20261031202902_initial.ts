import { Migration } from '@mikro-orm/migrations';

export class Migration20261031202902_initial extends Migration {

  override name = 'Migration20261031202902_initial';

  override up(): void {
    this.addSql("create schema if not exists \"cost_recovery\";");
    this.addSql("create table \"cost_recovery\".\"address_book\" (\"id\" uuid not null, \"name\" varchar(255) not null, \"street\" varchar(255) not null default '', \"postal_code\" varchar(255) not null default '', \"city\" varchar(255) not null default '', \"role\" varchar(255) not null default '', \"notes\" text not null default '', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create table \"cost_recovery\".\"incident_offense\" (\"incident_id\" varchar(255) not null, \"offense_key\" varchar(255) not null, \"set_by\" varchar(255) not null, \"set_at\" timestamptz not null, primary key (\"incident_id\"));");
    this.addSql("create table \"cost_recovery\".\"notice\" (\"id\" uuid not null, \"number\" varchar(255) not null, \"incident_id\" varchar(255) not null, \"dispatch_number\" varchar(255) not null, \"alarm_keyword\" varchar(255) not null, \"alarmed_at\" timestamptz not null, \"location\" varchar(255) not null default '', \"offense_key\" varchar(255) not null, \"debtors\" jsonb not null default '[]', \"positions\" jsonb not null default '[]', \"reasoning\" text not null default '', \"remedy\" text not null default '', \"cash_reference\" varchar(255) not null default '', \"status\" varchar(255) not null default 'draft', \"submitted_at\" timestamptz null, \"submitted_by\" varchar(255) null, \"submitted_by_id\" varchar(255) null, \"last_edited_by\" varchar(255) null, \"last_edited_by_id\" varchar(255) null, \"issued_at\" timestamptz null, \"issued_by\" varchar(255) null, \"due_on\" varchar(10) null, \"handed_over_at\" timestamptz null, \"change_reported_at\" timestamptz null, \"pdf\" bytea null, \"objection\" jsonb null, \"cancellation\" jsonb null, \"paid_on\" varchar(10) null, \"payments\" jsonb not null default '[]', \"reminders\" jsonb not null default '[]', \"guests_not_charged\" int not null default 0, \"amends_id\" varchar(255) null, \"amends_number\" varchar(255) null, \"amended_by_id\" varchar(255) null, \"amended_by_number\" varchar(255) null, \"created_at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"cost_recovery\".\"notice\" add constraint \"notice_number_unique\" unique (\"number\");");
    this.addSql("create index \"notice_incident_id_index\" on \"cost_recovery\".\"notice\" (\"incident_id\");");
  }

  override down(): void {
    this.addSql("drop table if exists \"cost_recovery\".\"address_book\" cascade;");
    this.addSql("drop table if exists \"cost_recovery\".\"incident_offense\" cascade;");
    this.addSql("drop table if exists \"cost_recovery\".\"notice\" cascade;");
  }

}
