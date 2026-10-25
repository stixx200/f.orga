import { Migration } from '@mikro-orm/migrations';

export class Migration20261025125649_barcode_rfid extends Migration {

  override name = 'Migration20261025125649_barcode_rfid';

  override up(): void {
    this.addSql("alter table \"equipment\".\"item\" add \"barcode\" varchar(255) null, add \"rfid\" varchar(255) null;");
    this.addSql("alter table \"equipment\".\"item\" add constraint \"item_barcode_unique\" unique (\"barcode\");");
    this.addSql("alter table \"equipment\".\"item\" add constraint \"item_rfid_unique\" unique (\"rfid\");");
  }

  override down(): void {
    this.addSql("alter table \"equipment\".\"item\" drop constraint \"item_barcode_unique\";");
    this.addSql("alter table \"equipment\".\"item\" drop constraint \"item_rfid_unique\";");
    this.addSql("alter table \"equipment\".\"item\" drop column \"barcode\", drop column \"rfid\";");
  }

}
