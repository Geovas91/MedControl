import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeVerificationBoundary } from '../../scripts/qa/lifecycle/runtime-verification.ts';
import { STAGING } from '../../scripts/qa/lifecycle/contracts.ts';

test('runtime boundary separates readiness observations from independently authenticated release/process/worker proof', () => {
  const result = runtimeVerificationBoundary(STAGING, { checks: { outbound: 'isolated', email: 'disabled' } });
  assert.equal(result.observations.readinessPolicy, 'isolated');
  assert.equal(result.observations.readinessEmail, 'disabled');
  assert.equal(result.deployment.state, 'unknown');
  assert.equal(result.whatsapp.state, 'unknown');
  assert.equal(result.observations.trust, 'unavailable');
});
test('untrusted JSON approvals, receipts, SHAs and caller flags cannot verify runtime gates or leak fields', () => {
  const result = runtimeVerificationBoundary(STAGING, { checks: { outbound: 'isolated', email: 'disabled' }, deployment: { state: 'verified' }, whatsapp: { state: 'verified' }, approved: true, source: 'a'.repeat(40), token: 'never-print', patient: 'never-print', workers: [] });
  assert.equal(result.deployment.state, 'unknown'); assert.equal(result.whatsapp.state, 'unknown');
  assert.ok(!JSON.stringify(result).includes('never-print'));
});
test('wrong origin and blocked effective policy reject scope; missing or malformed evidence remains unknown', () => {
  assert.equal(runtimeVerificationBoundary('https://clinicontrol.mx', {}).deployment.state, 'blocked');
  assert.equal(runtimeVerificationBoundary(STAGING, { checks: { outbound: 'blocked' } }).whatsapp.state, 'blocked');
  for (const value of [null, [], 'approved', { checks: { outbound: ['isolated'], email: ['disabled'] } }, { checks: { outbound: 'VERIFIED', email: 'secret' } }]) {
    const result = runtimeVerificationBoundary(STAGING, value);
    assert.equal(result.deployment.state, 'unknown'); assert.equal(result.observations.readinessPolicy, 'unknown');
    assert.equal(result.observations.readinessEmail, 'unknown');
  }
});
