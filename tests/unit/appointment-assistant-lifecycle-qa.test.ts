import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { blockers, requiredGates } from '../../scripts/qa/lifecycle/contracts.ts';
import { cleanup, recoverOwned, runLifecycle } from '../../scripts/qa/lifecycle/runner.ts';
import { newJournal, openJournal } from '../../scripts/qa/lifecycle/journal.ts';
import { publicKeyOnly } from '../../scripts/qa/lifecycle/staging-reads.ts';
import { lifecycleFake } from '../helpers/assistant-lifecycle-fake.ts';

test('lifecycle engine validates all six scenarios against controlled persistence and repeats exact cleanup', async () => {
  const { adapter, store, state } = lifecycleFake();
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.passed, ['LIVE-001', 'LIVE-002', 'LIVE-003', 'LIVE-004', 'LIVE-005', 'LIVE-006']);
  assert.equal(state.createCalls, 1); assert.equal(state.appointments.length, 1);
  assert.equal(state.appointments[0].status, 'cancelled'); assert.equal(state.retireCalls, 1);
  assert.deepEqual(state.audit, ['created', 'rescheduled', 'cancelled']);
  assert.equal(store.read().state, 'clean');
  await cleanup(adapter, store); assert.equal(state.retireCalls, 1);
});
test('no mutation opt-in means no fixture or confirmation', async () => {
  const { adapter, store, state } = lifecycleFake();
  await assert.rejects(runLifecycle(adapter, store, false), /mutation_opt_in_required/);
  assert.equal(state.createCalls, 0); assert.equal(state.confirms, 0);
});
for (const key of requiredGates.filter(key => key !== 'patientEligibility')) test(`unknown ${key} blocks writes despite mutation opt-in`, async () => {
  const { adapter, store, state, flight } = lifecycleFake();
  flight.gates[key] = { state: 'unknown', source: 'unverified' };
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(state.createCalls, 0); assert.equal(state.confirms, 0);
});
test('patient eligibility must be verified after creation before any appointment proposal', async () => {
  const { adapter, store, state, flight } = lifecycleFake();
  flight.gates.patientEligibility.state = 'unknown';
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(state.proposals.length, 0);
  assert.equal(state.patients[0].status, 'inactive');
});
test('wrong origin/project, stale preflight, invalid duration and duplicated slots fail preflight', () => {
  const { flight } = lifecycleFake();
  assert.ok(blockers({ ...flight, origin: 'https://clinicontrol.mx' }).includes('origin'));
  assert.ok(blockers({ ...flight, project: 'https://other.supabase.co' }).includes('project'));
  assert.ok(blockers({ ...flight, checkedAt: Date.now() - 61_000 }).includes('stale_preflight'));
  assert.ok(blockers({ ...flight, slots: [flight.slots[0], flight.slots[0]] }).includes('slots'));
  assert.ok(blockers({ ...flight, slots: [{ ...flight.slots[0], endsAt: flight.slots[0].startsAt }, flight.slots[1]] }).includes('slots'));
});
test('lost patient-create response is discovered and retired without retrying creation', async () => {
  const { adapter, store, state } = lifecycleFake(); state.createLostResponse = true;
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(result.cleanup, 'PASS');
  assert.equal(state.createCalls, 1); assert.equal(state.patients[0].status, 'inactive');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
test('lost confirmation response discovers and cancels the owned booking without a second create', async () => {
  const { adapter, store, state } = lifecycleFake(); state.mutationLostResponse = true;
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(result.cleanup, 'PASS');
  assert.equal(state.createCalls, 1); assert.equal(state.appointments.length, 1);
  assert.equal(state.appointments[0].status, 'cancelled');
});
test('duplicate booking is a failure, retains recovery journal and refuses broad cleanup', async () => {
  const { adapter, store, state } = lifecycleFake(); state.duplicateMutation = true;
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(result.cleanup, 'FAIL');
  assert.equal(state.appointments.length, 2); assert.equal(store.read().state, 'failed');
});
test('cleanup failure cannot yield PASS, retire a patient with active booking, or discard recovery data', async () => {
  const { adapter, store, state } = lifecycleFake(); state.mutationLostResponse = true; state.cleanupFails = true;
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(result.cleanup, 'FAIL');
  assert.equal(state.retireCalls, 0); assert.equal(state.appointments[0].status, 'scheduled');
  assert.equal(store.read().appointments.length, 1);
});
test('ownership mismatch and scope changes stop cleanup before unrelated data can be changed', async () => {
  const first = lifecycleFake(); first.state.foreignPatient = true;
  const result = await runLifecycle(first.adapter, first.store, true);
  assert.equal(result.cleanup, 'FAIL'); assert.equal(first.state.retireCalls, 0);
  const second = lifecycleFake(); second.state.changedScope = true;
  const other = await runLifecycle(second.adapter, second.store, true);
  assert.equal(other.status, 'FAIL'); assert.equal(second.state.createCalls, 0);
});
test('interrupted journal is recovery-only and never resumes a creation step', async () => {
  const { adapter, store, state } = lifecycleFake();
  store.save({ ...store.read(), step: 'create_patient' });
  await assert.rejects(runLifecycle(adapter, store, true), /resume_cleanup_only/);
  await assert.rejects(recoverOwned(adapter, store), /patient_creation_outcome_unresolved/);
  assert.equal(state.createCalls, 0);
});
test('an absent row after an ambiguous patient request is unresolved rather than cleanup PASS', async () => {
  const { adapter, store, state } = lifecycleFake();
  adapter.createPatient = async () => { state.createCalls++; throw new Error('PRIVATE late response'); };
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(result.cleanup, 'FAIL');
  assert.equal(state.createCalls, 1); assert.equal(store.read().step, 'create_patient');
});
test('an in-flight claimed confirmation with no visible booking must not retire the patient', async () => {
  const { adapter, store, state } = lifecycleFake();
  adapter.confirm = async () => { state.confirms++; state.proposals[0].status = 'claimed'; throw new Error('PRIVATE in-flight response'); };
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'FAIL'); assert.equal(result.cleanup, 'FAIL');
  assert.equal(state.retireCalls, 0); assert.equal(state.confirms, 1);
  assert.equal(store.read().step, 'confirm_create');
});
test('an appointment created by another actor on the temporary patient is never claimed for cleanup', async () => {
  const { adapter, store, state, slots, scope } = lifecycleFake();
  await adapter.createPatient(store.read()); await recoverOwned(adapter, store);
  state.appointments.push({ id: 'foreign-booking', clinic: scope.clinic, patient: store.read().patient!, professional: scope.professionalUser, startsAt: slots[0].startsAt, endsAt: slots[0].endsAt, createdAt: new Date().toISOString(), createdBy: 'another-actor', status: 'scheduled' });
  await assert.rejects(cleanup(adapter, store), /appointment_ownership_mismatch/);
  assert.equal(state.confirms, 0); assert.equal(state.retireCalls, 0);
});
test('missing second tenant evidence produces PARTIAL rather than isolation PASS', async () => {
  const { adapter, store } = lifecycleFake(); delete adapter.isolation;
  const result = await runLifecycle(adapter, store, true);
  assert.equal(result.status, 'PARTIAL'); assert.deepEqual(result.blocked, ['LIVE-006']);
});
test('private journal encrypts identifiers, persists revisions, excludes concurrent owners and detects tampering', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'clinicontrol-journal-test-'));
  const key = randomBytes(32).toString('base64');
  const initial = newJournal(lifecycleFake().scope);
  let handle: ReturnType<typeof openJournal> | undefined;
  try {
    handle = openJournal({ directory, key, initial });
    const file = handle.file;
    const encoded = readFileSync(file, 'utf8');
    assert.equal(encoded.includes(initial.patientName), false); assert.equal(encoded.includes(initial.phone), false);
    assert.throws(() => openJournal({ directory, key, run: initial.run }));
    handle.save({ ...handle.read(), revision: 1, step: 'create_patient' });
    assert.throws(() => handle!.save({ ...handle!.read(), revision: 2, patientName: 'baseline' }), /journal_identity_changed/);
    handle.close(); handle = undefined;
    handle = openJournal({ directory, key, run: initial.run });
    assert.equal(handle.read().step, 'create_patient'); handle.close(); handle = undefined;
    const envelope = JSON.parse(readFileSync(file, 'utf8')); envelope.data = 'AAAA'; writeFileSync(file, JSON.stringify(envelope));
    assert.throws(() => openJournal({ directory, key, run: initial.run }));
  } finally { handle?.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('journal refuses repository paths and invalid encryption keys; service-role keys are never accepted', () => {
  assert.throws(() => openJournal({ directory: process.cwd(), key: randomBytes(32).toString('base64'), initial: newJournal(lifecycleFake().scope) }), /journal_inside_repository/);
  assert.throws(() => openJournal({ key: 'invalid', initial: newJournal(lifecycleFake().scope) }), /journal_key_invalid/);
  assert.equal(publicKeyOnly('sb_secret_fake'), false);
  const jwt = (role: string) => `unit.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.unit`;
  assert.equal(publicKeyOnly(jwt('service_role')), false); assert.equal(publicKeyOnly(jwt('anon')), true);
});
