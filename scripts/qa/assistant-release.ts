// Optional Staging build/start witness. Records are observations, NEVER gate overrides.
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export function loadReleaseEnvironment(root: string) {
  // @next/env is bundled CommonJS; Node 22 does not expose its named ESM exports.
  const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env');
  loadEnvConfig(root, false, { info() {}, error() {} });
}

const roots = ['.next', 'node_modules', 'public', 'next.config.mjs', 'package.json', 'package-lock.json', 'scripts/qa/assistant-release.ts'];
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
export type ReleaseReceipt = { version: 1; source: string; artifact: string; files: number; build: string; node: string; createdAt: string };
export function safeReceipt(receipt: ReleaseReceipt): ReleaseReceipt {
  const { version, source, artifact, files, build, node, createdAt } = receipt;
  return { version, source, artifact, files, build, node, createdAt };
}

export function artifactFingerprint(root: string, immutable = false, entries = roots) {
  const digest = createHash('sha256');
  let files = 0;
  function visit(relative: string) {
    const full = path.join(root, relative);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error('release_symlink');
    if (immutable && ((stat.mode & 0o022) !== 0 || stat.uid === process.getuid?.())) throw new Error('release_mutable_by_app');
    if (stat.isDirectory()) {
      for (const name of readdirSync(full).sort()) {
        if (name === '.bin' && (relative === 'node_modules' || (relative.startsWith('node_modules/') && relative.endsWith('/node_modules')))) continue; // npm shims only at dependency boundaries.
        if (relative === '.next' && ['cache', 'dev', 'diagnostics', 'trace', 'trace-build', 'qa-release-receipt.json'].includes(name)) continue;
        visit(`${relative}/${name}`);
      }
    } else {
      if (!stat.isFile()) throw new Error('release_special_file');
      digest.update(JSON.stringify([relative, hash(readFileSync(full))]) + '\n'); files++;
    }
  }
  if (immutable) {
    // Every ancestor must prevent the service user replacing a checked subtree.
    const directories = new Set<string>();
    for (const entry of entries) {
      let directory = path.dirname(path.join(root, entry));
      while (true) { directories.add(directory); const parent = path.dirname(directory); if (parent === directory) break; directory = parent; }
    }
    for (const directory of directories) {
      const stat = lstatSync(directory);
      if (stat.isSymbolicLink() || stat.uid === process.getuid?.() || (stat.mode & 0o022) !== 0) throw new Error('release_root_mutable');
    }
  }
  for (const entry of entries) visit(entry);
  return { artifact: digest.digest('hex'), files };
}

export function verifyReceipt(receipt: ReleaseReceipt, actual: ReturnType<typeof artifactFingerprint>, build: string, node: string) {
  if (![receipt.source, receipt.artifact, receipt.build, receipt.node, receipt.createdAt].every(value => typeof value === 'string') || !Number.isSafeInteger(receipt.files)) throw new Error('release_receipt_mismatch');
  if (receipt.version !== 1 || !/^[a-f0-9]{40}$/.test(receipt.source) || !/^[a-f0-9]{64}$/.test(receipt.artifact) || receipt.artifact !== actual.artifact || receipt.files !== actual.files || receipt.build !== hash(build) || receipt.node !== node || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.createdAt) || !Number.isFinite(Date.parse(receipt.createdAt))) throw new Error('release_receipt_mismatch');
}

async function main() {
  const root = realpathSync(process.cwd());
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['record', 'check', 'start'].includes(mode)) throw new Error('release_usage');
  if (mode === 'record') {
    const options = { cwd: root, encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'], env: { PATH: process.env.PATH, NODE_ENV: 'production' as const, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } };
    if (execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain'], options).trim()) throw new Error('reviewed_clean_checkout_required');
    const source = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], options).trim();
    if (!/^[a-f0-9]{40}$/.test(source)) throw new Error('source_required');
    const actual = artifactFingerprint(root);
    const receipt: ReleaseReceipt = { version: 1, source, ...actual, build: hash(readFileSync('.next/BUILD_ID')), node: hash(readFileSync(process.execPath)), createdAt: new Date().toISOString() };
    writeFileSync('.next/qa-release-receipt.json', JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ operation: 'record', ...receipt }));
    return;
  }
  // Check/start require a non-root Linux service user and a release not writable by it.
  if (process.platform !== 'linux' || process.getuid?.() === 0) throw new Error('linux_service_user_required');
  const receipt = safeReceipt(JSON.parse(readFileSync('.next/qa-release-receipt.json', 'utf8')) as ReleaseReceipt);
  verifyReceipt(receipt, artifactFingerprint(root, true), readFileSync('.next/BUILD_ID', 'utf8'), hash(readFileSync(process.execPath)));
  // Receipt itself must also be protected against replacement/editing by the app.
  const receiptStat = lstatSync('.next/qa-release-receipt.json');
  const nextStat = lstatSync('.next');
  if ([receiptStat, nextStat].some(stat => stat.isSymbolicLink() || stat.uid === process.getuid?.() || (stat.mode & 0o022) !== 0)) throw new Error('receipt_mutable');
  if (mode === 'check') { console.log(JSON.stringify({ operation: 'check', ...receipt, authorization: 'NONE' })); return; }
  // Same installed dotenv loader as Next; never source shell code or print values.
  loadReleaseEnvironment(root);
  if (process.env.NODE_OPTIONS || process.env.APP_ENV !== 'staging' || process.env.APP_BASE_URL !== 'https://staging.clinicontrol.mx' || process.env.APPOINTMENT_OUTBOUND_MODE !== 'isolated') throw new Error('isolated_staging_process_environment_required');
  const procStat = readFileSync('/proc/self/stat', 'utf8');
  const witness = { operation: 'startup', ...receipt, pid: process.pid, parentPid: process.ppid, startTicks: procStat.slice(procStat.lastIndexOf(')') + 2).split(' ')[19], boot: hash(readFileSync('/proc/sys/kernel/random/boot_id')), nonce: randomUUID(), startedAt: new Date().toISOString(), directory: hash(root), authorization: 'NONE' };
  console.log(JSON.stringify(witness));
  // next start runs the serving process in this same PID (no npm wrapper).
  const cli = path.join(root, 'node_modules/next/dist/bin/next');
  process.argv = [process.execPath, cli, 'start', '--hostname', '127.0.0.1', '--port', '3000'];
  await import(pathToFileURL(cli).href);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('RELEASE WITNESS: BLOCKED (validation_or_start_failed)'); process.exitCode = 2; });
}
