import { Migration } from '@mikro-orm/migrations';

export class Migration20261029153826_initial extends Migration {

  override name = 'Migration20261029153826_initial';

  override up(): void {
    this.addSql("create schema if not exists \"duty_officer\";");
    this.addSql("create table \"duty_officer\".\"duty_assignment\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"kind\" varchar(255) not null, \"from\" timestamptz not null, \"to\" timestamptz not null, \"notes\" text not null default '', \"external_uid\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"duty_assignment_person_id_index\" on \"duty_officer\".\"duty_assignment\" (\"person_id\");");
    this.addSql("create index \"duty_assignment_from_index\" on \"duty_officer\".\"duty_assignment\" (\"from\");");
    this.addSql("alter table \"duty_officer\".\"duty_assignment\" add constraint \"duty_assignment_external_uid_unique\" unique (\"external_uid\");");
    this.addSql("create table \"duty_officer\".\"expected_report\" (\"incident_id\" uuid not null, \"created_at\" timestamptz not null, primary key (\"incident_id\"));");
    this.addSql("create table \"duty_officer\".\"incident_exemption\" (\"id\" uuid not null, \"incident_id\" uuid not null, \"reason\" text not null, \"by\" varchar(255) not null, \"at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"duty_officer\".\"incident_exemption\" add constraint \"incident_exemption_incident_id_unique\" unique (\"incident_id\");");
  }

  override down(): void {
    this.addSql("drop table if exists \"duty_officer\".\"duty_assignment\" cascade;");
    this.addSql("drop table if exists \"duty_officer\".\"expected_report\" cascade;");
    this.addSql("drop table if exists \"duty_officer\".\"incident_exemption\" cascade;");
  }

}
