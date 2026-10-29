import { Migration } from '@mikro-orm/migrations';

export class Migration20261029144228_initial extends Migration {

  override name = 'Migration20261029144228_initial';

  override up(): void {
    this.addSql("create schema if not exists \"training\";");
    this.addSql("create table \"training\".\"session\" (\"id\" uuid not null, \"type\" varchar(255) not null, \"title\" varchar(255) not null, \"starts_at\" timestamptz not null, \"ends_at\" timestamptz not null, \"station_id\" varchar(255) null, \"department_ids\" text[] not null, \"responsible_person_id\" varchar(255) null, \"instructor_ids\" text[] not null, \"topic\" text not null default '', \"goals\" text not null default '', \"procedure\" text not null default '', \"material\" text not null default '', \"status\" varchar(255) not null default 'planned', \"closed_at\" timestamptz null, \"closed_by\" varchar(255) null, \"check_in_secret\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"session_starts_at_index\" on \"training\".\"session\" (\"starts_at\");");
    this.addSql("create table \"training\".\"attendance\" (\"id\" uuid not null, \"session_id\" uuid not null, \"person_id\" varchar(255) not null, \"status\" varchar(255) not null, \"from\" timestamptz null, \"to\" timestamptz null, \"role\" varchar(255) null, \"breathing_apparatus\" boolean not null default false, \"kilojoules\" int null, \"passed\" boolean null, \"injured\" boolean not null default false, \"checked_in_at\" timestamptz null, \"checked_in_via\" varchar(255) null, \"confirmed\" boolean not null default true, \"excuse_reason\" varchar(255) null, \"note\" text not null default '', primary key (\"id\"));");
    this.addSql("create index \"attendance_person_id_index\" on \"training\".\"attendance\" (\"person_id\");");
    this.addSql("alter table \"training\".\"attendance\" add constraint \"attendance_session_id_person_id_unique\" unique (\"session_id\", \"person_id\");");
    this.addSql("create table \"training\".\"session_type\" (\"id\" uuid not null, \"key\" varchar(255) not null, \"name\" jsonb not null, \"category\" varchar(255) not null default 'training', \"counts_for_participation\" boolean not null default true, \"compensation\" varchar(255) not null default 'training', \"record\" varchar(255) null, \"active\" boolean not null default true, \"sort_order\" int not null default 0, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"training\".\"session_type\" add constraint \"session_type_key_unique\" unique (\"key\");");
    this.addSql("alter table \"training\".\"attendance\" add constraint \"attendance_session_id_foreign\" foreign key (\"session_id\") references \"training\".\"session\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("alter table \"training\".\"attendance\" drop constraint \"attendance_session_id_foreign\";");
    this.addSql("drop table if exists \"training\".\"session\" cascade;");
    this.addSql("drop table if exists \"training\".\"attendance\" cascade;");
    this.addSql("drop table if exists \"training\".\"session_type\" cascade;");
  }

}
