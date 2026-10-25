import { Migration } from '@mikro-orm/migrations';

export class Migration20261024165037_exclusion_target_rank extends Migration {

  override name = 'Migration20261024165037_exclusion_target_rank';

  override up(): void {
    this.addSql("alter table \"promotions\".\"exclusion\" add \"target_rank\" varchar(255) null;");
  }

  override down(): void {
    this.addSql("alter table \"promotions\".\"exclusion\" drop column \"target_rank\";");
  }

}
