import { BadRequestException } from '@nestjs/common';

/**
 * Frequent passwords of at least 10 characters (leaked password lists, German and English), lower case. Together with
 * the words below they catch the passwords a guesser tries first (L24).
 */
const COMMON_PASSWORDS = new Set([
  '1234567890', '0123456789', '0987654321', '1234512345', '1122334455', '1qaz2wsx3edc', 'zaq12wsxcde', '1q2w3e4r5t',
  '1q2w3e4r5t6y', 'q1w2e3r4t5', 'qwertyuiop', 'qwertzuiop', 'asdfghjkl1', 'asdfghjklö', 'yxcvbnm123', 'zxcvbnm123',
  'abcdefghij', 'abcdefg123', 'abc1234567', 'a1b2c3d4e5', 'iloveyou12', 'iloveyou123', 'trustno1234', 'passw0rd123',
  'p@ssw0rd123', 'pa55w0rd12', 'qwerty123456', 'qwertz123456', '123456789a', 'a123456789', '1234567890a', '123456789q',
  '1234qwer12', 'qwer123456', 'q123456789', 'aaaaaa1111', '11111111111', 'superman123', 'batman1234', 'hallo12345',
  'hallo123456', 'schatz1234', 'ficken1234', 'ichliebedich', 'ichliebedich1', 'lieblingsmensch', 'meinpasswort',
  'meinpasswort1', 'keinpasswort', 'neuespasswort', 'passwortneu1', 'startstart', 'startstart1', 'internet123',
  'computer123', 'whatever123', 'football123', 'fussball123', 'baseball123', 'basketball', 'basketball1',
  'sonnenschein', 'sonnenschein1', 'schmetterling', 'blumenwiese', 'gummibaerchen', 'schokolade1',
]);

/** Words that, with only digits or special characters added, make a weak password (e.g. „Feuerwehr112!“, „Sommer2026“). */
const COMMON_WORDS = new Set([
  'password', 'passwort', 'kennwort', 'passwd', 'admin', 'administrator', 'root', 'login', 'welcome', 'willkommen', 'hallo',
  'hello', 'geheim', 'secret', 'changeme', 'letmein', 'master', 'test', 'testtest', 'qwertz', 'qwerty', 'asdfgh', 'dragon',
  'monkey', 'sunshine', 'princess', 'starwars', 'pokemon', 'football', 'fussball', 'schalke', 'bayern', 'borussia', 'dortmund',
  'sommer', 'winter', 'herbst', 'fruehling', 'frühling', 'januar', 'februar', 'dezember', 'montag', 'freitag',
  'feuerwehr', 'feuerwehrmann', 'feuerwehrfrau', 'florian', 'einsatz', 'brandschutz', 'atemschutz', 'loeschzug',
  'löschzug', 'feuer', 'wasser', 'blaulicht', 'kommandant', 'gruppenfuehrer', 'gruppenführer', 'jugendfeuerwehr', 'forga',
  'f.orga', 'iloveyou', 'ichliebedich', 'schatz', 'schatzi', 'mausi', 'hase', 'familie', 'deutschland',
]);

/** Lower case without digits and special characters at the start and end, e.g. „Feuerwehr112!“ → „feuerwehr“. */
function core(value: string): string {
  return value.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
}

/** Only one character, or a run like `abcdefghij` or `9876543210`. */
function trivial(password: string): boolean {
  if (new Set(password).size <= 2) return true;
  const codes = [...password.toLowerCase()].map((c) => c.codePointAt(0) ?? 0);
  const steps = new Set(codes.slice(1).map((code, i) => code - codes[i]));
  return steps.size === 1 && [1, -1, 0].includes([...steps][0]);
}

/**
 * Why a new password is refused, or `null`: `auth.passwordCommon` (on the list of frequent passwords, a frequent word with
 * digits, or trivial), `auth.passwordPersonal` (the username, name or e-mail address with digits).
 */
export function passwordProblem(password: string, personal: readonly (string | null | undefined)[] = []): 'auth.passwordCommon' | 'auth.passwordPersonal' | null {
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || COMMON_WORDS.has(core(password)) || trivial(password)) return 'auth.passwordCommon';
  const own = personal.flatMap((value) => {
    const text = (value ?? '').toLowerCase().trim();
    return text.length >= 3 ? [core(text.split('@')[0]), ...text.split(/[\s.@_-]+/).filter((part) => part.length >= 4)] : [];
  });
  if (own.some((value) => value && core(password) === value)) return 'auth.passwordPersonal';
  return null;
}

/** Throws `400` with the code of `passwordProblem`. */
export function assertPasswordAllowed(password: string, personal: readonly (string | null | undefined)[] = []): void {
  const problem = passwordProblem(password, personal);
  if (problem) throw new BadRequestException({ code: problem });
}
