import { Migration } from '@mikro-orm/migrations';

export class Migration20261025174139_initial extends Migration {

  override name = 'Migration20261025174139_initial';

  override up(): void {
    this.addSql("create schema if not exists \"promotions\";");
    this.addSql("create table \"promotions\".\"exclusion\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"from\" varchar(10) not null, \"until\" varchar(10) null, \"target_rank\" varchar(255) null, \"reason\" text not null, \"created_by\" varchar(255) not null, \"created_at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"exclusion_person_id_index\" on \"promotions\".\"exclusion\" (\"person_id\");");
    this.addSql("create table \"promotions\".\"promotion_list\" (\"id\" uuid not null, \"title\" varchar(255) not null, \"reference_date\" varchar(10) not null, \"effective_date\" varchar(10) not null, \"status\" varchar(255) not null default 'draft', \"entries\" jsonb not null default '[]', \"notes\" text not null default '', \"decided_on\" varchar(10) null, \"decided_by\" varchar(255) null, \"executed_at\" timestamptz null, \"created_at\" timestamptz not null, \"version\" int not null default 1, primary key (\"id\"));");
  }

  override down(): void {
    this.addSql("drop table if exists \"promotions\".\"exclusion\" cascade;");
    this.addSql("drop table if exists \"promotions\".\"promotion_list\" cascade;");
  }

}
