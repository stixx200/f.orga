import { defineKioskModule } from '@forga/web-sdk';
import { Kiosk } from './kiosk/Kiosk';
import { kioskTranslations } from './kiosk/i18n';

/** Kiosk page of the info terminal, served by the shell at `/terminal` without frame and login. */
export default defineKioskModule({
  translations: kioskTranslations,
  component: Kiosk,
});
