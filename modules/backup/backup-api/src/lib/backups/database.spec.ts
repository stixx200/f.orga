import { forbiddenEntries } from './database.js';

const LIST = `;
; Archive created at 2026-10-29 17:00:00 UTC
6; 2615 4168061 SCHEMA - core forga
245; 1259 4168180 SEQUENCE core privacy_notice_version_seq forga
4535; 0 0 SEQUENCE OWNED BY core privacy_notice_version_seq forga
231; 1259 4168053 SEQUENCE public forga_migrations_id_seq forga
3689; 2604 4168184 DEFAULT core privacy_notice version forga
300; 1259 4168070 TABLE core user forga
4400; 0 4168070 TABLE DATA core user forga
4538; 0 0 SEQUENCE SET core privacy_notice_version_seq forga
4000; 2606 4168300 CONSTRAINT core user user_pkey forga
4100; 1259 4168400 INDEX core session_expires_at_index forga
4200; 2606 4168500 FK CONSTRAINT core role_assignment role_assignment_user_id_foreign forga
`;

describe('forbiddenEntries', () => {
  it('accepts the table of contents of a dump of f.orga', () => {
    expect(forbiddenEntries(LIST)).toEqual([]);
  });

  it('refuses functions, triggers, extensions, privileges and system schemas', () => {
    const evil = [
      '500; 1255 4169000 FUNCTION public run(text) forga',
      '501; 2620 4169001 TRIGGER core user audit forga',
      '502; 3079 4169002 EXTENSION - plpython3u',
      '503; 0 0 ACL core TABLE user forga',
      '504; 3466 4169003 EVENT TRIGGER - takeover forga',
      '505; 2615 4169004 SCHEMA - pg_temp_9 forga',
      '506; 1259 4169005 TABLE pg_catalog pg_authid forga',
    ];
    expect(forbiddenEntries(`${LIST}${evil.join('\n')}\n`)).toEqual(evil);
  });
});
