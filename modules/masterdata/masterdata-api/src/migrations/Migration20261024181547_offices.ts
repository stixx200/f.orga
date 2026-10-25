import { Migration } from '@mikro-orm/migrations';

export class Migration20261024181547_offices extends Migration {

  override name = 'Migration20261024181547_offices';

  override up(): void {
    this.addSql("create table \"masterdata\".\"office_assignment\" (\"id\" uuid not null, \"person_id\" uuid not null, \"office\" varchar(255) not null, \"department_id\" varchar(255) null, \"from\" date not null, \"to\" date null, \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("alter table \"masterdata\".\"office_assignment\" add constraint \"office_assignment_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("drop table if exists \"masterdata\".\"office_assignment\" cascade;");
  }

}
