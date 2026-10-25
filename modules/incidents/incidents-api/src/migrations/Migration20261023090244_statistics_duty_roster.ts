import { Migration } from '@mikro-orm/migrations';

export class Migration20261023090244_statistics_duty_roster extends Migration {

  override name = 'Migration20261023090244_statistics_duty_roster';

  override up(): void {
    this.addSql("create table \"incidents\".\"duty_assignment\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"kind\" varchar(255) not null, \"from\" timestamptz not null, \"to\" timestamptz not null, \"notes\" text not null default '', \"external_uid\" varchar(255) null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"duty_assignment_person_id_index\" on \"incidents\".\"duty_assignment\" (\"person_id\");");
    this.addSql("create index \"duty_assignment_from_index\" on \"incidents\".\"duty_assignment\" (\"from\");");
    this.addSql("alter table \"incidents\".\"duty_assignment\" add constraint \"duty_assignment_external_uid_unique\" unique (\"external_uid\");");
    this.addSql("create table \"incidents\".\"statistics_year\" (\"year\" serial primary key, \"corrections\" jsonb not null, \"closed_at\" timestamptz null, \"closed_by\" varchar(255) null, \"version\" int not null default 1);");
  }

  override down(): void {
    this.addSql("drop table if exists \"incidents\".\"duty_assignment\" cascade;");
    this.addSql("drop table if exists \"incidents\".\"statistics_year\" cascade;");
  }

}
