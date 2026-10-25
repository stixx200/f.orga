import { Migration } from '@mikro-orm/migrations';

export class Migration20261024182805_rest_periods extends Migration {

  override name = 'Migration20261024182805_rest_periods';

  override up(): void {
    this.addSql("create table \"masterdata\".\"rest_period\" (\"id\" uuid not null, \"person_id\" uuid not null, \"reason\" varchar(255) not null, \"from\" date not null, \"to\" date null, \"notes\" text not null default '', primary key (\"id\"));");
    this.addSql("alter table \"masterdata\".\"rest_period\" add constraint \"rest_period_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("drop table if exists \"masterdata\".\"rest_period\" cascade;");
  }

}
