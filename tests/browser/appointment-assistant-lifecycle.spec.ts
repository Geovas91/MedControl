import { expect, test, type Page } from '@playwright/test';
import { BrowserLifecycleAdapter, type LifecycleReads } from '../../scripts/qa/lifecycle/browser';
import { newJournal } from '../../scripts/qa/lifecycle/journal';
import { runLifecycle } from '../../scripts/qa/lifecycle/runner';
import { PROJECT, requiredGates, STAGING, type JournalStore, type Proposal } from '../../scripts/qa/lifecycle/contracts';

async function fixtures(page: Page) {
  const ids = await page.evaluate(() => window.assistantQa.ids);
  const scope = { actor: ids.actor, clinic: ids.norte, professional: ids.professional, professionalUser: ids.professional, professionalName: 'QA Doctor Norte', clinicName: 'CliniControl QA Norte', timeZone: 'America/Mexico_City' };
  let value = newJournal(scope);
  const store: JournalStore = { read: () => structuredClone(value), save(next) { value = structuredClone(next); } };
  const snapshot = () => page.evaluate(() => window.assistantQa.snapshot());
  const reads: LifecycleReads = {
    async preflight() { return { origin: STAGING, project: PROJECT, scope, checkedAt: Date.now(), slots: [{ date: '2030-10-22', time: '10:00', startsAt: '2030-10-22T16:00:00Z', endsAt: '2030-10-22T16:30:00Z' }, { date: '2030-10-22', time: '11:00', startsAt: '2030-10-22T17:00:00Z', endsAt: '2030-10-22T17:30:00Z' }], gates: Object.fromEntries(requiredGates.map(key => [key, { state: 'verified' as const, source: 'browser_simulated_read_only_boundary' }])) }; },
    async patients(journal) {
      const patient = (await snapshot()).fixturePatient;
      return patient?.name === journal.patientName ? [{ id: patient.id, clinic: scope.clinic, name: patient.name, createdBy: scope.actor, createdAt: patient.createdAt, status: patient.status }] : [];
    },
    async appointments() {
      const data = await snapshot();
      return data.appointments.map(row => ({ id: row.appointment_id, clinic: row.clinic_id, patient: row.patient_id, professional: row.professional_id, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, createdAt: data.fixturePatient!.createdAt, createdBy: scope.actor }));
    },
    async proposals() {
      const data = await snapshot();
      return data.pending.map((row, index): Proposal => ({ id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, '0')}`, kind: row.tool === 'create_appointment' ? 'create' : row.tool === 'reschedule_appointment' ? 'reschedule' : 'cancel', clinic: row.clinic, actor: scope.actor, patient: row.input.patientId as string | undefined, professional: row.input.professionalClinicMemberId as string | undefined, appointment: row.input.appointmentId as string | undefined, date: row.input.date as string | undefined, time: row.input.startTime as string | undefined, duration: row.input.durationMinutes as number | undefined, status: row.status, mutationExecuted: row.status === 'executed' }));
    },
    async audit() { return (await snapshot()).audit; },
    async assertOneShot(_journal, pending) {
      const outcome = await page.evaluate(id => window.assistantQa.confirmAgain(id), pending.id);
      expect(outcome.ok).toBe(false);
    }
    // No real second account exists in component integration. LIVE-006 must
    // remain BLOCKED rather than claiming a real tenant-isolation result.
  };
  return { store, reads, snapshot };
}
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw new Error(`Isolated lifecycle harness: ${error.message}`); });
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:3117' ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Appointment Assistant', exact: true })).toBeVisible();
});
test('lifecycle runner drives actual patient forms and assistant create/read/reschedule/cancel with simulated persistence', async ({ page }) => {
  const { reads, store, snapshot } = await fixtures(page);
  const adapter = new BrowserLifecycleAdapter(page, reads, 'http://127.0.0.1:3117');
  const outcome = await runLifecycle(adapter, store, true);
  expect(outcome).toMatchObject({ status: 'PARTIAL', passed: ['LIVE-001', 'LIVE-002', 'LIVE-003', 'LIVE-004', 'LIVE-005'], blocked: ['LIVE-006'], cleanup: 'PASS' });
  const data = await snapshot();
  expect(data.appointments).toHaveLength(1); expect(data.appointments[0].status).toBe('cancelled');
  expect(data.fixturePatient?.status).toBe('inactive');
  expect(data.audit).toEqual(['created', 'rescheduled', 'cancelled']);
  expect(store.read().state).toBe('clean');
});
test('browser lifecycle cannot create a fixture with unknown notification evidence', async ({ page }) => {
  const { reads, store, snapshot } = await fixtures(page);
  const original = reads.preflight;
  reads.preflight = async patient => { const result = await original(patient); result.gates.email = { state: 'unknown', source: 'not_verified' }; return result; };
  const outcome = await runLifecycle(new BrowserLifecycleAdapter(page, reads, 'http://127.0.0.1:3117'), store, true);
  expect(outcome.status).toBe('FAIL');
  expect((await snapshot()).fixturePatient).toBeNull();
  expect((await snapshot()).mutations).toBe(0);
});
