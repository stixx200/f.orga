/** Texts of the logins as a user (L15) and the security settings. Keep both languages in sync. */
export const transparencyDe = {
  impersonations: {
    title: 'Anmeldungen als Sie',
    intro: 'Administratoren können zur Hilfe Ihre Sicht prüfen („Anmelden als“). Das sehen Sie hier.',
    none: 'Bisher hat sich niemand als Sie angemeldet.',
    columns: { date: 'Datum', administrator: 'Administrator', reason: 'Grund' },
    running: 'läuft',
  },
  security: {
    notifyImpersonation: 'Benutzer bei „Anmelden als“ benachrichtigen',
    notifyImpersonationHint: 'Der Benutzer bekommt eine E-Mail mit Administrator und Grund. In Mein Profil sieht er alle Anmeldungen als er.',
  },
};

export const transparencyEn: typeof transparencyDe = {
  impersonations: {
    title: 'Logins as you',
    intro: 'Administrators can check your view to help you (“log in as”). You see it here.',
    none: 'Nobody has logged in as you so far.',
    columns: { date: 'Date', administrator: 'Administrator', reason: 'Reason' },
    running: 'running',
  },
  security: {
    notifyImpersonation: 'Notify users of “log in as”',
    notifyImpersonationHint: 'The user gets an e-mail with administrator and reason. In My profile the user sees all logins as them.',
  },
};

