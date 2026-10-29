import { Migration } from '@mikro-orm/migrations';

export class Migration20261029164313_initial extends Migration {

  override name = 'Migration20261029164313_initial';

  override up(): void {
    this.addSql("create schema if not exists \"incidents\";");
    this.addSql("create table \"incidents\".\"alarm_keyword\" (\"id\" uuid not null, \"key\" varchar(255) not null, \"name\" jsonb not null, \"main_type\" varchar(255) null, \"technical_category\" varchar(255) null, \"false_alarm_type\" varchar(255) null, \"requires_vehicle\" boolean not null default true, \"compensation_kind\" varchar(255) not null default 'incident', \"active\" boolean not null default true, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"incidents\".\"alarm_keyword\" add constraint \"alarm_keyword_key_unique\" unique (\"key\");");
    this.addSql("create table \"incidents\".\"incident\" (\"id\" uuid not null, \"dispatch_number\" varchar(255) not null, \"internal_number\" boolean not null default false, \"alarm_keyword\" varchar(255) not null, \"alarm_message\" text not null default '', \"alarmed_at\" timestamptz not null, \"location\" jsonb not null, \"created_via\" varchar(255) not null default 'ui', \"chargeable\" boolean not null default false, \"chargeable_reason\" text not null default '', \"notes\" text not null default '', \"statistics\" jsonb null, \"retention_special\" boolean not null default false, \"anonymized_at\" timestamptz null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"incidents\".\"incident\" add constraint \"incident_dispatch_number_unique\" unique (\"dispatch_number\");");
    this.addSql("create index \"incident_alarmed_at_index\" on \"incidents\".\"incident\" (\"alarmed_at\");");
    this.addSql("create table \"incidents\".\"report\" (\"id\" uuid not null, \"incident_id\" uuid not null, \"department_id\" varchar(255) null, \"unit\" varchar(255) null, \"number\" varchar(255) not null, \"primary\" boolean not null default false, \"status\" varchar(255) not null default 'draft', \"locked\" boolean not null default false, \"locked_by\" varchar(255) null, \"locked_at\" timestamptz null, \"return_comment\" text null, \"author_person_id\" varchar(255) null, \"alarmed_at\" timestamptz not null, \"departed_at\" timestamptz null, \"arrived_at\" timestamptz null, \"ended_at\" timestamptz null, \"returned_at\" timestamptz not null, \"end_confirmed\" boolean not null default true, \"situation\" text not null default '', \"actions\" text not null default '', \"cause\" text not null default '', \"incident_commander\" varchar(255) not null default '', \"weather\" jsonb not null, \"equipment\" text not null default '', \"acknowledgements\" jsonb not null, \"managed_by\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create unique index \"report_one_primary_per_incident\" on \"incidents\".\"report\" (\"incident_id\") where \"primary\";");
    this.addSql("alter table \"incidents\".\"report\" add constraint \"report_incident_id_department_id_unique\" unique (\"incident_id\", \"department_id\");");
    this.addSql("alter table \"incidents\".\"report\" add constraint \"report_department_id_number_unique\" unique (\"department_id\", \"number\");");
    this.addSql("alter table \"incidents\".\"report\" add constraint \"report_incident_id_unit_unique\" unique (\"incident_id\", \"unit\");");
    this.addSql("alter table \"incidents\".\"report\" add constraint \"report_unit_number_unique\" unique (\"unit\", \"number\");");
    this.addSql("create table \"incidents\".\"other_agency\" (\"id\" uuid not null, \"report_id\" uuid not null, \"organization\" varchar(255) not null, \"forces\" int null, \"vehicles\" int null, \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"incidents\".\"involved_party\" (\"id\" uuid not null, \"report_id\" uuid not null, \"role\" varchar(255) not null, \"name\" varchar(255) not null, \"street\" varchar(255) not null default '', \"postal_code\" varchar(255) not null default '', \"city\" varchar(255) not null default '', \"phone\" varchar(255) not null default '', \"license_plate\" varchar(255) not null default '', \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"incidents\".\"report_personnel\" (\"id\" uuid not null, \"report_id\" uuid not null, \"person_id\" varchar(255) null, \"guest_name\" varchar(255) not null default '', \"vehicle_id\" varchar(255) null, \"standby_station_id\" varchar(255) null, \"function\" varchar(255) null, \"breathing_apparatus\" boolean not null default false, \"breathing_minutes\" int null, \"chemical_suit\" boolean not null default false, \"breathing_device\" varchar(255) null, \"from\" timestamptz null, \"to\" timestamptz null, \"loss_of_earnings\" boolean not null default false, \"during_working_hours\" boolean not null default false, \"allowances\" jsonb not null, \"compensation_override\" jsonb null, \"injured\" boolean not null default false, \"killed\" boolean not null default false, \"booked_via\" varchar(255) null, \"booked_at\" timestamptz null, \"terminal_id\" varchar(255) null, \"terminal_editable\" boolean not null default false, primary key (\"id\"));");
    this.addSql("create index \"report_personnel_person_id_index\" on \"incidents\".\"report_personnel\" (\"person_id\");");
    this.addSql("create table \"incidents\".\"report_revision\" (\"id\" uuid not null, \"report_id\" uuid not null, \"content\" jsonb not null, \"user_id\" varchar(255) null, \"user_name\" varchar(255) not null default '', \"saved_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"report_revision_report_id_index\" on \"incidents\".\"report_revision\" (\"report_id\");");
    this.addSql("create table \"incidents\".\"report_vehicle\" (\"id\" uuid not null, \"report_id\" uuid not null, \"vehicle_id\" varchar(255) not null, \"alarmed_at\" timestamptz null, \"departed_at\" timestamptz null, \"returned_at\" timestamptz null, \"kilometres\" int null, primary key (\"id\"));");
    this.addSql("create table \"incidents\".\"statistics_year\" (\"year\" serial primary key, \"corrections\" jsonb not null, \"closed_at\" timestamptz null, \"closed_by\" varchar(255) null, \"frozen_values\" jsonb null, \"frozen_checks\" jsonb null, \"version\" int not null default 1);");
    this.addSql("alter table \"incidents\".\"report\" add constraint \"report_incident_id_foreign\" foreign key (\"incident_id\") references \"incidents\".\"incident\" (\"id\") on delete cascade;");
    this.addSql("alter table \"incidents\".\"report\" add constraint \"report_department_or_unit\" check ((\"department_id\" is null) <> (\"unit\" is null));");
    this.addSql("alter table \"incidents\".\"other_agency\" add constraint \"other_agency_report_id_foreign\" foreign key (\"report_id\") references \"incidents\".\"report\" (\"id\") on delete cascade;");
    this.addSql("alter table \"incidents\".\"involved_party\" add constraint \"involved_party_report_id_foreign\" foreign key (\"report_id\") references \"incidents\".\"report\" (\"id\") on delete cascade;");
    this.addSql("alter table \"incidents\".\"report_personnel\" add constraint \"report_personnel_report_id_foreign\" foreign key (\"report_id\") references \"incidents\".\"report\" (\"id\") on delete cascade;");
    this.addSql("alter table \"incidents\".\"report_revision\" add constraint \"report_revision_report_id_foreign\" foreign key (\"report_id\") references \"incidents\".\"report\" (\"id\") on delete cascade;");
    this.addSql("alter table \"incidents\".\"report_vehicle\" add constraint \"report_vehicle_report_id_foreign\" foreign key (\"report_id\") references \"incidents\".\"report\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("alter table \"incidents\".\"report\" drop constraint \"report_incident_id_foreign\";");
    this.addSql("alter table \"incidents\".\"other_agency\" drop constraint \"other_agency_report_id_foreign\";");
    this.addSql("alter table \"incidents\".\"involved_party\" drop constraint \"involved_party_report_id_foreign\";");
    this.addSql("alter table \"incidents\".\"report_personnel\" drop constraint \"report_personnel_report_id_foreign\";");
    this.addSql("alter table \"incidents\".\"report_revision\" drop constraint \"report_revision_report_id_foreign\";");
    this.addSql("alter table \"incidents\".\"report_vehicle\" drop constraint \"report_vehicle_report_id_foreign\";");
    this.addSql("drop table if exists \"incidents\".\"alarm_keyword\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"incident\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"report\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"other_agency\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"involved_party\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"report_personnel\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"report_revision\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"report_vehicle\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"statistics_year\" cascade;");
  }

}
