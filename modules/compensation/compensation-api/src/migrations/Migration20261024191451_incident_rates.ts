import { Migration } from '@mikro-orm/migrations';

export class Migration20261024191451_incident_rates extends Migration {

  /** The hourly incident rates move from the incidents settings to compensation; existing values are taken over. */
  override up(): void {
    this.addSql(`insert into "core"."setting" ("section", "value")
      select 'compensation.general', jsonb_strip_nulls(jsonb_build_object('incidentRates', i."value"->'rates', 'incidentRounding', i."value"->'rounding'))
      from "core"."setting" i where i."section" = 'incidents.general' and i."value" ? 'rates'
      on conflict ("section") do update set "value" = excluded."value" || "core"."setting"."value"
      where not ("core"."setting"."value" ? 'incidentRates')`);
  }

  override down(): void {
    this.addSql(`update "core"."setting" set "value" = "value" - 'incidentRates' - 'incidentRounding' where "section" = 'compensation.general'`);
  }

}
