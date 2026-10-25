import { Migration } from '@mikro-orm/migrations';

/** VOKeFw of 18.03.2016 (valid from 26.04.2016), as in `VOKEFW_2016_VEHICLE_RATES`. */
const RATES_2016: [string, number][] = [
  ['elw-1', 34], ['mtw', 20], ['kdow', 16], ['tsf', 43], ['tsf-w', 63], ['mlf', 83], ['lf-10', 120], ['lf-20', 170], ['lf-20-16', 184],
  ['lf-kats', 133], ['tlf-3000', 120], ['rw', 187], ['dlak-23-12', 264], ['gw-l1', 25], ['gw-l2', 54], ['wlf', 70],
];

export class Migration20261025052316_vokefw_2016 extends Migration {

  /** Saved vehicle rates get the 2016 rates for incidents before 19.03.2024, unless a category already has an older rate. */
  override up(): void {
    const values = RATES_2016.map(([category, amount]) => `('${category}', ${amount})`).join(', ');
    this.addSql(`update "core"."setting" s set "value" = jsonb_set(s."value", '{vehicleRates}', s."value"->'vehicleRates' || coalesce((
        select jsonb_agg(jsonb_build_object('category', r.category, 'validFrom', '2016-04-26', 'amount', r.amount))
        from (values ${values}) as r(category, amount)
        where not exists (select 1 from jsonb_array_elements(s."value"->'vehicleRates') e
          where e->>'category' = r.category and e->>'validFrom' < '2024-03-19')
      ), '[]'::jsonb))
      where s."section" = 'cost-recovery.general' and jsonb_typeof(s."value"->'vehicleRates') = 'array'`);
  }

  override down(): void {
    this.addSql(`update "core"."setting" s set "value" = jsonb_set(s."value", '{vehicleRates}', coalesce((
        select jsonb_agg(e) from jsonb_array_elements(s."value"->'vehicleRates') e where e->>'validFrom' <> '2016-04-26'
      ), '[]'::jsonb))
      where s."section" = 'cost-recovery.general' and jsonb_typeof(s."value"->'vehicleRates') = 'array'`);
  }

}
