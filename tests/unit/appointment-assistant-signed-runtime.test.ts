import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { acquireTrustedRuntimeProof, assessSignedRuntimeEvidence, authenticRuntimeProof } from '../../scripts/qa/lifecycle/signed-runtime-evidence.ts';
import { runtimeVerificationBoundary } from '../../scripts/qa/lifecycle/runtime-verification.ts';
import { expectedRuntimeScope } from '../../scripts/qa/lifecycle/runtime-trust-policy.ts';
import { blockers, STAGING } from '../../scripts/qa/lifecycle/contracts.ts';
import { lifecycleFake } from '../helpers/assistant-lifecycle-fake.ts';
import { runtimeEvidenceFixture } from '../helpers/runtime-evidence.ts';

test('valid independently signed evidence verifies its source, release, serving identities, coverage and isolation', () => {
  const f = runtimeEvidenceFixture();
  const result = assessSignedRuntimeEvidence(f.seal(), f.evidence.nonce, f.policy, f.now);
  assert.equal(result.state, 'verified');
  // An assessment is informative JSON, not an in-process authorization handle.
  assert.equal(authenticRuntimeProof(result, STAGING), false);
  assert.equal(runtimeVerificationBoundary(STAGING, { checks: { outbound: 'isolated', email: 'disabled' } }, result).deployment.state, 'unknown');
});

const invalidCases: [string, (f: ReturnType<typeof runtimeEvidenceFixture>) => void][] = [
  ['incomplete evidence', f => { f.evidence.coverage.pop(); }],
  ['expired evidence', f => { f.evidence.expiresAt = f.now - 1; }],
  ['future evidence', f => { f.evidence.issuedAt = f.now + 1; }],
  ['replayed nonce', f => { f.evidence.nonce = 'd'.repeat(64); }],
  ['incorrect process', f => { f.evidence.listener.pid++; }],
  ['unstable process', f => { f.evidence.after.startTicks = '999999'; }],
  ['root application process', f => { f.evidence.before.uid = f.evidence.after.uid = 0; }],
  ['incorrect release', f => { f.evidence.release.commit = 'f'.repeat(40); }],
  ['incorrect artifact', f => { f.evidence.release.artifact = 'f'.repeat(64); }],
  ['incorrect proxy', f => { f.evidence.proxy.config = 'f'.repeat(64); }],
  ['unknown worker', f => { f.evidence.workloads.push({ ...f.evidence.workloads[0], id: 'unknown-worker', kind: 'worker' }); }],
  ['unverified independent sender', f => {
    f.policy.workloads.push({ id: 'external-sender', kind: 'external', state: 'online' });
    f.evidence.workloads.push({ ...f.evidence.workloads[0], id: 'external-sender', kind: 'external' });
  }],
  ['isolation failure', f => { f.evidence.workloads[0].mode = 'none'; }],
  ['incorrect effective configuration', f => { f.evidence.isolation.email = 'ready' as never; }],
  ['incomplete collection span', f => { f.evidence.sampledAt[1] = f.evidence.sampledAt[0]; }],
  ['unknown evidence field', f => { Object.assign(f.evidence, { patient: 'never-print' }); }],
  ['revoked or expired authority', f => { f.policy.keyNotAfter = f.now; }],
  ['application-owned evidence endpoint', f => { f.policy.endpoint = STAGING + '/api/ready'; }]
];
for (const [label, modify] of invalidCases) test(`signed evidence rejects ${label}`, () => {
  const f = runtimeEvidenceFixture(); modify(f);
  const result = assessSignedRuntimeEvidence(f.seal(), 'c'.repeat(64), f.policy, f.now);
  assert.equal(result.state, 'rejected'); assert.ok(!JSON.stringify(result).includes('never-print'));
});

test('tampered bytes, wrong signing key, unsigned JSON and malformed envelopes do not verify', () => {
  const f = runtimeEvidenceFixture(), other = runtimeEvidenceFixture();
  const altered = { ...f.seal(), payload: Buffer.from(JSON.stringify({ ...f.evidence, host: 'f'.repeat(64) })).toString('base64url') };
  for (const data of [altered, { ...other.seal(f.evidence), keyId: f.policy.keyId }, f.evidence, null, { ...f.seal(), signature: 'bad' }]) assert.equal(assessSignedRuntimeEvidence(data, f.evidence.nonce, f.policy, f.now).state, 'rejected');
});

test('unprovisioned real authority performs no network and cannot be enabled by evidence or executor flags', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not request'); };
  try { assert.equal((await acquireTrustedRuntimeProof()).reason, 'independent_authority_not_provisioned'); assert.equal(calls, 0); }
  finally { globalThis.fetch = original; }
});

// Execute real verifier/boundary code with ONLY the policy and authority HTTP
// replaced by ephemeral test fixtures. Production has no injection parameters.
function authorityHarness(response?: () => Response | Promise<Response>, fresh = true) {
  const f = runtimeEvidenceFixture(); let clock = f.now, monotonic = 0, calls = 0;
  const native = createRequire(import.meta.url);
  const modules: Record<string, any> = {};
  function load(file: string) {
    const exports: Record<string, any> = {};
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, Buffer, URL, AbortSignal, Date: { now: () => clock },
      fetch: async (url: URL, options: RequestInit) => {
        calls++; assert.equal(url.origin, new URL(f.policy.endpoint).origin); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
        if (response) return response();
        const requestedAt = clock; clock += 1500;
        return Response.json(f.seal({ ...f.evidence, ...(fresh ? { issuedAt: requestedAt, sampledAt: [requestedAt, requestedAt + 1000] } : {}), nonce: url.searchParams.get('nonce') }));
      }, require: (name: string) => {
        if (name === 'node:perf_hooks') return { performance: { now: () => monotonic } };
        if (name.includes('runtime-trust-policy')) return { runtimeTrustPolicy: f.policy, expectedRuntimeScope };
        if (name.includes('signed-runtime-evidence')) return modules.signed;
        if (name.includes('contracts')) return { STAGING };
        return native(name);
      } });
    return exports;
  }
  modules.signed = load('scripts/qa/lifecycle/signed-runtime-evidence.ts');
  const boundary = load('scripts/qa/lifecycle/runtime-verification.ts');
  return { f, signed: modules.signed, boundary, calls: () => calls, advance: (ms: number) => { clock += ms; }, advanceMonotonic: (ms: number) => { monotonic += ms; } };
}

test('only live fixed-policy acquisition mints a proof that verifies both runtime gates; copy/replay/expiry fail closed', async () => {
  const h = authorityHarness(); const obtained = await h.signed.acquireTrustedRuntimeProof();
  assert.ok(obtained.proof); assert.equal(h.calls(), 1);
  const readiness = { checks: { outbound: 'isolated', email: 'disabled' } };
  const result = h.boundary.runtimeVerificationBoundary(STAGING, readiness, obtained.proof);
  assert.equal(result.deployment.state, 'verified'); assert.equal(result.whatsapp.state, 'verified');
  assert.equal(result.observations.trust, 'authenticated');
  assert.equal(h.boundary.runtimeVerificationBoundary(STAGING, readiness, JSON.parse(JSON.stringify(obtained.proof))).deployment.state, 'unknown');
  assert.equal(h.boundary.runtimeVerificationBoundary(STAGING, { checks: { outbound: 'normal', email: 'ready' } }, obtained.proof).whatsapp.state, 'unknown');
  const flight = await lifecycleFake().adapter.preflight(); flight.runtime = result.observations;
  assert.ok(blockers(flight, h.f.evidence.expiresAt).includes('runtime_evidence_expired'));
  h.advance(30_000);
  assert.equal(h.boundary.runtimeVerificationBoundary(STAGING, readiness, obtained.proof).deployment.state, 'unknown');
});

test('authority transport failure and oversized responses return sanitized failures without proofs', async () => {
  const failure = authorityHarness(() => { throw new Error('secret-provider-error'); });
  const result = await failure.signed.acquireTrustedRuntimeProof();
  assert.equal(result.proof, undefined); assert.ok(!JSON.stringify(result).includes('secret'));
  const huge = authorityHarness(() => new Response('x'.repeat(32769)));
  assert.equal((await huge.signed.acquireTrustedRuntimeProof()).reason, 'evidence_size_rejected');
});

test('runtime session rejects JSON permits, clock rollback, expiry and inaccessible authority', async () => {
  const h = authorityHarness(), session = new h.signed.RuntimeSession();
  const obtained = await h.signed.acquireTrustedRuntimeProof();
  assert.equal(session.observe(JSON.parse(JSON.stringify(obtained.proof))), 'unavailable');
  assert.equal(session.authorize(), false);
  assert.equal(session.observe(obtained.proof), 'observed'); assert.equal(session.authorize(), true);
  h.advance(-1); assert.equal(session.valid(), false); h.advance(1);
  assert.equal(session.valid(), false); // Rejected proof cannot revive when clocks recover.
  h.advance(30_000); assert.equal(session.valid(), false);
  assert.equal(session.observe(undefined), 'unavailable'); assert.equal(session.authorize(), false);
});

test('monotonic expiration cannot be extended by a stalled wall clock', async () => {
  const h = authorityHarness(), session = new h.signed.RuntimeSession();
  const obtained = await h.signed.acquireTrustedRuntimeProof();
  session.observe(obtained.proof); assert.equal(session.authorize(), true);
  h.advanceMonotonic(30_000); assert.equal(session.valid(), false);
});

test('a fresh signature/nonce cannot authorize an observation issued before the challenge', async () => {
  const h = authorityHarness(undefined, false);
  const obtained = await h.signed.acquireTrustedRuntimeProof();
  assert.equal(obtained.proof, undefined); assert.equal(obtained.reason, 'evidence_expired');
});

test('session latches restart/control changes and only a new explicit session can bind the reviewed new process', async () => {
  const h = authorityHarness(), session = new h.signed.RuntimeSession();
  const initial = await h.signed.acquireTrustedRuntimeProof();
  assert.equal(session.observe(initial.proof), 'observed'); assert.equal(session.authorize(), true);
  h.f.evidence.before.startTicks = h.f.evidence.after.startTicks = '999999';
  const restarted = await h.signed.acquireTrustedRuntimeProof();
  assert.ok(restarted.proof); assert.equal(session.observe(restarted.proof), 'changed'); assert.equal(session.valid(), false);
  assert.equal(session.observe(initial.proof), 'changed'); assert.equal(session.authorize(), false);
  const recovery = new h.signed.RuntimeSession();
  assert.equal(recovery.observe(restarted.proof), 'observed'); assert.equal(recovery.authorize(), true);
});

test('binding is deterministic across source evidence refresh/order but changes for serving configuration', () => {
  const f = runtimeEvidenceFixture();
  const before = assessSignedRuntimeEvidence(f.seal(), f.evidence.nonce, f.policy, f.now).binding;
  f.evidence.workloads.reverse(); f.evidence.workloads[0].source = 'd'.repeat(64);
  f.evidence.before = Object.fromEntries(Object.entries(f.evidence.before).reverse()) as typeof f.evidence.before;
  const same = assessSignedRuntimeEvidence(f.seal(), f.evidence.nonce, f.policy, f.now);
  assert.equal(same.state, 'verified'); assert.equal(same.binding, before);
  f.evidence.before.uid = f.evidence.after.uid = 1002;
  assert.notEqual(assessSignedRuntimeEvidence(f.seal(), f.evidence.nonce, f.policy, f.now).binding, before);
});
