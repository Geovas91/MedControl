import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, recoverOwned, runLifecycle } from '../../scripts/qa/lifecycle/runner.ts';
import { lifecycleFake } from '../helpers/assistant-lifecycle-fake.ts';
import { BrowserLifecycleAdapter, guardLifecycleWrite, type LifecycleReads } from '../../scripts/qa/lifecycle/browser.ts';
import { MutationNotDispatched, STAGING } from '../../scripts/qa/lifecycle/contracts.ts';
import type { Page, Route } from '@playwright/test';

test('expiry during the final patient lookup prevents fixture creation', async () => {
  const f = lifecycleFake(), find = f.adapter.findPatients;
  f.flight.runtime = { reviewedRelease: 'independently_verified', servingProcess: 'independently_verified', workers: 'independently_verified', readinessPolicy: 'isolated', readinessEmail: 'disabled', trust: 'authenticated', validUntil: Date.now() + 20_000 };
  f.adapter.findPatients = async journal => {
    const rows = await find(journal);
    f.flight.runtime!.validUntil = Date.now() - 1;
    return rows;
  };
  const result = await runLifecycle(f.adapter, f.store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(f.state.createCalls, 0);
});

test('authority loss after an ambiguous confirmation retains discovered owned resources without cleanup writes', async () => {
  const f = lifecycleFake(), confirm = f.adapter.confirm;
  f.adapter.confirm = async journal => {
    await confirm(journal);
    f.flight.gates.deployment.state = 'unknown';
    throw new Error('private transport failure');
  };
  const result = await runLifecycle(f.adapter, f.store, true);
  assert.equal(result.cleanup, 'FAIL'); assert.equal(result.unresolvedResources, true);
  assert.deepEqual(f.store.read().appointments, ['appointment-new']);
  assert.equal(f.state.confirms, 1); assert.equal(f.state.retireCalls, 0);
  assert.equal(f.store.read().state, 'failed');
  // Explicit later recovery uses fresh verification; never retries creation.
  f.flight.gates.deployment.state = 'verified'; f.adapter.confirm = confirm;
  await cleanup(f.adapter, f.store);
  assert.equal(f.store.read().state, 'clean'); assert.equal(f.state.createCalls, 1);
});

test('evidence lost while discovering pending proposals blocks their cancellation', async () => {
  const f = lifecycleFake();
  await f.adapter.createPatient(f.store.read()); await recoverOwned(f.adapter, f.store);
  await f.adapter.prepare(f.store.read(), 'create', f.slots[0]);
  const proposals = f.adapter.proposals; let cancels = 0;
  f.adapter.proposals = async journal => { const rows = await proposals(journal); f.flight.gates.whatsapp.state = 'unknown'; return rows; };
  f.adapter.cancelProposal = async () => { cancels++; };
  await assert.rejects(cleanup(f.adapter, f.store), /preflight_blocked/);
  assert.equal(cancels, 0); assert.equal(f.state.retireCalls, 0);
});

for (const path of ['/dashboard/patients/new', '/dashboard/bot', '/dashboard/patients/patient-new/edit']) test(`HTTP dispatch refuses expired/missing permits for ${path}`, async () => {
  let sent = 0, aborted = 0, valid = false;
  const route = {
    request: () => ({ url: () => STAGING + path, method: () => 'POST' }),
    continue: async () => { sent++; }, abort: async () => { aborted++; }
  } as unknown as Route;
  const reads = { assertMutationLease() { if (!valid) throw new Error('expired'); } } as LifecycleReads;
  await guardLifecycleWrite(route); await guardLifecycleWrite(route, reads);
  assert.equal(sent, 0); assert.equal(aborted, 2);
  valid = true; await guardLifecycleWrite(route, reads); assert.equal(sent, 1);
});

test('missing authority never suppresses read-only discovery or login at the HTTP dispatch guard', async () => {
  let sent = 0;
  for (const [path, method] of [['/dashboard/patients/new', 'GET'], ['/login', 'POST']]) {
    await guardLifecycleWrite({ request: () => ({ url: () => STAGING + path, method: () => method }), continue: async () => { sent++; }, abort: async () => { assert.fail('read/login must remain available'); } } as unknown as Route);
  }
  assert.equal(sent, 2);
});

for (const operation of ['create', 'confirm', 'retire', 'cancelProposal']) test(`browser ${operation} requires renewed authorization after UI/read waits`, async () => {
  const f = lifecycleFake(); let clicks = 0, checks = 0;
  const journal = { ...f.store.read(), patient: 'patient-new' };
  const node: any = new Proxy({}, { get(_target, key) {
    if (key === 'then') return undefined;
    if (key === 'click' || key === 'evaluate') return async () => { clicks++; };
    if (key === 'inputValue') return async () => 'QAauto';
    if (['fill', 'selectOption', 'waitFor'].includes(String(key))) return async () => {};
    return () => node;
  } });
  const page = { goto: async () => {}, waitForURL: async () => {}, getByRole: () => node,
    locator: (selector: string) => selector === '#paternal_surname' ? { inputValue: async () => journal.patientName.slice(7), fill: async () => {} } : node } as unknown as Page;
  const reads = { authorizeMutation: async () => { checks++; throw new Error('preflight_blocked'); }, proposals: async () => [{ id: 'proposal', status: 'pending' }] } as unknown as LifecycleReads;
  const adapter = new BrowserLifecycleAdapter(page, reads, STAGING);
  const action = operation === 'create' ? () => adapter.createPatient(journal) : operation === 'confirm' ? () => adapter.confirm(journal) : operation === 'retire' ? () => adapter.retirePatient(journal) : () => {
    (adapter as any).visibleProposal = 'proposal';
    return adapter.cancelProposal(journal, { id: 'proposal' } as any);
  };
  await assert.rejects(action(), /mutation_not_dispatched/); assert.equal(checks, 1); assert.equal(clicks, 0);
});

test('a known pre-dispatch authorization rejection can recover the patient/proposal without inventing an ambiguous booking', async () => {
  const f = lifecycleFake();
  f.adapter.confirm = async () => { throw new MutationNotDispatched(); };
  const result = await runLifecycle(f.adapter, f.store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(result.cleanup, 'PASS');
  assert.equal(f.state.confirms, 0); assert.equal(f.state.appointments.length, 0);
  assert.equal(f.state.patients[0].status, 'inactive'); assert.equal(f.store.read().state, 'clean');
});
