import { Migration } from '@mikro-orm/migrations';

export class Migration20261025132529_copy_report_costs extends Migration {

  override name = 'Migration20261025132529_copy_report_costs';

  /** Costs and notes moved from the reports to the incident: chargeable if any report was, texts of all reports (primary first). */
  override up(): void {
    this.addSql(`
      update "incidents"."incident" i set
        "chargeable" = c.chargeable,
        "chargeable_reason" = c.reason,
        "notes" = c.notes
      from (
        select r."incident_id",
          bool_or(r."chargeable") as chargeable,
          coalesce(string_agg(distinct nullif(trim(r."chargeable_reason"), ''), '; '), '') as reason,
          coalesce(string_agg(nullif(trim(r."notes"), ''), E'\\n\\n' order by r."primary" desc, r."number"), '') as notes
        from "incidents"."report" r
        group by r."incident_id"
      ) c
      where c."incident_id" = i."id";
    `);
  }

  override down(): void {
  }

}
