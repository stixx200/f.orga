import { defineKioskModule } from '@forga/web-sdk';
import { translations } from './i18n';
import { NoticePage } from './pages/NoticePage';

/** The privacy notice without sign-in, served by the shell at `/privacy-notice` (manifest `frontend.kiosk`). */
export default defineKioskModule({ translations, component: NoticePage });
