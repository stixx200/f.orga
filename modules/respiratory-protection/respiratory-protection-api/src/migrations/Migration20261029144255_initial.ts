import { Migration } from '@mikro-orm/migrations';

export class Migration20261029144255_initial extends Migration {

  override name = 'Migration20261029144255_initial';

  override up(): void {
    this.addSql("create schema if not exists \"respiratory_protection\";");
    this.addSql("create table \"respiratory_protection\".\"evidence\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"kind\" varchar(255) not null, \"date\" varchar(10) not null, \"valid_until\" varchar(10) null, \"result\" varchar(255) null, \"examiner\" varchar(255) not null default '', \"restrictions\" varchar(255) not null default '', \"examination_group\" varchar(255) null, \"device\" varchar(255) null, \"facility\" varchar(255) not null default '', \"kilojoules\" int null, \"passed\" boolean null, \"minutes\" int null, \"note\" text not null default '', \"source\" varchar(255) not null default 'manual', \"source_id\" varchar(255) null, \"withdrawn\" boolean not null default false, \"created_at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"evidence_person_id_index\" on \"respiratory_protection\".\"evidence\" (\"person_id\");");
    this.addSql("create index \"evidence_source_source_id_index\" on \"respiratory_protection\".\"evidence\" (\"source\", \"source_id\");");
    this.addSql("create table \"respiratory_protection\".\"status\" (\"person_id\" varchar(255) not null, \"color\" varchar(255) not null, \"changed_at\" timestamptz not null, \"notify_pending\" boolean not null default false, primary key (\"person_id\"));");
  }

  override down(): void {
    this.addSql("drop table if exists \"respiratory_protection\".\"evidence\" cascade;");
    this.addSql("drop table if exists \"respiratory_protection\".\"status\" cascade;");
  }

}
