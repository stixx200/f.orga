import { Migration } from '@mikro-orm/migrations';

export class Migration20261023092912_report_revisions extends Migration {

  override name = 'Migration20261023092912_report_revisions';

  override up(): void {
    this.addSql("create table \"incidents\".\"report_revision\" (\"id\" uuid not null, \"report_id\" uuid not null, \"content\" jsonb not null, \"user_id\" varchar(255) null, \"user_name\" varchar(255) not null default '', \"saved_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"report_revision_report_id_index\" on \"incidents\".\"report_revision\" (\"report_id\");");
    this.addSql("alter table \"incidents\".\"report_revision\" add constraint \"report_revision_report_id_foreign\" foreign key (\"report_id\") references \"incidents\".\"report\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("drop table if exists \"incidents\".\"report_revision\" cascade;");
  }

}
