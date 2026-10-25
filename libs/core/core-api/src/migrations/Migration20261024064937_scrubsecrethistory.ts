import { Migration } from '@mikro-orm/migrations';

export class Migration20261024064937_scrubsecrethistory extends Migration {

  override name = 'Migration20261024064937_scrubsecrethistory';

  /** Masks SMTP passwords that earlier versions wrote into the history of the settings. */
  override up(): void {
    for (const side of ['old', 'new']) {
      this.addSql(
        `update "core"."history" set "changes" = jsonb_set("changes", '{value,${side},password}', '"••••••"', false) ` +
          `where "entity" = 'core.setting' and "entity_id" = 'smtp' and jsonb_typeof("changes" #> '{value,${side}}') = 'object' ` +
          `and coalesce("changes" #>> '{value,${side},password}', '') <> ''`,
      );
    }
  }

  override down(): void {
  }

}
