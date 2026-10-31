import { Migration } from '@mikro-orm/migrations';

export class Migration20261030151728_initial extends Migration {

  override name = 'Migration20261030151728_initial';

  override up(): void {
    this.addSql("create schema if not exists \"personal\";");
    this.addSql("create table \"personal\".\"access_link\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"key_hash\" varchar(255) not null, \"key_prefix\" varchar(255) not null, \"key_encrypted\" text null, \"created_at\" timestamptz not null, \"created_by\" varchar(255) not null, \"revoked_at\" timestamptz null, \"revoked_by\" varchar(255) null, \"last_seen_at\" timestamptz null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"personal\".\"access_link\" add constraint \"access_link_person_id_unique\" unique (\"person_id\");");
    this.addSql("alter table \"personal\".\"access_link\" add constraint \"access_link_key_hash_unique\" unique (\"key_hash\");");
  }

  override down(): void {
    this.addSql("drop table if exists \"personal\".\"access_link\" cascade;");
  }

}
