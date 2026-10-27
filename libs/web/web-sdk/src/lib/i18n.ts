import { createInstance, type i18n as I18n, type Resource } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, type Language, LANGUAGES, type LocalizedText } from '@forga/core-contracts';
import { common } from './common.i18n';

const STORAGE_KEY = 'forga.language';

function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(value as Language) ? (value as Language) : null;
  } catch {
    return null;
  }
}

function browserLanguage(): Language {
  const preferred = navigator.language.slice(0, 2);
  return LANGUAGES.includes(preferred as Language) ? (preferred as Language) : DEFAULT_LANGUAGE;
}

/**
 * The single i18next instance of the application, so the shell and all module frontends switch language together.
 * Module Federation shares this package, but a production build of a module frontend may still evaluate its own copy;
 * the instance therefore lives on `globalThis`, and a later copy neither creates nor binds a second one (that would
 * leave React with an instance without the texts of the shell and the other modules).
 */
const shared = globalThis as typeof globalThis & { forgaI18n?: I18n };
export const i18n: I18n = shared.forgaI18n ?? createInstance();

if (!shared.forgaI18n) {
  shared.forgaI18n = i18n;
  void i18n.use(initReactI18next).init({
    lng: storedLanguage() ?? browserLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...LANGUAGES],
    ns: ['common'],
    defaultNS: 'common',
    resources: { de: { common: common.de }, en: { common: common.en } },
    interpolation: { escapeValue: false },
  });
}

/** Translations of one namespace (the module ID) in every supported language. */
export type Translations = Record<Language, Record<string, unknown>>;

export function addTranslations(namespace: string, translations: Translations): void {
  for (const language of LANGUAGES) {
    i18n.addResourceBundle(language, namespace, translations[language], true, true);
  }
}

export function currentLanguage(): Language {
  return (LANGUAGES.includes(i18n.language as Language) ? i18n.language : DEFAULT_LANGUAGE) as Language;
}

/** Switches the UI language and remembers it in this browser. */
export async function setLanguage(language: Language): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage may be unavailable (private mode); the language still applies to this page.
  }
  await i18n.changeLanguage(language);
}

/** Picks the current language from a text the server provides in every language. */
export function useLocalized(): (text: LocalizedText) => string {
  const { i18n: instance } = useTranslation();
  return (text) => text[(instance.language as Language) ?? DEFAULT_LANGUAGE] ?? text[DEFAULT_LANGUAGE];
}

export { useTranslation };
export type { Resource };
