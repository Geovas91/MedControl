import { generateKeyPairSync, sign } from 'node:crypto';
import { evidenceDomain, type RuntimeEvidence, type RuntimeTrustPolicy } from '../../scripts/qa/lifecycle/signed-runtime-evidence.ts';
import { expectedRuntimeScope } from '../../scripts/qa/lifecycle/runtime-trust-policy.ts';

export function runtimeEvidenceFixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519'); // Ephemeral unit fixture only.
  const now = Date.now(), h = 'a'.repeat(64), artifact = 'b'.repeat(64);
  const identity = { pid: 4242, uid: 1001, startTicks: '123456', boot: h, cwd: h, artifact, node: h, launcher: h };
  const release = { commit: expectedRuntimeScope.commit, artifact, build: h, node: h, provenance: h };
  const policy: RuntimeTrustPolicy = {
    endpoint: 'https://independent-qa.example.test/runtime', keyId: 'unit-authority', publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    keyNotBefore: now - 60_000, keyNotAfter: now + 3600_000, origin: expectedRuntimeScope.origin, project: expectedRuntimeScope.project,
    host: h, release, cwd: h, launcher: h, proxyConfig: h, isolationPolicy: h, inventory: h,
    workloads: [{ id: 'clinicontrol-staging-qa', kind: 'app', state: 'online' }, { id: 'clinicontrol-staging', kind: 'app', state: 'stopped' }, { id: 'appointment-automations', kind: 'cron', state: 'paused' }]
  };
  const evidence: RuntimeEvidence = {
    schema: 1, nonce: 'c'.repeat(64), audience: 'assistant-lifecycle', origin: policy.origin, project: policy.project, host: h, issuedAt: now - 2000, expiresAt: now + 20_000,
    release: { ...release }, before: { ...identity }, after: { ...identity }, sampledAt: [now - 2000, now - 500],
    pm2: { name: 'clinicontrol-staging-qa', pid: 4242, cwd: h, launcher: h, state: 'online' }, listener: { pid: 4242, address: '127.0.0.1', port: 3000 },
    proxy: { origin: policy.origin, upstream: '127.0.0.1:3000', config: h }, isolation: { mode: 'isolated', email: 'disabled', policy: h, proof: h }, inventory: h,
    coverage: ['pm2_all_users', 'systemd_all_users', 'cron_all_users', 'containers', 'supabase_schedulers', 'external_senders'].map(scope => ({ scope, source: h })),
    workloads: [{ id: 'clinicontrol-staging-qa', kind: 'app', state: 'online', pid: 4242, artifact, mode: 'isolated', whatsapp: 'guarded', source: h },
      { id: 'clinicontrol-staging', kind: 'app', state: 'stopped', pid: 0, artifact: 'none', mode: 'none', whatsapp: 'none', source: h },
      { id: 'appointment-automations', kind: 'cron', state: 'paused', pid: 0, artifact: 'none', mode: 'none', whatsapp: 'none', source: h }]
  };
  function seal(data: unknown = evidence) {
    const bytes = Buffer.from(JSON.stringify(data));
    return { keyId: policy.keyId, payload: bytes.toString('base64url'), signature: sign(null, Buffer.concat([Buffer.from(evidenceDomain), bytes]), privateKey).toString('base64url') };
  }
  return { now, policy, evidence, seal };
}
