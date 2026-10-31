/**
 * Backups of f.orga (`*.forgabackup`) without a running f.orga, e.g. on another computer.
 *
 *   pnpm run backup -- info <file>                 header: installation, version, time, encryption
 *   pnpm run backup -- decrypt <file> [<folder>]   decrypts and unpacks into <folder> (default: <file> without extension):
 *                                                 manifest.json, database.dump (pg_dump custom format), plugins.tgz,
 *                                                 settings.json; checks all checksums
 *
 * The passphrase comes from FORGA_BACKUP_PASSPHRASE or is asked for. Restoring the dump by hand:
 *   createdb forga && pg_restore --no-owner --dbname forga <folder>/database.dump
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { type EntrySink, openBackupFile, readFileHeader, readPayload } from '@forga/backup-api';

const [command, file, folder] = process.argv.slice(2);

/** Asks for the passphrase without echoing it. */
async function askPassphrase(): Promise<string> {
  if (process.env.FORGA_BACKUP_PASSPHRASE) return process.env.FORGA_BACKUP_PASSPHRASE;
  process.stdout.write('Passphrase: ');
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    const line = await new Promise<string>((resolve) => rl.once('line', resolve));
    rl.close();
    return line;
  }
  // Raw mode: the characters are not echoed.
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let answer = '';
  for await (const chunk of process.stdin) {
    const text = String(chunk);
    if (text === '\u0003') process.exit(130);
    if (text === '\r' || text === '\n') break;
    answer = text === '\u007f' ? answer.slice(0, -1) : answer + text;
  }
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write('\n');
  return answer;
}

function fileSink(path: string): EntrySink {
  const out = createWriteStream(path, { mode: 0o600 });
  return {
    async write(chunk) {
      if (!out.write(chunk)) await once(out, 'drain');
    },
    async end() {
      out.end();
      await once(out, 'finish');
    },
  };
}

if (command === 'info' && file) {
  const header = await readFileHeader(file);
  if (!header) {
    console.error(`${file} is not a backup of f.orga.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ ...header, encryption: header.encryption ? { cipher: header.encryption.cipher, kdf: header.encryption.kdf } : null }, null, 2));
} else if (command === 'decrypt' && file) {
  const header = await readFileHeader(file);
  if (!header) {
    console.error(`${file} is not a backup of f.orga.`);
    process.exit(1);
  }
  const passphrase = header.encryption ? await askPassphrase() : null;
  const target = folder ?? file.replace(/\.forgabackup$/, '');
  mkdirSync(target, { recursive: true });
  try {
    const { payload } = await openBackupFile(file, passphrase);
    const entries = await readPayload(payload, (name) => {
      if (!/^[a-z0-9.-]+$/i.test(name)) throw new Error(`Unexpected entry ${name}`);
      return fileSink(join(target, name));
    });
    for (const [name, { size }] of Object.entries(entries)) console.log(`${join(target, name)} (${size} bytes)`);
    console.log('All checksums match.');
  } catch (error) {
    console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else {
  console.log('Usage: pnpm run backup -- info <file> | decrypt <file> [<folder>]');
  process.exit(command ? 1 : 0);
}
