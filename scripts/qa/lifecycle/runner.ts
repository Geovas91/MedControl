import { blockers, MutationNotDispatched, QaError, requireQa, type Appointment, type Journal, type JournalStore, type LifecycleAdapter, type Proposal, type Slot } from './contracts.ts';

function write(store: JournalStore, patch: Partial<Journal>) { const prior = store.read(); store.save({ ...prior, ...patch, revision: prior.revision + 1 }); }
async function gate(adapter: LifecycleAdapter, journal: Journal, cleanupMode = false) {
  const flight = await adapter.preflight(journal.patient);
  const failed = blockers(flight).filter(key => !(key === 'patientEligibility' && !journal.patient) && (!cleanupMode || !['availability', 'patientEligibility', 'slots'].includes(key)));
  requireQa(failed.length === 0, 'preflight_blocked');
  requireQa(JSON.stringify(flight.scope) === JSON.stringify(journal.scope), 'scope_changed');
  return flight;
}
function owned(journal: Journal, rows: Appointment[]) {
  requireQa(rows.every(row => row.clinic === journal.scope.clinic && row.patient === journal.patient && row.professional === journal.scope.professionalUser && row.createdBy === journal.scope.actor && Date.parse(row.createdAt) >= Date.parse(journal.startedAt)), 'appointment_ownership_mismatch');
  return rows;
}
export async function recoverOwned(adapter: LifecycleAdapter, store: JournalStore) {
  let journal = store.read();
  const patients = await adapter.findPatients(journal);
  requireQa(journal.step !== 'create_patient' || patients.length > 0, 'patient_creation_outcome_unresolved');
  requireQa(patients.length <= 1 && patients.every(patient => patient.clinic === journal.scope.clinic && patient.name === journal.patientName && patient.createdBy === journal.scope.actor && Date.parse(patient.createdAt) >= Date.parse(journal.startedAt) && (!journal.patient || patient.id === journal.patient)), 'patient_ownership_mismatch');
  requireQa(!journal.patient || patients.length === 1, 'patient_missing_not_clean');
  if (patients.length) write(store, { patient: patients[0].id });
  journal = store.read();
  if (!journal.patient) return;
  const rows = owned(journal, await adapter.appointments(journal));
  requireQa(journal.step !== 'confirm_create' || rows.length > 0, 'appointment_creation_outcome_unresolved');
  requireQa(journal.appointments.every(id => rows.some(row => row.id === id)), 'tracked_appointment_missing');
  write(store, { appointments: rows.map(row => row.id) });
  const proposals = await adapter.proposals(store.read());
  requireQa(proposals.every(row => row.clinic === journal.scope.clinic && row.actor === journal.scope.actor && (row.patient === journal.patient || row.appointment && rows.some(appointment => appointment.id === row.appointment))), 'proposal_ownership_mismatch');
  write(store, { proposals: [...new Set([...store.read().proposals, ...proposals.map(row => row.id)])] });
}
function matches(row: Appointment, slot: Slot) { return Date.parse(row.startsAt) === Date.parse(slot.startsAt) && Date.parse(row.endsAt) === Date.parse(slot.endsAt); }
async function proposal(adapter: LifecycleAdapter, store: JournalStore, kind: Proposal['kind'], slot?: Slot) {
  await gate(adapter, store.read(), kind === 'cancel');
  const before = await adapter.appointments(store.read());
  const beforeAudit = before.length === 1 ? await adapter.audit(store.read(), before[0].id) : [];
  const prior = await adapter.proposals(store.read());
  write(store, { step: `prepare_${kind}` });
  await adapter.prepare(store.read(), kind, slot);
  await recoverOwned(adapter, store);
  const rows = await adapter.proposals(store.read());
  const fresh = rows.filter(row => !prior.some(previous => previous.id === row.id));
  requireQa(fresh.length === 1 && fresh[0].status === 'pending' && fresh[0].kind === kind && !fresh[0].mutationExecuted, 'proposal_invalid');
  if (kind !== 'cancel') requireQa(fresh[0].date === slot?.date && fresh[0].time === slot?.time && fresh[0].duration === 30, 'proposal_slot_mismatch');
  if (kind === 'create') requireQa(fresh[0].patient === store.read().patient && fresh[0].professional === store.read().scope.professional, 'proposal_reference_mismatch');
  else requireQa(fresh[0].appointment === store.read().appointments[0], 'proposal_appointment_mismatch');
  requireQa(JSON.stringify(await adapter.appointments(store.read())) === JSON.stringify(before), 'mutation_before_confirmation');
  if (before.length === 1) requireQa(JSON.stringify(await adapter.audit(store.read(), before[0].id)) === JSON.stringify(beforeAudit), 'audit_changed_before_confirmation');
  return fresh[0];
}
export async function cleanup(adapter: LifecycleAdapter, store: JournalStore) {
  // Discover exact owned resources read-only even if runtime evidence is down.
  // Authorization is still mandatory before every cleanup write.
  await recoverOwned(adapter, store);
  await gate(adapter, store.read(), true);
  let journal = store.read();
  if (journal.patient) {
    for (const pending of await adapter.proposals(journal)) if (pending.status === 'pending') {
      await gate(adapter, store.read(), true);
      write(store, { step: 'cleanup_pending_proposal' });
      await adapter.cancelProposal(store.read(), pending);
    }
    for (const row of owned(journal, await adapter.appointments(journal))) if (row.status !== 'cancelled') {
      requireQa(journal.appointments.length === 1, 'cleanup_multiple_appointments_requires_review');
      await proposal(adapter, store, 'cancel');
      await gate(adapter, store.read(), true);
      write(store, { step: 'cleanup_confirm_cancel' });
      await adapter.confirm(store.read());
    }
    journal = store.read();
    requireQa((await adapter.appointments(journal)).every(row => row.status === 'cancelled'), 'cleanup_active_appointments');
    requireQa((await adapter.proposals(journal)).every(row => row.status !== 'pending' && row.status !== 'claimed'), 'cleanup_unresolved_proposals');
    if (!await adapter.isPatientRetired(journal)) {
      write(store, { step: 'cleanup_retire_patient' });
      await gate(adapter, store.read(), true);
      await adapter.retirePatient(store.read());
    }
    requireQa(await adapter.isPatientRetired(store.read()), 'cleanup_patient_not_retired');
  }
  write(store, { state: 'clean', step: 'cleanup_verified' });
}
export async function runLifecycle(adapter: LifecycleAdapter, store: JournalStore, optIn: boolean) {
  requireQa(optIn, 'mutation_opt_in_required');
  requireQa(store.read().step === 'planned', 'resume_cleanup_only');
  const passed: string[] = [];
  try {
    const flight = await gate(adapter, store.read());
    requireQa((await adapter.findPatients(store.read())).length === 0, 'fixture_preexists');
    await gate(adapter, store.read());
    write(store, { step: 'create_patient' });
    await adapter.createPatient(store.read());
    await recoverOwned(adapter, store);
    requireQa(store.read().patient, 'patient_not_persisted');
    await gate(adapter, store.read());
    requireQa((await adapter.appointments(store.read())).length === 0, 'fixture_appointments_preexist');
    const creation = await proposal(adapter, store, 'create', flight.slots[0]);
    await gate(adapter, store.read());
    write(store, { step: 'confirm_create' });
    await adapter.confirm(store.read(), true);
    await recoverOwned(adapter, store);
    let rows = owned(store.read(), await adapter.appointments(store.read()));
    requireQa(rows.length === 1 && rows[0].status === 'scheduled' && matches(rows[0], flight.slots[0]), 'created_persistence_mismatch');
    passed.push('LIVE-001');
    const executed = (await adapter.proposals(store.read())).find(row => row.id === creation.id);
    requireQa(executed?.status === 'executed' && executed.mutationExecuted, 'claim_not_executed_once');
    await gate(adapter, store.read());
    await adapter.assertOneShot(store.read(), executed);
    requireQa(JSON.stringify(await adapter.appointments(store.read())) === JSON.stringify(rows), 'duplicate_execution_mutated');
    const beforeRead = JSON.stringify(rows);
    const beforeReadAudit = JSON.stringify(await adapter.audit(store.read(), rows[0].id));
    await adapter.assertRead(store.read(), flight.slots[0]);
    requireQa(JSON.stringify(await adapter.appointments(store.read())) === beforeRead, 'read_mutated');
    requireQa(JSON.stringify(await adapter.audit(store.read(), rows[0].id)) === beforeReadAudit, 'read_changed_audit');
    passed.push('LIVE-002');
    await proposal(adapter, store, 'reschedule', flight.slots[1]);
    await gate(adapter, store.read());
    write(store, { step: 'confirm_reschedule' }); await adapter.confirm(store.read());
    rows = owned(store.read(), await adapter.appointments(store.read()));
    requireQa(rows.length === 1 && rows[0].id === store.read().appointments[0] && matches(rows[0], flight.slots[1]), 'reschedule_persistence_mismatch');
    passed.push('LIVE-003');
    await proposal(adapter, store, 'cancel');
    await gate(adapter, store.read());
    write(store, { step: 'confirm_cancel' }); await adapter.confirm(store.read());
    rows = owned(store.read(), await adapter.appointments(store.read()));
    requireQa(rows.length === 1 && rows[0].status === 'cancelled', 'cancel_persistence_mismatch');
    const audit = await adapter.audit(store.read(), rows[0].id);
    requireQa(audit.length === 3 && ['created', 'rescheduled', 'cancelled'].every(event => audit.filter(value => value === event).length === 1), 'audit_history_mismatch');
    passed.push('LIVE-004', 'LIVE-005');
    const isolation = adapter.isolation ? await adapter.isolation(store.read()) : false;
    if (isolation) passed.push('LIVE-006');
    await cleanup(adapter, store); await cleanup(adapter, store);
    return { status: isolation ? 'PASS' : 'PARTIAL', passed, blocked: isolation ? [] : ['LIVE-006'], cleanup: 'PASS' };
  } catch (error) {
    if (error instanceof MutationNotDispatched && ['create_patient', 'confirm_create'].includes(store.read().step)) {
      write(store, { step: `blocked_before_${store.read().step}` });
    }
    write(store, { state: 'failed' });
    // Never retry an ambiguous mutation. Discover exact owned resources and
    // attempt guarded cleanup; retain the journal if evidence is incomplete.
    let cleaned = false;
    try { await cleanup(adapter, store); await cleanup(adapter, store); cleaned = true; } catch { /* Private journal retained. */ }
    return { status: 'FAIL', passed, blocked: [], cleanup: cleaned ? 'PASS' : 'FAIL', reason: error instanceof QaError ? error.code : 'operation_failed', remainingKnownAppointments: cleaned ? 0 : store.read().appointments.length, unresolvedResources: !cleaned, unresolvedPatient: !cleaned && Boolean(store.read().patient) };
  }
}
