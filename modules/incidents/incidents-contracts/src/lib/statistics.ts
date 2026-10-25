import { z } from 'zod';

/**
 * Main type of an incident as counted in the annual statistics (F28, F33, F34, F37, F50, F51).
 * Ambulance and patient transport (F46–F49) are not services of a volunteer fire brigade and stay empty.
 */
export const MainType = z.enum(['fire', 'technical-assistance', 'false-alarm', 'other']);
export type MainType = z.infer<typeof MainType>;

/** F29–F32. */
export const FireSize = z.enum(['small-a', 'small-b', 'medium', 'large']);
export type FireSize = z.infer<typeof FireSize>;

/**
 * Technical assistance categories 1–8 (F38–F45) in order of precedence:
 * an incident with rescue of persons and hazardous materials counts as 1.
 */
export const TechnicalCategory = z.enum([
  'rescue-persons',
  'hazardous-materials',
  'oil-trace',
  'animal-rescue',
  'insects',
  'flood-weather',
  'storm',
  'other',
]);
export type TechnicalCategory = z.infer<typeof TechnicalCategory>;

/** F52–F54. */
export const FalseAlarmType = z.enum(['good-faith', 'malicious', 'fire-alarm-system']);
export type FalseAlarmType = z.infer<typeof FalseAlarmType>;

/** The category with the highest precedence among several that apply. */
export function technicalCategoryByPrecedence(categories: readonly TechnicalCategory[]): TechnicalCategory | null {
  return TechnicalCategory.options.find((c) => categories.includes(c)) ?? null;
}

const count = z.number().int().min(0).default(0);

/** Statistics features of a primary report (questions F26–F62 of the state template). */
export const IncidentStatistics = z
  .object({
    /** `false` = assistance in another municipality (Überlandhilfe). */
    ownMunicipality: z.boolean().default(true),
    mainType: MainType,
    fireSize: FireSize.nullable().default(null),
    technicalCategory: TechnicalCategory.nullable().default(null),
    falseAlarmType: FalseAlarmType.nullable().default(null),
    disasterPreAlarm: z.boolean().default(false),
    disasterOperation: z.boolean().default(false),
    rescued: count,
    /** Of the rescued persons, those with smoke inhalation. */
    rescuedSmokeInhalation: count,
    dead: count,
    vehicleFire: z.boolean().default(false),
    trafficAccident: z.boolean().default(false),
    animalsRescued: count,
  })
  .superRefine((s, ctx) => {
    const require = (condition: boolean, path: string) => {
      if (condition) ctx.addIssue({ code: 'custom', path: [path], message: `Required for main type ${s.mainType}` });
    };
    require(s.mainType === 'fire' && !s.fireSize, 'fireSize');
    require(s.mainType === 'technical-assistance' && !s.technicalCategory, 'technicalCategory');
    require(s.mainType === 'false-alarm' && !s.falseAlarmType, 'falseAlarmType');
    if (s.rescuedSmokeInhalation > s.rescued) {
      ctx.addIssue({ code: 'custom', path: ['rescuedSmokeInhalation'], message: 'More than rescued persons' });
    }
  });
export type IncidentStatistics = z.infer<typeof IncidentStatistics>;
export type IncidentStatisticsInput = z.input<typeof IncidentStatistics>;
