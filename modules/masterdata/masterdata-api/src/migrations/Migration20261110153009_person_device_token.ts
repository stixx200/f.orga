import { Migration } from '@mikro-orm/migrations';

export class Migration20261110153009_person_device_token extends Migration {

  override name = 'Migration20261110153009_person_device_token';

  override up(): void {
    this.addSql("create table \"masterdata\".\"person_device_token\" (\"id\" uuid not null, \"person_id\" uuid not null, \"kind\" varchar(255) not null, \"code_hash\" varchar(255) not null, \"suffix\" varchar(255) not null, \"registered_at\" timestamptz not null, \"registered_by\" varchar(255) not null, \"revoked_at\" timestamptz null, \"revoked_by\" varchar(255) null, \"revoke_reason\" text null, primary key (\"id\"));");
    this.addSql("create index \"person_device_token_code_hash_index\" on \"masterdata\".\"person_device_token\" (\"code_hash\");");
    this.addSql("alter table \"masterdata\".\"person_device_token\" add constraint \"person_device_token_person_id_foreign\" foreign key (\"person_id\") references \"masterdata\".\"person\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("drop table if exists \"masterdata\".\"person_device_token\" cascade;");
  }

}
