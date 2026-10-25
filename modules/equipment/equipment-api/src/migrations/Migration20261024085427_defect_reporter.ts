import { Migration } from '@mikro-orm/migrations';

export class Migration20261024085427_defect_reporter extends Migration {

  override name = 'Migration20261024085427_defect_reporter';

  override up(): void {
    this.addSql("alter table \"equipment\".\"defect\" add \"reported_by_user_id\" varchar(255) null;");
    this.addSql("create index \"defect_reported_by_user_id_index\" on \"equipment\".\"defect\" (\"reported_by_user_id\");");
  }

  override down(): void {
    this.addSql("drop index \"equipment\".\"defect_reported_by_user_id_index\";");
    this.addSql("alter table \"equipment\".\"defect\" drop column \"reported_by_user_id\";");
  }

}
