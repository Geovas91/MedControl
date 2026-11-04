import { newJournal } from '../../scripts/qa/lifecycle/journal.ts';
import type { Appointment, Journal, JournalStore, LifecycleAdapter, Patient, Preflight, Proposal, Slot } from '../../scripts/qa/lifecycle/contracts.ts';
import { PROJECT, requiredGates, STAGING } from '../../scripts/qa/lifecycle/contracts.ts';

export function lifecycleFake() {
  const scope = { actor: 'actor-qa', clinic: 'clinic-qa', professional: 'member-qa', professionalUser: 'doctor-qa', professionalName: 'QA Doctor', clinicName: 'CliniControl QA Norte', timeZone: 'America/Mexico_City' };
  let value = newJournal(scope);
  const store: JournalStore = { read: () => structuredClone(value), save(next) { value = structuredClone(next); } };
  const state = { patients: [] as Patient[], appointments: [] as Appointment[], proposals: [] as Proposal[], audit: [] as string[], createCalls: 0, confirms: 0, retireCalls: 0, cleanupFails: false, createLostResponse: false, mutationLostResponse: false, duplicateMutation: false, changedScope: false, foreignPatient: false };
  const slots: Slot[] = [{ date: '2030-10-22', time: '10:00', startsAt: '2030-10-22T16:00:00Z', endsAt: '2030-10-22T16:30:00Z' }, { date: '2030-10-22', time: '11:00', startsAt: '2030-10-22T17:00:00Z', endsAt: '2030-10-22T17:30:00Z' }];
  const flight: Preflight = { origin: STAGING, project: PROJECT, scope, slots, checkedAt: Date.now(), gates: Object.fromEntries(requiredGates.map(key => [key, { state: 'verified', source: 'simulated_protected_read' }])) };
  const adapter: LifecycleAdapter = {
    async preflight() { return structuredClone({ ...flight, scope: state.changedScope ? { ...scope, clinic: 'foreign' } : scope }); },
    async findPatients() { return structuredClone(state.patients); },
    async createPatient(journal) {
      state.createCalls++;
      state.patients.push({ id: 'patient-new', clinic: scope.clinic, name: journal.patientName, createdBy: state.foreignPatient ? 'foreign' : scope.actor, createdAt: new Date().toISOString(), status: 'active' });
      if (state.createLostResponse) throw new Error('PRIVATE browser transport');
    },
    async appointments() { return structuredClone(state.appointments); },
    async proposals() { return structuredClone(state.proposals); },
    async prepare(journal, kind, slot) {
      state.proposals.push({ id: `proposal-${state.proposals.length}`, kind, patient: kind === 'create' ? journal.patient : undefined, appointment: kind === 'create' ? undefined : journal.appointments[0], clinic: scope.clinic, actor: scope.actor, professional: kind === 'create' ? scope.professional : undefined, date: slot?.date, time: slot?.time, duration: slot ? 30 : undefined, status: 'pending', mutationExecuted: false });
    },
    async confirm(journal) {
      state.confirms++;
      const pending = state.proposals.find(row => row.status === 'pending')!;
      pending.status = 'executed'; pending.mutationExecuted = true;
      if (pending.kind === 'create') {
        const row = { id: 'appointment-new', clinic: scope.clinic, patient: journal.patient!, professional: scope.professionalUser, startsAt: slots[0].startsAt, endsAt: slots[0].endsAt, status: 'scheduled', createdAt: new Date().toISOString(), createdBy: scope.actor };
        state.appointments.push(row);
        if (state.duplicateMutation) state.appointments.push({ ...row, id: 'duplicate' });
      } else if (pending.kind === 'reschedule') Object.assign(state.appointments[0], { startsAt: slots[1].startsAt, endsAt: slots[1].endsAt });
      else {
        if (state.cleanupFails) throw new Error('PRIVATE cleanup detail');
        state.appointments[0].status = 'cancelled';
      }
      state.audit.push(pending.kind === 'create' ? 'created' : pending.kind === 'reschedule' ? 'rescheduled' : 'cancelled');
      if (state.mutationLostResponse && pending.kind === 'create') throw new Error('PRIVATE ambiguous confirmation');
    },
    async assertRead() {}, async assertOneShot() {},
    async audit() { return [...state.audit]; },
    async cancelProposal(_journal, pending) { state.proposals.find(row => row.id === pending.id)!.status = 'cancelled'; },
    async retirePatient() { state.retireCalls++; if (state.cleanupFails) throw new Error('PRIVATE retirement failure'); state.patients[0].status = 'inactive'; },
    async isPatientRetired() { return state.patients[0]?.status === 'inactive'; },
    async isolation() { return true; }
  };
  return { adapter, store, state, flight, scope, slots };
}
