import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { expectedRuntimeScope, runtimeTrustPolicy } from './runtime-trust-policy.ts';

export const evidenceDomain = 'clinicontrol-independent-runtime-v1\0';
const coverageScopes = ['pm2_all_users', 'systemd_all_users', 'cron_all_users', 'containers', 'supabase_schedulers', 'external_senders'] as const;
type Release = { commit: string; artifact: string; build: string; node: string; provenance: string };
type ProcessIdentity = { pid: number; uid: number; startTicks: string; boot: string; cwd: string; artifact: string; node: string; launcher: string };
type Workload = { id: string; kind: 'app' | 'worker' | 'cron' | 'external'; state: 'online' | 'stopped' | 'paused'; pid: number; artifact: string; mode: 'isolated' | 'none'; whatsapp: 'guarded' | 'egress_denied' | 'none'; source: string };
export type RuntimeEvidence = {
  schema: 1; nonce: string; audience: 'assistant-lifecycle'; origin: string; project: string; host: string; issuedAt: number; expiresAt: number;
  release: Release; before: ProcessIdentity; after: ProcessIdentity; sampledAt: [number, number];
  pm2: { name: string; pid: number; cwd: string; launcher: string; state: 'online' };
  listener: { pid: number; address: '127.0.0.1'; port: 3000 };
  proxy: { origin: string; upstream: '127.0.0.1:3000'; config: string };
  isolation: { mode: 'isolated'; email: 'disabled'; policy: string; proof: string };
  inventory: string; coverage: { scope: string; source: string }[]; workloads: Workload[];
};
export type RuntimeTrustPolicy = {
  endpoint: string; keyId: string; publicKey: string; keyNotBefore: number; keyNotAfter: number;
  origin: string; project: string; host: string; release: Release; cwd: string; launcher: string; proxyConfig: string; isolationPolicy: string; inventory: string;
  workloads: { id: string; kind: Workload['kind']; state: Workload['state'] }[];
};
export type EvidenceAssessment = { state: 'verified' | 'rejected'; reason: string; expiresAt?: number; binding?: string };
type RuntimeProof = Readonly<{ readonly kind: 'independent-runtime-proof' }>;
const proofs = new WeakMap<object, { origin: string; project: string; expiresAt: number; acquiredAt: number; monotonicDeadline: number; binding: string }>();
const hex = (value: unknown, length = 64) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown, keys: string) => object(value) && Object.keys(value).sort().join(',') === keys.split(',').sort().join(',');
const fail = (reason: string): EvidenceAssessment => ({ state: 'rejected', reason });

function validPolicy(policy: RuntimeTrustPolicy, now: number) {
  try {
    const endpoint = new URL(policy.endpoint);
    const key = createPublicKey(policy.publicKey);
    return endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash &&
      endpoint.origin !== policy.origin && endpoint.origin !== policy.project &&
      policy.origin === expectedRuntimeScope.origin && policy.project === expectedRuntimeScope.project && policy.release.commit === expectedRuntimeScope.commit &&
      /^[a-zA-Z0-9_-]{1,48}$/.test(policy.keyId) && key.asymmetricKeyType === 'ed25519' &&
      Number.isSafeInteger(policy.keyNotBefore) && Number.isSafeInteger(policy.keyNotAfter) && policy.keyNotBefore <= now && now < policy.keyNotAfter &&
      [policy.host, policy.cwd, policy.launcher, policy.proxyConfig, policy.isolationPolicy, policy.inventory, policy.release.artifact, policy.release.build, policy.release.node, policy.release.provenance].every(value => hex(value)) &&
      policy.workloads.length > 0 && policy.workloads.length <= 64 && new Set(policy.workloads.map(item => item.id)).size === policy.workloads.length &&
      policy.workloads.every(item => /^[a-zA-Z0-9_-]{1,64}$/.test(item.id) && ['app', 'worker', 'cron', 'external'].includes(item.kind) && ['online', 'paused', 'stopped'].includes(item.state)) &&
      policy.workloads.filter(item => item.kind === 'app' && item.id === 'clinicontrol-staging-qa' && item.state === 'online').length === 1;
  } catch { return false; }
}

/** Pure cryptographic/semantic assessment. Its returned JSON NEVER authorizes a
 * gate. Only the private proof minted by the fixed-policy acquisition path can.
 */
export function assessSignedRuntimeEvidence(envelope: unknown, nonce: string, policy: RuntimeTrustPolicy, now = Date.now(), requestedAt = now - 30_000): EvidenceAssessment {
  try {
    if (!validPolicy(policy, now)) return fail('trust_policy_invalid');
    if (!/^[a-f0-9]{64}$/.test(nonce) || !exact(envelope, 'keyId,payload,signature')) return fail('envelope_invalid');
    const env = envelope as Record<string, unknown>;
    if (env.keyId !== policy.keyId || typeof env.payload !== 'string' || typeof env.signature !== 'string' || env.payload.length > 24000) return fail('envelope_invalid');
    const bytes = Buffer.from(env.payload, 'base64url'), signature = Buffer.from(env.signature, 'base64url');
    if (bytes.length > 16384 || bytes.toString('base64url') !== env.payload || signature.length !== 64 || signature.toString('base64url') !== env.signature ||
      !verify(null, Buffer.concat([Buffer.from(evidenceDomain), bytes]), createPublicKey(policy.publicKey), signature)) return fail('signature_invalid');
    const text = bytes.toString('utf8');
    const raw: unknown = JSON.parse(text);
    if (JSON.stringify(raw) !== text || !exact(raw, 'schema,nonce,audience,origin,project,host,issuedAt,expiresAt,release,before,after,sampledAt,pm2,listener,proxy,isolation,inventory,coverage,workloads')) return fail('evidence_schema_invalid');
    const e = raw as unknown as RuntimeEvidence;
    if (e.schema !== 1 || e.nonce !== nonce || e.audience !== 'assistant-lifecycle' || e.origin !== policy.origin || e.project !== policy.project || e.host !== policy.host) return fail('evidence_scope_mismatch');
    if (![requestedAt, e.issuedAt, e.expiresAt].every(Number.isSafeInteger) || e.issuedAt < requestedAt || e.issuedAt > now || now - e.issuedAt > 30_000 || e.expiresAt <= now || e.expiresAt - e.issuedAt > 30_000 || e.expiresAt > policy.keyNotAfter) return fail('evidence_expired');
    if (!exact(e.release, 'commit,artifact,build,node,provenance') || Object.entries(policy.release).some(([key, value]) => e.release[key as keyof Release] !== value)) return fail('release_mismatch');
    const processKeys = 'pid,uid,startTicks,boot,cwd,artifact,node,launcher';
    if (!exact(e.before, processKeys) || !exact(e.after, processKeys) || Object.keys(e.before).some(key => e.before[key as keyof ProcessIdentity] !== e.after[key as keyof ProcessIdentity]) ||
      !Number.isSafeInteger(e.before.pid) || e.before.pid < 1 || !Number.isSafeInteger(e.before.uid) || e.before.uid < 1 || typeof e.before.startTicks !== 'string' || !/^[1-9]\d*$/.test(e.before.startTicks) || !hex(e.before.boot) ||
      e.before.cwd !== policy.cwd || e.before.artifact !== policy.release.artifact || e.before.node !== policy.release.node || e.before.launcher !== policy.launcher) return fail('process_mismatch');
    if (!Array.isArray(e.sampledAt) || e.sampledAt.length !== 2 || !e.sampledAt.every(Number.isSafeInteger) || e.sampledAt[0] < e.issuedAt || e.sampledAt[1] - e.sampledAt[0] < 1000 || e.sampledAt[1] > now) return fail('process_stability_unverified');
    if (!exact(e.pm2, 'name,pid,cwd,launcher,state') || e.pm2.name !== 'clinicontrol-staging-qa' || e.pm2.pid !== e.before.pid || e.pm2.cwd !== policy.cwd || e.pm2.launcher !== policy.launcher || e.pm2.state !== 'online' ||
      !exact(e.listener, 'pid,address,port') || e.listener.pid !== e.before.pid || e.listener.address !== '127.0.0.1' || e.listener.port !== 3000 ||
      !exact(e.proxy, 'origin,upstream,config') || e.proxy.origin !== policy.origin || e.proxy.upstream !== '127.0.0.1:3000' || e.proxy.config !== policy.proxyConfig) return fail('serving_binding_mismatch');
    if (!exact(e.isolation, 'mode,email,policy,proof') || e.isolation.mode !== 'isolated' || e.isolation.email !== 'disabled' || e.isolation.policy !== policy.isolationPolicy || !hex(e.isolation.proof)) return fail('isolation_unverified');
    if (e.inventory !== policy.inventory || !Array.isArray(e.coverage) || e.coverage.length !== coverageScopes.length || new Set(e.coverage.map(item => item.scope)).size !== coverageScopes.length ||
      e.coverage.some(item => !exact(item, 'scope,source') || !coverageScopes.includes(item.scope as typeof coverageScopes[number]) || !hex(item.source))) return fail('inventory_coverage_incomplete');
    if (!Array.isArray(e.workloads) || e.workloads.length !== policy.workloads.length || new Set(e.workloads.map(item => item.id)).size !== e.workloads.length) return fail('workload_inventory_mismatch');
    for (const workload of e.workloads) {
      const approved = policy.workloads.find(item => item.id === workload.id);
      if (!exact(workload, 'id,kind,state,pid,artifact,mode,whatsapp,source') || !approved || workload.kind !== approved.kind || workload.state !== approved.state || !hex(workload.source)) return fail('workload_inventory_mismatch');
      if (workload.state === 'online') {
        if (!['app', 'worker'].includes(workload.kind) || !Number.isSafeInteger(workload.pid) || workload.pid < 1 || workload.artifact !== policy.release.artifact || workload.mode !== 'isolated' || !['guarded', 'egress_denied'].includes(workload.whatsapp) ||
          workload.kind === 'app' && workload.pid !== e.before.pid) return fail('sender_isolation_unverified');
      } else if (!['paused', 'stopped'].includes(workload.state) || workload.pid !== 0 || workload.artifact !== 'none' || workload.mode !== 'none' || workload.whatsapp !== 'none') return fail('sender_isolation_unverified');
    }
    // Exclude per-request timestamps/source digests, retain every serving and
    // sender identity/control. A restart or changed control breaks continuity.
    const binding = createHash('sha256').update(JSON.stringify([e.host, e.release, e.before, e.pm2, e.listener, e.proxy, e.isolation.policy, e.inventory,
      e.workloads.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'source'))).sort((a, b) => String(a.id).localeCompare(String(b.id)))],
    (_key, value) => object(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value)).digest('hex');
    return { state: 'verified', reason: 'independent_signed_runtime_evidence', expiresAt: e.expiresAt, binding };
  } catch { return fail('evidence_invalid'); }
}

/** No arguments on purpose: caller cannot select a key, policy, URL or receipt.
 * The authority must freshly collect evidence for this nonce, outside the app's
 * control. No provisioned trust root means no network and no authorization.
 */
export async function acquireTrustedRuntimeProof(): Promise<{ proof?: RuntimeProof; reason: string }> {
  const policy = runtimeTrustPolicy;
  if (!policy) return { reason: 'independent_authority_not_provisioned' };
  if (!validPolicy(policy, Date.now())) return { reason: 'trust_policy_invalid' };
  try {
    const requestedAt = Date.now();
    const nonce = randomBytes(32).toString('hex'), url = new URL(policy.endpoint);
    url.searchParams.set('nonce', nonce);
    const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
    if (!response.ok || !response.body) return { reason: 'independent_authority_unavailable' };
    const reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 32768) { await reader.cancel(); return { reason: 'evidence_size_rejected' }; } chunks.push(part.value); }
    const assessment = assessSignedRuntimeEvidence(JSON.parse(Buffer.concat(chunks).toString('utf8')), nonce, policy, Date.now(), requestedAt);
    if (assessment.state !== 'verified' || assessment.expiresAt === undefined || !assessment.binding) return { reason: assessment.reason };
    const proof: RuntimeProof = Object.freeze({ kind: 'independent-runtime-proof' });
    const acquiredAt = Date.now();
    proofs.set(proof, { origin: policy.origin, project: policy.project, expiresAt: assessment.expiresAt, acquiredAt, monotonicDeadline: performance.now() + assessment.expiresAt - acquiredAt, binding: assessment.binding });
    return { proof, reason: assessment.reason };
  } catch { return { reason: 'independent_authority_unavailable' }; }
}

export function authenticRuntimeProof(proof: unknown, origin: string): boolean {
  return runtimeProofDeadline(proof, origin) !== undefined;
}

export function runtimeProofDeadline(proof: unknown, origin: string): number | undefined {
  if (!object(proof)) return undefined;
  const entry = proofs.get(proof);
  const now = Date.now();
  if (!entry || entry.origin !== origin || entry.project !== expectedRuntimeScope.project) return undefined;
  if (now < entry.acquiredAt || entry.expiresAt <= now || performance.now() >= entry.monotonicDeadline) { proofs.delete(proof); return undefined; }
  return entry.expiresAt;
}

export function runtimeProofBinding(proof: unknown, origin: string): string | undefined {
  return runtimeProofDeadline(proof, origin) !== undefined ? proofs.get(proof as object)?.binding : undefined;
}

/** A session never silently rebinds to a new process/control set. No JSON or
 * assessment can populate its private permit; only an acquired live proof can.
 * New explicit recovery starts a new session, retaining the durable journal.
 */
export class RuntimeSession {
  #binding?: string;
  #changed = false;
  #latest?: unknown;
  #permit?: unknown;
  clear() { this.#latest = undefined; this.#permit = undefined; }
  observe(proof: unknown): 'observed' | 'unavailable' | 'changed' {
    this.clear();
    if (this.#changed) return 'changed';
    const binding = runtimeProofBinding(proof, expectedRuntimeScope.origin);
    if (!binding) return 'unavailable';
    if (this.#binding && this.#binding !== binding) { this.#changed = true; return 'changed'; }
    this.#binding ??= binding; this.#latest = proof;
    return 'observed';
  }
  authorize() { this.#permit = this.#latest; return this.valid(); }
  valid() { return runtimeProofDeadline(this.#permit, expectedRuntimeScope.origin) !== undefined; }
}
