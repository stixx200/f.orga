import { Migration } from '@mikro-orm/migrations';

export class Migration20261029144244_initial extends Migration {

  override name = 'Migration20261029144244_initial';

  override up(): void {
    this.addSql("create schema if not exists \"clothing\";");
    this.addSql("create table \"clothing\".\"article\" (\"id\" uuid not null, \"key\" varchar(255) not null, \"name\" jsonb not null, \"kind\" varchar(255) not null, \"sizes\" jsonb not null default '[]', \"textile\" boolean not null default false, \"impregnation_months\" int null, \"inspection_months\" int null, \"active\" boolean not null default true, \"sort_order\" int not null default 0, \"minimum_stock\" jsonb not null default '{}', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"clothing\".\"article\" add constraint \"article_key_unique\" unique (\"key\");");
    this.addSql("create table \"clothing\".\"item\" (\"id\" uuid not null, \"article_key\" varchar(255) not null, \"inventory_number\" varchar(255) not null, \"size\" varchar(255) not null default '', \"serial_number\" varchar(255) not null default '', \"barcode\" varchar(255) null, \"rfid\" varchar(255) null, \"manufacturer\" varchar(255) not null default '', \"purchased_on\" varchar(10) null, \"department_id\" varchar(255) not null, \"notes\" text not null default '', \"status\" varchar(255) not null default 'stock', \"holder_id\" varchar(255) null, \"issued_on\" varchar(10) null, \"created_on\" varchar(10) not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"item_article_key_index\" on \"clothing\".\"item\" (\"article_key\");");
    this.addSql("alter table \"clothing\".\"item\" add constraint \"item_inventory_number_unique\" unique (\"inventory_number\");");
    this.addSql("alter table \"clothing\".\"item\" add constraint \"item_barcode_unique\" unique (\"barcode\");");
    this.addSql("alter table \"clothing\".\"item\" add constraint \"item_rfid_unique\" unique (\"rfid\");");
    this.addSql("create index \"item_department_id_index\" on \"clothing\".\"item\" (\"department_id\");");
    this.addSql("create index \"item_holder_id_index\" on \"clothing\".\"item\" (\"holder_id\");");
    this.addSql("create table \"clothing\".\"inspection\" (\"id\" uuid not null, \"item_id\" uuid not null, \"date\" varchar(10) not null, \"passed\" boolean not null, \"inspector\" varchar(255) not null default '', \"notes\" text not null default '', \"recorded_by\" varchar(255) not null, \"recorded_by_id\" varchar(255) null, \"cancelled_at\" timestamptz null, \"cancelled_by\" varchar(255) null, \"cancel_reason\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"clothing\".\"care\" (\"id\" uuid not null, \"item_id\" uuid not null, \"kind\" varchar(255) not null, \"date\" varchar(10) not null, \"place\" varchar(255) not null default '', \"notes\" text not null default '', \"recorded_by\" varchar(255) not null, \"recorded_by_id\" varchar(255) null, \"cancelled_at\" timestamptz null, \"cancelled_by\" varchar(255) null, \"cancel_reason\" text not null default '', primary key (\"id\"));");
    this.addSql("create table \"clothing\".\"consumable_receipt\" (\"id\" uuid not null, \"article_key\" varchar(255) not null, \"size\" varchar(255) not null default '', \"quantity\" int not null, \"counted\" int null, \"date\" varchar(10) not null, \"notes\" text not null default '', \"recorded_by\" varchar(255) not null, \"recorded_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"consumable_receipt_article_key_index\" on \"clothing\".\"consumable_receipt\" (\"article_key\");");
    this.addSql("create table \"clothing\".\"issue\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"kind\" varchar(255) not null, \"article_key\" varchar(255) not null, \"item_id\" varchar(255) null, \"inventory_number\" varchar(255) null, \"size\" varchar(255) not null default '', \"quantity\" int not null default 1, \"date\" varchar(10) not null, \"notes\" text not null default '', \"retire\" boolean not null default false, \"laundry\" boolean not null default false, \"recorded_by\" varchar(255) not null, \"recorded_by_id\" varchar(255) null, \"cancelled_at\" timestamptz null, \"cancelled_by\" varchar(255) null, \"cancel_reason\" text not null default '', \"recorded_at\" timestamptz not null, primary key (\"id\"));");
    this.addSql("create index \"issue_person_id_index\" on \"clothing\".\"issue\" (\"person_id\");");
    this.addSql("create index \"issue_item_id_index\" on \"clothing\".\"issue\" (\"item_id\");");
    this.addSql("create table \"clothing\".\"size_profile\" (\"id\" uuid not null, \"person_id\" varchar(255) not null, \"sizes\" jsonb not null default '{}', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"clothing\".\"size_profile\" add constraint \"size_profile_person_id_unique\" unique (\"person_id\");");
    this.addSql("alter table \"clothing\".\"inspection\" add constraint \"inspection_item_id_foreign\" foreign key (\"item_id\") references \"clothing\".\"item\" (\"id\") on delete cascade;");
    this.addSql("alter table \"clothing\".\"care\" add constraint \"care_item_id_foreign\" foreign key (\"item_id\") references \"clothing\".\"item\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("alter table \"clothing\".\"inspection\" drop constraint \"inspection_item_id_foreign\";");
    this.addSql("alter table \"clothing\".\"care\" drop constraint \"care_item_id_foreign\";");
    this.addSql("drop table if exists \"clothing\".\"article\" cascade;");
    this.addSql("drop table if exists \"clothing\".\"item\" cascade;");
    this.addSql("drop table if exists \"clothing\".\"inspection\" cascade;");
    this.addSql("drop table if exists \"clothing\".\"care\" cascade;");
    this.addSql("drop table if exists \"clothing\".\"consumable_receipt\" cascade;");
    this.addSql("drop table if exists \"clothing\".\"issue\" cascade;");
    this.addSql("drop table if exists \"clothing\".\"size_profile\" cascade;");
  }

}
