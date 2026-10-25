import { Migration } from '@mikro-orm/migrations';

export class Migration20261023083514_lists_tasks_imports extends Migration {

  override name = 'Migration20261023083514_lists_tasks_imports';

  override up(): void {
    this.addSql("create table \"core\".\"import_upload\" (\"id\" uuid not null, \"user_id\" varchar(255) not null, \"file_name\" varchar(255) not null, \"headers\" jsonb not null, \"rows\" jsonb not null, \"created_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("alter table \"core\".\"user\" add \"receive_digest\" boolean not null default true;");
  }

  override down(): void {
    this.addSql("drop table if exists \"core\".\"import_upload\" cascade;");
    this.addSql("alter table \"core\".\"user\" drop column \"receive_digest\";");
  }

}
