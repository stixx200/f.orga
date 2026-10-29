import { Migration } from '@mikro-orm/migrations';

export class Migration20261029144258_initial extends Migration {

  override name = 'Migration20261029144258_initial';

  override up(): void {
    this.addSql("create schema if not exists \"compensation\";");
    this.addSql("create table \"compensation\".\"function_holder\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"function_key\" varchar(255) not null, \"from\" varchar(10) not null, \"to\" varchar(10) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"function_holder_person_id_index\" on \"compensation\".\"function_holder\" (\"person_id\");");
    this.addSql("create table \"compensation\".\"run\" (\"id\" uuid not null, \"number\" varchar(255) not null, \"from\" varchar(10) not null, \"to\" varchar(10) not null, \"status\" varchar(255) not null default 'draft', \"closed_at\" timestamptz null, \"closed_by\" varchar(255) null, \"closed_by_id\" varchar(255) null, \"without_iban\" jsonb not null default '[]', \"manual_payouts\" jsonb not null default '[]', \"approved_at\" timestamptz null, \"approved_by\" varchar(255) null, \"handed_over_at\" timestamptz null, \"paid_at\" timestamptz null, \"created_at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"compensation\".\"run\" add constraint \"run_number_unique\" unique (\"number\");");
    this.addSql("create table \"compensation\".\"item\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"department_id\" varchar(255) null, \"source\" varchar(255) not null, \"source_id\" varchar(255) null, \"label\" varchar(255) not null default '', \"kind\" varchar(255) not null, \"date\" varchar(10) not null, \"from\" timestamptz null, \"to\" timestamptz null, \"hours\" double precision null, \"rate\" numeric(10,2) null, \"amount\" numeric(10,2) null, \"working_hours\" boolean not null default false, \"correction\" boolean not null default false, \"reason\" text not null default '', \"run_id\" uuid null, \"deferred_from\" varchar(255) null, \"created_at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"item_person_id_index\" on \"compensation\".\"item\" (\"person_id\");");
    this.addSql("create index \"item_date_index\" on \"compensation\".\"item\" (\"date\");");
    this.addSql("create index \"item_source_source_id_index\" on \"compensation\".\"item\" (\"source\", \"source_id\");");
    this.addSql("alter table \"compensation\".\"item\" add constraint \"item_run_id_foreign\" foreign key (\"run_id\") references \"compensation\".\"run\" (\"id\") on delete set null;");
  }

  override down(): void {
    this.addSql("alter table \"compensation\".\"item\" drop constraint \"item_run_id_foreign\";");
    this.addSql("drop table if exists \"compensation\".\"function_holder\" cascade;");
    this.addSql("drop table if exists \"compensation\".\"run\" cascade;");
    this.addSql("drop table if exists \"compensation\".\"item\" cascade;");
  }

}
