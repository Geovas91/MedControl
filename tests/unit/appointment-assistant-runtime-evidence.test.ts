import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectRuntimeEvidence, environmentPresence, processStat } from '../../scripts/qa/assistant-runtime-evidence.ts';

test('runtime environment output contains only allowlisted presence, never values or secret hashes', () => {
  const secret = 'private-patient-token';
  const output = environmentPresence(Buffer.from(`META_WHATSAPP_ACCESS_TOKEN=${secret}\0UNKNOWN_PATIENT=private-name\0WHATSAPP_OUTBOUND_ENABLED=false\0`));
  assert.equal(output.META_WHATSAPP_ACCESS_TOKEN, 'SET');
  assert.equal(output.WHATSAPP_OUTBOUND_ENABLED, 'SET');
  assert.equal(output.RESEND_API_KEY, 'NOT_SET');
  assert.ok(!JSON.stringify(output).includes('private'));
  assert.ok(!JSON.stringify(output).includes('UNKNOWN_PATIENT'));
  assert.equal(environmentPresence(null).RESEND_API_KEY, 'UNKNOWN');
  assert.equal(environmentPresence(Buffer.from('RESEND_API_KEY')).RESEND_API_KEY, 'NOT_SET');
});

test('stable matching process/build and child observations still cannot verify runtime or outbound isolation', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'assistant-runtime-'));
  try {
    const root = path.join(dir, '42', 'cwd');
    mkdirSync(path.join(root, '.next'), { recursive: true });
    mkdirSync(path.join(dir, '43'));
    const stat = (parent: number) => Buffer.from(`42 (private-name) S ${parent} ${Array(17).fill('0').join(' ')} 1234`);
    writeFileSync(path.join(dir, '42', 'stat'), stat(1));
    writeFileSync(path.join(dir, '43', 'stat'), stat(42));
    writeFileSync(path.join(dir, '42', 'environ'), 'META_WHATSAPP_ACCESS_TOKEN=never-echo\0pm_id=0\0name=clinicontrol-staging\0');
    const report = collectRuntimeEvidence(root, 42, dir);
    assert.equal(report.process.cwdMatchesCheckout, true);
    assert.equal(report.process.stableDuringCollection, true);
    assert.equal(report.process.directChildren?.[0].pid, 43);
    assert.equal(report.process.environment.META_WHATSAPP_ACCESS_TOKEN, 'SET');
    assert.equal(report.runtimeBuildRelationship, 'UNKNOWN');
    assert.equal(report.pm2Identity, 'UNKNOWN');
    assert.equal(report.backgroundWorkers, 'UNKNOWN');
    assert.equal(report.whatsappIsolation, 'UNKNOWN');
    assert.equal(report.deploymentIdentity, 'UNKNOWN');
    assert.equal(report.readyForLiveMutations, false);
    assert.ok(!JSON.stringify(report).includes('never-echo'));
    assert.ok(!JSON.stringify(report).includes('private-name'));
    assert.ok(!JSON.stringify(report).includes('clinicontrol-staging'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('proc parser handles private process names and rejects unavailable/malformed state', () => {
  const fields = ['S', '1', ...Array(17).fill('0'), '1234'];
  assert.deepEqual(processStat(Buffer.from(`42 (private ) name) ${fields.join(' ')}`)), { state: 'S', parentPid: 1, startTicks: '1234' });
  assert.equal(processStat(null), null);
  assert.equal(processStat(Buffer.from('raw-secret-error')), null);
});

test('missing process/build/provenance never becomes attestation, even with apparent checkout scope', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'assistant-runtime-'));
  try {
    mkdirSync(path.join(dir, '.next'));
    writeFileSync(path.join(dir, '.next', 'BUILD_ID'), 'private-build-label');
    const report = collectRuntimeEvidence(dir, 42, path.join(dir, 'absent-proc'));
    assert.equal(report.deploymentIdentity, 'UNKNOWN');
    assert.equal(report.whatsappIsolation, 'UNKNOWN');
    assert.equal(report.readyForLiveMutations, false);
    assert.equal(report.process.stableDuringCollection, false);
    assert.equal(report.process.cwdMatchesCheckout, null);
    assert.equal(report.build.stableDuringCollection, true);
    assert.match(report.build.sha256.BUILD_ID!, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(report).includes('private-build-label'));
    assert.throws(() => collectRuntimeEvidence('relative', 42), /invalid_scope/);
    assert.throws(() => collectRuntimeEvidence(dir, NaN), /invalid_scope/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
