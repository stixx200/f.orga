import { useQueryClient } from '@tanstack/react-query';
import { LANGUAGES, type Language } from '@forga/core-contracts';
import { SESSION_QUERY_KEY, send, setLanguage, useTranslation } from '@forga/web-sdk';
import classes from './frame.module.css';

/** DE/EN switch; for a logged-in user the choice is stored in the profile and applies on every device. */
export function LanguageSwitch({ loggedIn, receiveDigest = true }: { loggedIn: boolean; receiveDigest?: boolean }) {
  const { t, i18n } = useTranslation('common');
  const queryClient = useQueryClient();
  const choose = async (language: Language) => {
    await setLanguage(language);
    if (loggedIn) {
      await send('PUT', 'core/profile', { language, receiveDigest });
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    }
  };
  return (
    <div className={classes.languageSwitch} role="group" aria-label={t('language.label')}>
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          aria-pressed={i18n.language === language}
          lang={language}
          title={t(`language.${language}`)}
          onClick={() => void choose(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
