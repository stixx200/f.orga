import { z } from 'zod';

export const LANGUAGES = ['de', 'en'] as const;
export const Language = z.enum(LANGUAGES);
export type Language = z.infer<typeof Language>;
export const DEFAULT_LANGUAGE: Language = 'de';

/**
 * Text that the server hands to the UI in every supported language,
 * e.g. module and permission names from a module manifest.
 */
export const LocalizedText = z.object({ de: z.string().min(1), en: z.string().min(1) });
export type LocalizedText = z.infer<typeof LocalizedText>;
