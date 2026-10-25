import { Migration } from '@mikro-orm/migrations';

export class Migration20261023071740_initial extends Migration {

  override name = 'Migration20261023071740_initial';

  override up(): void {
    this.addSql("create schema if not exists \"masterdata\";");
    this.addSql("create table \"masterdata\".\"department\" (\"id\" uuid not null, \"name\" varchar(255) not null, \"short_name\" varchar(255) not null, \"type\" varchar(255) not null, \"parent_id\" uuid null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"masterdata\".\"department\" add constraint \"department_parent_id_foreign\" foreign key (\"parent_id\") references \"masterdata\".\"department\" (\"id\") on delete set null;");
  }

  override down(): void {
    this.addSql("alter table \"masterdata\".\"department\" drop constraint \"department_parent_id_foreign\";");
    this.addSql("drop table if exists \"masterdata\".\"department\" cascade;");
  }

}
