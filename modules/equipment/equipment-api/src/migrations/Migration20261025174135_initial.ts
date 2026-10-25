import { Migration } from '@mikro-orm/migrations';

export class Migration20261025174135_initial extends Migration {

  override name = 'Migration20261025174135_initial';

  override up(): void {
    this.addSql("create schema if not exists \"equipment\";");
    this.addSql("create table \"equipment\".\"category\" (\"id\" uuid not null, \"key\" varchar(255) not null, \"name\" jsonb not null, \"parent_key\" varchar(255) null, \"tracking\" varchar(255) not null default 'item', \"breathing_apparatus\" boolean not null default false, \"lock_when_overdue\" boolean not null default false, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"equipment\".\"category\" add constraint \"category_key_unique\" unique (\"key\");");
    this.addSql("create table \"equipment\".\"item\" (\"id\" uuid not null, \"inventory_number\" varchar(255) not null, \"name\" varchar(255) not null, \"type_key\" varchar(255) null, \"category_key\" varchar(255) not null, \"serial_number\" varchar(255) not null default '', \"barcode\" varchar(255) null, \"rfid\" varchar(255) null, \"manufacturer\" varchar(255) not null default '', \"year_built\" int null, \"purchased_on\" varchar(10) null, \"price\" double precision null, \"properties\" jsonb not null default '{}', \"department_id\" varchar(255) not null, \"vehicle_id\" varchar(255) null, \"station_id\" varchar(255) null, \"loading_place\" varchar(255) not null default '', \"quantity\" int not null default 1, \"expires_on\" varchar(10) null, \"inspections\" jsonb null, \"interval_overrides\" jsonb not null default '{}', \"status\" varchar(255) not null default 'ready', \"triggered\" jsonb not null default '{}', \"retirement\" jsonb null, \"for_vehicle_id\" varchar(255) null, \"label_printed_at\" timestamptz null, \"notes\" text not null default '', \"created_on\" varchar(10) not null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"equipment\".\"item\" add constraint \"item_inventory_number_unique\" unique (\"inventory_number\");");
    this.addSql("create index \"item_category_key_index\" on \"equipment\".\"item\" (\"category_key\");");
    this.addSql("alter table \"equipment\".\"item\" add constraint \"item_barcode_unique\" unique (\"barcode\");");
    this.addSql("alter table \"equipment\".\"item\" add constraint \"item_rfid_unique\" unique (\"rfid\");");
    this.addSql("create index \"item_department_id_index\" on \"equipment\".\"item\" (\"department_id\");");
    this.addSql("create index \"item_vehicle_id_index\" on \"equipment\".\"item\" (\"vehicle_id\");");
    this.addSql("alter table \"equipment\".\"item\" add constraint \"item_for_vehicle_id_unique\" unique (\"for_vehicle_id\");");
    this.addSql("create table \"equipment\".\"defect\" (\"id\" uuid not null, \"item_id\" uuid not null, \"description\" text not null, \"inspection_id\" varchar(255) null, \"finding_name\" jsonb null, \"finding_result\" varchar(255) null, \"status\" varchar(255) not null default 'reported', \"resolution\" text not null default '', \"reported_by\" varchar(255) not null, \"reported_by_user_id\" varchar(255) null, \"reported_at\" timestamptz not null, \"resolved_at\" timestamptz null, \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("create index \"defect_inspection_id_index\" on \"equipment\".\"defect\" (\"inspection_id\");");
    this.addSql("create index \"defect_reported_by_user_id_index\" on \"equipment\".\"defect\" (\"reported_by_user_id\");");
    this.addSql("create table \"equipment\".\"equipment_type\" (\"id\" uuid not null, \"key\" varchar(255) not null, \"name\" jsonb not null, \"category_key\" varchar(255) not null, \"manufacturer\" varchar(255) not null default '', \"model\" varchar(255) not null default '', \"inspections\" jsonb not null default '[]', \"properties\" jsonb not null default '[]', \"version\" int not null default 1, primary key (\"id\"));");
    this.addSql("alter table \"equipment\".\"equipment_type\" add constraint \"equipment_type_key_unique\" unique (\"key\");");
    this.addSql("create table \"equipment\".\"inspection\" (\"id\" uuid not null, \"item_id\" uuid not null, \"inspection_key\" varchar(255) not null, \"date\" varchar(10) not null, \"inspector_person_id\" varchar(255) null, \"inspector_company\" varchar(255) not null default '', \"result\" varchar(255) not null, \"checklist\" jsonb not null default '[]', \"measurements\" text not null default '', \"next_due_on\" varchar(10) null, \"notes\" text not null default '', \"recorded_by\" varchar(255) not null, \"qualification_warning\" boolean not null default false, \"cancelled\" boolean not null default false, \"change_reason\" text not null default '', \"cleared_trigger\" varchar(10) null, primary key (\"id\"));");
    this.addSql("create index \"inspection_date_index\" on \"equipment\".\"inspection\" (\"date\");");
    this.addSql("create table \"equipment\".\"usage\" (\"id\" uuid not null, \"report_id\" varchar(255) not null, \"source\" varchar(255) not null default 'incidents', \"item_id\" uuid not null, \"quantity\" int not null default 1, \"inspect_after\" boolean not null default false, primary key (\"id\"));");
    this.addSql("create index \"usage_report_id_index\" on \"equipment\".\"usage\" (\"report_id\");");
    this.addSql("alter table \"equipment\".\"usage\" add constraint \"usage_report_id_item_id_unique\" unique (\"report_id\", \"item_id\");");
    this.addSql("alter table \"equipment\".\"defect\" add constraint \"defect_item_id_foreign\" foreign key (\"item_id\") references \"equipment\".\"item\" (\"id\") on delete cascade;");
    this.addSql("alter table \"equipment\".\"inspection\" add constraint \"inspection_item_id_foreign\" foreign key (\"item_id\") references \"equipment\".\"item\" (\"id\") on delete cascade;");
    this.addSql("alter table \"equipment\".\"usage\" add constraint \"usage_item_id_foreign\" foreign key (\"item_id\") references \"equipment\".\"item\" (\"id\") on delete cascade;");
  }

  override down(): void {
    this.addSql("alter table \"equipment\".\"defect\" drop constraint \"defect_item_id_foreign\";");
    this.addSql("alter table \"equipment\".\"inspection\" drop constraint \"inspection_item_id_foreign\";");
    this.addSql("alter table \"equipment\".\"usage\" drop constraint \"usage_item_id_foreign\";");
    this.addSql("drop table if exists \"equipment\".\"category\" cascade;");
    this.addSql("drop table if exists \"equipment\".\"item\" cascade;");
    this.addSql("drop table if exists \"equipment\".\"defect\" cascade;");
    this.addSql("drop table if exists \"equipment\".\"equipment_type\" cascade;");
    this.addSql("drop table if exists \"equipment\".\"inspection\" cascade;");
    this.addSql("drop table if exists \"equipment\".\"usage\" cascade;");
  }

}
