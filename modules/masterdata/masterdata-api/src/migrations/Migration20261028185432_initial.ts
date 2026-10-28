import { Migration } from '@mikro-orm/migrations';

export class Migration20261028185432_initial extends Migration {

  override name = 'Migration20261028185432_initial';

  override up(): void {
    this.addSql("create schema if not exists \"masterdata\";");
    this.addSql("create table \"masterdata\".\"catalog_entry\" (\"id\" uuid not null, \"kind\" varchar(255) not null, \"key\" varchar(255) not null, \"name\" jsonb not null, \"sort_order\" int not null default 0, \"active\" boolean not null default true, \"attributes\" jsonb not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"masterdata\".\"catalog_entry\" add constraint \"catalog_entry_kind_key_unique\" unique (\"kind\", \"key\");");
    this.addSql("create table \"masterdata\".\"course\" (\"id\" uuid not null, \"key\" varchar(255) not null, \"name\" jsonb not null, \"level\" varchar(255) not null, \"grants_qualifications\" jsonb not null, \"prerequisites\" jsonb not null, \"required_qualifications\" jsonb not null, \"minimum_age\" int null, \"allowed_statuses\" jsonb not null, \"targets\" jsonb not null, \"active\" boolean not null default true, \"sort_order\" int not null default 0, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"masterdata\".\"course\" add constraint \"course_key_unique\" unique (\"key\");");
    this.addSql("create table \"masterdata\".\"course_run\" (\"id\" uuid not null, \"course_id\" uuid not null, \"starts_on\" date not null, \"ends_on\" date null, \"location\" varchar(255) not null default '', \"notes\" text not null default '', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"person\" (\"id\" uuid not null, \"personnel_number\" varchar(255) null, \"salutation\" varchar(255) not null default '', \"title\" varchar(255) not null default '', \"first_name\" varchar(255) not null, \"last_name\" varchar(255) not null, \"nickname\" varchar(255) not null default '', \"street\" varchar(255) not null default '', \"postal_code\" varchar(255) not null default '', \"city\" varchar(255) not null default '', \"phone_private\" varchar(255) not null default '', \"phone_mobile\" varchar(255) not null default '', \"phone_work\" varchar(255) not null default '', \"email\" varchar(255) not null default '', \"birth_date\" date null, \"birth_place\" varchar(255) not null default '', \"gender\" varchar(255) not null default 'unspecified', \"employment\" varchar(255) not null default 'volunteer', \"employer\" jsonb null, \"bank\" jsonb null, \"joined_on\" date null, \"status\" varchar(255) not null, \"probation_ends_on\" date null, \"probation_decided_on\" date null, \"admitted_on\" date null, \"left_on\" date null, \"exit_reason\" varchar(255) null, \"musician\" boolean not null default false, \"driver_license\" jsonb not null, \"notes\" text not null default '', \"anonymized_at\" timestamptz null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"masterdata\".\"person\" add constraint \"person_personnel_number_unique\" unique (\"personnel_number\");");
    this.addSql("create index \"person_last_name_first_name_index\" on \"masterdata\".\"person\" (\"last_name\", \"first_name\");");
    this.addSql("create table \"masterdata\".\"office_assignment\" (\"id\" uuid not null, \"person_id\" uuid not null, \"office\" varchar(255) not null, \"department_id\" varchar(255) null, \"from\" date not null, \"to\" date null, \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"honor_award\" (\"id\" uuid not null, \"person_id\" uuid not null, \"honor\" varchar(255) not null, \"awarded_on\" date not null, \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"department\" (\"id\" uuid not null, \"name\" varchar(255) not null, \"short_name\" varchar(255) not null, \"type\" varchar(255) not null, \"parent_id\" uuid null, \"special_tasks\" jsonb not null, \"commander_id\" uuid null, \"deputy_ids\" jsonb not null, \"statistics_relevant\" boolean null, \"population\" int null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"membership\" (\"id\" uuid not null, \"person_id\" uuid not null, \"department_id\" uuid not null, \"from\" date not null, \"to\" date null, \"primary\" boolean not null default false, primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"department_group\" (\"id\" uuid not null, \"department_id\" uuid not null, \"name\" varchar(255) not null, \"leader_id\" uuid null, \"member_ids\" jsonb not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"course_nomination\" (\"id\" uuid not null, \"person_id\" uuid not null, \"course_id\" uuid not null, \"priority\" int not null default 2, \"desired_period\" varchar(255) not null default '', \"status\" varchar(255) not null default 'nominated', \"notes\" text not null default '', \"run_id\" uuid null, \"attendance_id\" varchar(255) null, \"created_at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"course_attendance\" (\"id\" uuid not null, \"person_id\" uuid not null, \"course_id\" uuid not null, \"run_id\" uuid null, \"starts_on\" date not null, \"ends_on\" date null, \"result\" varchar(255) not null, \"location\" varchar(255) not null default '', \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"person_qualification\" (\"id\" uuid not null, \"person_id\" uuid not null, \"qualification\" varchar(255) not null, \"acquired_on\" date not null, \"valid_until\" date null, \"course_attendance_id\" varchar(255) null, \"description\" varchar(255) not null default '', \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"rank_assignment\" (\"id\" uuid not null, \"person_id\" uuid not null, \"rank\" varchar(255) not null, \"since\" date not null, \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"rest_period\" (\"id\" uuid not null, \"person_id\" uuid not null, \"reason\" varchar(255) not null, \"from\" date not null, \"to\" date null, \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"station\" (\"id\" uuid not null, \"name\" varchar(255) not null, \"department_id\" uuid not null, \"street\" varchar(255) not null default '', \"postal_code\" varchar(255) not null default '', \"city\" varchar(255) not null default '', \"permanently_staffed\" boolean not null default false, \"notes\" text not null default '', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create table \"masterdata\".\"vehicle\" (\"id\" uuid not null, \"designation\" varchar(255) not null, \"radio_call_sign\" varchar(255) not null default '', \"license_plate\" varchar(255) not null default '', \"vehicle_type\" varchar(255) not null, \"department_id\" uuid not null, \"station_id\" uuid null, \"seats\" int not null, \"year_built\" int null, \"commissioned_on\" date null, \"decommissioned_on\" date null, \"cost_recovery_category\" varchar(255) null, \"statistics_category\" varchar(255) not null, \"status\" varchar(255) not null default 'in-service', \"notes\" text not null default '', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"masterdata\".\"course_run\" add constraint \"course_run_course_id_foreign\" foreign key (\"course_id\") references \"masterdata\".\"course\" (\"id\");");
    this.addSql("alter table \"masterdata\".\"office_assignment\" add constraint \"office_assignment_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"honor_award\" add constraint \"honor_award_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"department\" add constraint \"department_parent_id_foreign\" foreign key (\"parent_id\") references \"masterdata\".\"department\" (\"id\") on delete set null;");
    this.addSql("alter table \"masterdata\".\"department\" add constraint \"department_commander_id_foreign\" foreign key (\"commander_id\") references \"masterdata\".\"person\" (\"id\") on delete set null;");
    this.addSql("alter table \"masterdata\".\"membership\" add constraint \"membership_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"membership\" add constraint \"membership_department_id_foreign\" foreign key (\"department_id\") references \"masterdata\".\"department\" (\"id\");");
    this.addSql("alter table \"masterdata\".\"department_group\" add constraint \"department_group_department_id_foreign\" foreign key (\"department_id\") references \"masterdata\".\"department\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"department_group\" add constraint \"department_group_leader_id_foreign\" foreign key (\"leader_id\") references \"masterdata\".\"person\" (\"id\") on delete set null;");
    this.addSql("alter table \"masterdata\".\"course_nomination\" add constraint \"course_nomination_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"course_nomination\" add constraint \"course_nomination_course_id_foreign\" foreign key (\"course_id\") references \"masterdata\".\"course\" (\"id\");");
    this.addSql("alter table \"masterdata\".\"course_nomination\" add constraint \"course_nomination_run_id_foreign\" foreign key (\"run_id\") references \"masterdata\".\"course_run\" (\"id\") on delete set null;");
    this.addSql("alter table \"masterdata\".\"course_attendance\" add constraint \"course_attendance_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"course_attendance\" add constraint \"course_attendance_course_id_foreign\" foreign key (\"course_id\") references \"masterdata\".\"course\" (\"id\");");
    this.addSql("alter table \"masterdata\".\"course_attendance\" add constraint \"course_attendance_run_id_foreign\" foreign key (\"run_id\") references \"masterdata\".\"course_run\" (\"id\") on delete set null;");
    this.addSql("alter table \"masterdata\".\"person_qualification\" add constraint \"person_qualification_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"rank_assignment\" add constraint \"rank_assignment_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"rest_period\" add constraint \"rest_period_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
    this.addSql("alter table \"masterdata\".\"station\" add constraint \"station_department_id_foreign\" foreign key (\"department_id\") references \"masterdata\".\"department\" (\"id\");");
    this.addSql("alter table \"masterdata\".\"vehicle\" add constraint \"vehicle_department_id_foreign\" foreign key (\"department_id\") references \"masterdata\".\"department\" (\"id\");");
    this.addSql("alter table \"masterdata\".\"vehicle\" add constraint \"vehicle_station_id_foreign\" foreign key (\"station_id\") references \"masterdata\".\"station\" (\"id\") on delete set null;");
  }

  override down(): void {
    this.addSql("alter table \"masterdata\".\"course_run\" drop constraint \"course_run_course_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"course_nomination\" drop constraint \"course_nomination_course_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"course_attendance\" drop constraint \"course_attendance_course_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"course_nomination\" drop constraint \"course_nomination_run_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"course_attendance\" drop constraint \"course_attendance_run_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"office_assignment\" drop constraint \"office_assignment_person_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"honor_award\" drop constraint \"honor_award_person_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"department\" drop constraint \"department_commander_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"membership\" drop constraint \"membership_person_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"department_group\" drop constraint \"department_group_leader_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"course_nomination\" drop constraint \"course_nomination_person_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"course_attendance\" drop constraint \"course_attendance_person_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"person_qualification\" drop constraint \"person_qualification_person_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"rank_assignment\" drop constraint \"rank_assignment_person_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"rest_period\" drop constraint \"rest_period_person_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"department\" drop constraint \"department_parent_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"membership\" drop constraint \"membership_department_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"department_group\" drop constraint \"department_group_department_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"station\" drop constraint \"station_department_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"vehicle\" drop constraint \"vehicle_department_id_foreign\";");
    this.addSql("alter table \"masterdata\".\"vehicle\" drop constraint \"vehicle_station_id_foreign\";");
    this.addSql("drop table if exists \"masterdata\".\"catalog_entry\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"course\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"course_run\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"person\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"office_assignment\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"honor_award\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"department\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"membership\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"department_group\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"course_nomination\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"course_attendance\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"person_qualification\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"rank_assignment\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"rest_period\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"station\" cascade;");
    this.addSql("drop table if exists \"masterdata\".\"vehicle\" cascade;");
  }

}
