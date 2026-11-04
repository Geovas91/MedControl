// Operator-only Linux observer. No application imports, network, PM2 CLI or writes.
import { readFileSync, realpathSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const keys = [
  'APP_ENV', 'APP_BASE_URL', 'PORT', 'NEXT_PUBLIC_SUPABASE_URL',
  'APPOINTMENT_ASSISTANT_LLM_ENABLED', 'APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED',
  'WHATSAPP_OUTBOUND_ENABLED', 'WHATSAPP_PROVIDER', 'WHATSAPP_GRAPH_API_VERSION',
  'META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_APP_SECRET', 'META_WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'META_WHATSAPP_WABA_ID', 'META_WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TOKEN_ENCRYPTION_KEY',
  'EMAIL_PROVIDER', 'EMAIL_REQUIRED', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'SUPPORT_EMAIL_TO',
  'RESEND_API_KEY', 'APPOINTMENT_AUTOMATION_CRON_SECRET', 'OPENAI_API_KEY',
  'GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REDIRECT_URI',
  'CALENDAR_TOKEN_ENCRYPTION_KEY', 'SUPABASE_SERVICE_ROLE_KEY'
] as const;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const read = (file: string) => { try { return readFileSync(file); } catch { return null; } };
const real = (file: string) => { try { return realpathSync(file); } catch { return null; } };

export function environmentPresence(raw: Buffer | null) {
  // Never echo values, unknown keys, exception text, or even hashes of secrets.
  const names = raw ? new Set(raw.toString().split('\0').filter(entry => entry.indexOf('=') > 0).map(entry => entry.slice(0, entry.indexOf('=')))) : null;
  return Object.fromEntries(keys.map(key => [key, names ? names.has(key) ? 'SET' : 'NOT_SET' : 'UNKNOWN']));
}

export function processStat(raw: Buffer | null) {
  // comm may contain spaces/parentheses or private text. Do not emit it.
  const fields = raw?.toString().slice(raw.toString().lastIndexOf(')') + 2).trim().split(/\s+/);
  if (!fields || !/^[RSDZTtWXxIP]$/.test(fields[0]) || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[19])) return null;
  return { state: fields[0], parentPid: Number(fields[1]), startTicks: fields[19] };
}

export function collectRuntimeEvidence(root: string, pid: number, proc = '/proc') {
  if (!path.isAbsolute(root) || !Number.isSafeInteger(pid) || pid < 1) throw new Error('invalid_scope');
  const started = new Date().toISOString();
  const canonical = real(root);
  if (!canonical) throw new Error('unavailable_root');
  const procPath = path.join(proc, String(pid));
  const before = processStat(read(path.join(procPath, 'stat')));
  const artifacts = ['BUILD_ID', 'required-server-files.json', 'routes-manifest.json', 'build-manifest.json'];
  const snapshot = () => Object.fromEntries(artifacts.map(name => {
    const content = read(path.join(canonical, '.next', name));
    return [name, content ? digest(content) : null];
  }));
  const build = snapshot();
  let sha: string | null = null;
  try {
    const value = execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', canonical, 'rev-parse', '--verify', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, env: { PATH: process.env.PATH, NODE_ENV: 'production', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
    if (/^[a-f0-9]{40}$/.test(value)) sha = value;
  } catch { /* Unknown, never include stderr. */ }
  const cwd = real(path.join(procPath, 'cwd'));
  const environment = environmentPresence(read(path.join(procPath, 'environ')));
  let processes: { pid: number; parentPid: number; state: string; startTicks: string }[] | null = null;
  try {
    processes = readdirSync(proc).filter(name => /^\d+$/.test(name)).flatMap(name => {
      const stat = processStat(read(path.join(proc, name, 'stat')));
      return stat ? [{ pid: Number(name), ...stat }] : [];
    });
  } catch { /* Visibility remains incomplete. */ }
  const after = processStat(read(path.join(procPath, 'stat')));
  const buildAfter = snapshot();
  return {
    schema: 1, collectedAt: started, completedAt: new Date().toISOString(),
    sources: ['local_git_HEAD', 'local_next_artifact_hashes', 'linux_proc_stat_cwd_environ'],
    checkout: { sha, rootSha256: digest(canonical) },
    build: { sha256: build, stableDuringCollection: JSON.stringify(build) === JSON.stringify(buildAfter), provenance: 'UNKNOWN' },
    process: { pid, observation: before, stableDuringCollection: before !== null && JSON.stringify(before) === JSON.stringify(after),
      cwdMatchesCheckout: cwd === null ? null : cwd === canonical, cwdSha256: cwd ? digest(cwd) : null,
      environment, environmentScope: 'initial_proc_environment_only_not_effective_dotenv',
      directChildren: processes?.filter(item => item.parentPid === pid) ?? null },
    // These observations cannot attest loaded code, reverse-proxy routing or worker coverage.
    deploymentIdentity: 'UNKNOWN', whatsappIsolation: 'UNKNOWN', otherOutboundChannels: 'UNKNOWN',
    backgroundWorkers: 'UNKNOWN', pm2Identity: 'UNKNOWN', runtimeBuildRelationship: 'UNKNOWN',
    readyForLiveMutations: false
  };
}

if (process.argv[1] === '-' || (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)) {
  try {
    if (process.platform !== 'linux' || process.argv.length !== 4 || !/^[1-9]\d*$/.test(process.argv[3])) throw new Error('unsupported');
    console.log(JSON.stringify(collectRuntimeEvidence(process.argv[2], Number(process.argv[3])), null, 2));
  } catch {
    console.error('RUNTIME EVIDENCE: BLOCKED (scope_or_observation_unavailable)');
    process.exitCode = 2;
  }
}
