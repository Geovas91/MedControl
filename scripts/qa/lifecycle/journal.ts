import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Journal, JournalStore, Scope } from './contracts.ts';
import { requireQa } from './contracts.ts';

export function newJournal(scope: Scope, now = new Date()): Journal {
  const run = randomUUID();
  // Reserved fictional NANP 555-01xx range. Isolation is still mandatory.
  const suffix = String(parseInt(run.slice(0, 4), 16) % 100).padStart(2, '0');
  return { version: 1, run, startedAt: now.toISOString(), scope, patientName: `QAauto R${run.replaceAll('-', '')}`, phone: `+120255501${suffix}`, appointments: [], proposals: [], step: 'planned', state: 'running', revision: 0 };
}
function inside(parent: string, candidate: string) { const rel = path.relative(parent, candidate); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }

/** Encrypted, atomic and exclusively locked journal. Never stores credentials,
 * cookies, provider data or clinical content. No silent create/resume retries. */
export function openJournal(options: { directory?: string; key: string; initial?: Journal; run?: string; repository?: string }): JournalStore & { close(): void; file: string } {
  const key = Buffer.from(options.key, 'base64');
  requireQa(key.length === 32 && key.toString('base64') === options.key, 'journal_key_invalid');
  const directory = path.resolve(options.directory ?? path.join(homedir(), '.clinicontrol-qa'));
  requireQa(!inside(realpathSync(options.repository ?? process.cwd()), directory), 'journal_inside_repository');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  requireQa(!inside(realpathSync(options.repository ?? process.cwd()), realpathSync(directory)), 'journal_symlink_into_repository');
  const run = options.initial?.run ?? options.run;
  requireQa(typeof run === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run), 'journal_run_invalid');
  const file = path.join(directory, `${run}.assistant-qa-journal`);
  // A crash leaves the lock deliberately. Operator recovery must first verify
  // the prior process is stopped; never steal a possibly active runner lock.
  const lock = openSync(`${file}.lock`, 'wx', 0o600);
  let value: Journal;
  function persist(next: Journal) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(run!));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()]);
    const temporary = `${file}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') })); fsyncSync(fd); }
    finally { closeSync(fd); }
    renameSync(temporary, file);
    value = structuredClone(next);
  }
  try {
    if (options.initial) {
      requireQa(!existsSync(file), 'journal_already_exists');
      persist(options.initial);
    } else {
      requireQa(!lstatSync(file).isSymbolicLink(), 'journal_symlink');
      const envelope = JSON.parse(readFileSync(file, 'utf8'));
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from(run!)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8')) as Journal;
      requireQa(value.version === 1 && value.run === run && value.patientName === `QAauto R${run!.replaceAll('-', '')}` && Array.isArray(value.appointments) && Array.isArray(value.proposals), 'journal_invalid');
    }
  } catch (error) { closeSync(lock); unlinkSync(`${file}.lock`); throw error; }
  return {
    file, read: () => structuredClone(value),
    save(next) {
      requireQa(next.run === value.run && next.revision === value.revision + 1 && JSON.stringify(next.scope) === JSON.stringify(value.scope) && next.patientName === value.patientName && next.startedAt === value.startedAt && next.phone === value.phone, 'journal_identity_changed');
      persist(next);
    },
    close() { closeSync(lock); unlinkSync(`${file}.lock`); }
  };
}
