import type { Page, Route } from '@playwright/test';
import { MutationNotDispatched, STAGING, requireQa, type Appointment, type Journal, type LifecycleAdapter, type Patient, type Preflight, type Proposal, type Slot } from './contracts.ts';

export interface LifecycleReads {
  preflight(patient?: string): Promise<Preflight>;
  patients(journal: Journal): Promise<Patient[]>;
  appointments(journal: Journal): Promise<Appointment[]>;
  proposals(journal: Journal): Promise<Proposal[]>;
  audit(journal: Journal, appointment: string): Promise<string[]>;
  assertOneShot(journal: Journal, proposal: Proposal): Promise<void>;
  isolation?(journal: Journal): Promise<boolean>;
  authorizeMutation?(journal: Journal, cleanupMode: boolean): Promise<void>;
  assertMutationLease?(): void;
}

/** Installed by the live CLI after its origin allowlist. Check at HTTP dispatch,
 * after Playwright navigation/autowait; an expired click must never be sent.
 * Read-only discovery and login remain available for traceability/recovery.
 */
export async function guardLifecycleWrite(route: Route, reads?: LifecycleReads) {
  const request = route.request(), url = new URL(request.url());
  if (url.origin === STAGING && (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) && !['GET', 'HEAD'].includes(request.method())) {
    try { requireQa(reads?.assertMutationLease, 'runtime_mutation_permit_required'); reads.assertMutationLease(); }
    catch { await route.abort('blockedbyclient'); return; }
  }
  await route.continue();
}
/** All writes use existing forms and assistant controls. Read verification is
 * injected separately so tests can exercise the SAME runner with browser mocks. */
export class BrowserLifecycleAdapter implements LifecycleAdapter {
  private visibleProposal?: string;
  readonly page: Page; readonly reads: LifecycleReads; readonly origin: string;
  constructor(page: Page, reads: LifecycleReads, origin: string) { this.page = page; this.reads = reads; this.origin = origin; }
  preflight = (patient?: string) => this.reads.preflight(patient);
  findPatients = (journal: Journal) => this.reads.patients(journal);
  appointments = (journal: Journal) => this.reads.appointments(journal);
  proposals = (journal: Journal) => this.reads.proposals(journal);
  audit = (journal: Journal, appointment: string) => this.reads.audit(journal, appointment);
  assertOneShot = (journal: Journal, proposal: Proposal) => this.reads.assertOneShot(journal, proposal);
  isolation = (journal: Journal) => this.reads.isolation?.(journal) ?? Promise.resolve(false);
  private assistant() { return this.page.locator('section').filter({ has: this.page.getByRole('heading', { name: 'Appointment Assistant', exact: true }) }); }
  private async authorize(journal: Journal, cleanupMode = false) {
    try {
      if (this.origin === STAGING) requireQa(this.reads.authorizeMutation, 'runtime_mutation_permit_required');
      await this.reads.authorizeMutation?.(journal, cleanupMode);
    } catch { throw new MutationNotDispatched(); }
  }
  private async open() {
    await this.page.goto(`${this.origin}/dashboard/bot`);
    await this.assistant().getByLabel('Escribe una solicitud', { exact: true }).waitFor({ state: 'visible' });
  }
  private async send(message: string, journal: Journal, cleanupMode = false) {
    const assistant = this.assistant();
    const input = assistant.getByLabel('Escribe una solicitud', { exact: true });
    await this.authorize(journal, cleanupMode);
    await input.fill(message);
    await assistant.getByRole('button', { name: 'Enviar', exact: true }).click();
    // Wait for the turn's input reset as well as the end of the transition.
    await this.page.waitForFunction(() => {
      const input = document.getElementById('assistant-request') as HTMLInputElement | null;
      return input && input.value === '' && !input.disabled;
    });
  }
  async createPatient(journal: Journal) {
    await this.page.goto(`${this.origin}/dashboard/patients/new`);
    await this.page.locator('#first_names').fill('QAauto');
    await this.page.locator('#paternal_surname').fill(journal.patientName.slice(7));
    await this.page.locator('#date_of_birth').fill('1990-01-01');
    await this.page.locator('#sex').selectOption('unspecified');
    await this.page.locator('#phone').fill(journal.phone);
    await this.page.locator('#email').fill('');
    await this.page.locator('#emergency_contact_name').fill('Contacto QA ficticio');
    await this.page.locator('#emergency_contact_relationship').fill('QA');
    await this.page.locator('#emergency_contact_phone').fill(journal.phone);
    await this.authorize(journal);
    await this.page.getByRole('button', { name: 'Guardar y hacerlo después', exact: true }).click();
    await this.page.waitForURL(/\/dashboard\/patients\/[a-f0-9-]+\?/);
  }
  async prepare(journal: Journal, kind: Proposal['kind'], slot?: Slot) {
    const before = await this.reads.proposals(journal);
    await this.open();
    if (kind === 'create') {
      requireQa(slot, 'slot_required');
      await this.send(`Quiero agendar una cita para ${slot.date}`, journal);
      // Typeahead is patient-scoped and bypasses the provider on selection.
      await this.authorize(journal);
      await this.assistant().getByLabel('Escribe una solicitud', { exact: true }).fill(journal.patientName);
      await this.assistant().getByRole('group', { name: 'Sugerencias de pacientes' }).getByRole('button', { name: journal.patientName, exact: true }).click();
      await this.authorize(journal);
      await this.assistant().getByLabel('Escribe una solicitud', { exact: true }).fill(journal.scope.professionalName);
      await this.assistant().getByRole('group', { name: 'Sugerencias de profesionales' }).getByRole('button', { name: journal.scope.professionalName, exact: true }).click();
      const end = slot.endsAt;
      const localEnd = new Intl.DateTimeFormat('en-GB', { timeZone: journal.scope.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(end));
      await this.authorize(journal);
      await this.assistant().getByRole('button', { name: `${slot.time}–${localEnd}`, exact: true }).last().click();
    } else {
      // Search by this run's unique synthetic name; never choose the first
      // unrelated appointment or enumerate the clinic's full history.
      const owned = await this.reads.appointments(journal);
      requireQa(owned.length === 1 && owned[0].id === journal.appointments[0], 'appointment_lookup_scope_invalid');
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: journal.scope.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(owned[0].startsAt));
      await this.send(`Muéstrame el ${date} las citas de ${journal.patientName}`, journal, kind === 'cancel');
      const choice = this.assistant().getByRole('button').filter({ hasText: journal.patientName });
      requireQa(await choice.count() === 1, 'appointment_choice_not_unique');
      await this.authorize(journal, kind === 'cancel');
      await choice.click();
      if (kind === 'cancel') await this.send('Cancela la cita', journal, true);
      else { requireQa(slot && slot.date === date, 'same_day_alternative_slot_required'); await this.send(`Reprográmala a las ${slot.time}`, journal); }
    }
    await this.assistant().getByText('Propuesta pendiente', { exact: true }).waitFor({ state: 'visible' });
    const card = await this.assistant().getByText('Propuesta pendiente', { exact: true }).locator('..').textContent();
    requireQa(card?.includes(journal.patientName) && card.includes(journal.scope.professionalName) && (!slot || card.includes(slot.time)), 'proposal_presentation_mismatch');
    const created = (await this.reads.proposals(journal)).filter(row => !before.some(prior => prior.id === row.id));
    requireQa(created.length === 1, 'visible_proposal_not_unique');
    this.visibleProposal = created[0].id;
  }
  async confirm(journal: Journal, duplicate = false) {
    const button = this.assistant().getByRole('button', { name: 'Confirmar', exact: true });
    await this.authorize(journal, journal.step.includes('cancel'));
    if (duplicate) await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    else await button.click();
    await button.waitFor({ state: 'detached' });
    await this.assistant().getByText(/^Cita (?:creada|reprogramada|cancelada) correctamente\.$/).last().waitFor({ state: 'visible' });
  }
  async assertRead(journal: Journal, slot: Slot) {
    await this.open();
    await this.send(`Muéstrame el ${slot.date} las citas de ${journal.patientName}`, journal);
    const choice = this.assistant().getByRole('button').filter({ hasText: journal.patientName });
    requireQa(await choice.count() === 1, 'assistant_read_not_unique');
    await this.authorize(journal);
    await choice.click();
    await this.assistant().getByText('Encontré la cita solicitada.', { exact: true }).waitFor({ state: 'visible' });
    const text = await this.assistant().textContent();
    requireQa(text?.includes(journal.patientName) && text.includes(journal.scope.professionalName) && text.includes(slot.time), 'assistant_read_presentation_mismatch');
  }
  async cancelProposal(journal: Journal, pending: Proposal) {
    // Durable recovery does not replay an opaque server-action id. Let a
    // pending action expire, then verify it is no longer executable. A still
    // pending/claimed proposal blocks cleanup rather than becoming a new write.
    const current = (await this.reads.proposals(journal)).find(row => row.id === pending.id);
    if (current?.status === 'pending' && this.visibleProposal === pending.id) {
      await this.authorize(journal, true);
      await this.assistant().getByRole('button', { name: 'Cancelar', exact: true }).click();
      await this.assistant().getByText('Propuesta pendiente', { exact: true }).waitFor({ state: 'detached' });
      requireQa((await this.reads.proposals(journal)).find(row => row.id === pending.id)?.status === 'cancelled', 'proposal_cancellation_unverified');
      return;
    }
    requireQa(current && ['cancelled', 'expired', 'failed', 'executed'].includes(current.status), 'pending_proposal_requires_expiry');
  }
  async retirePatient(journal: Journal) {
    requireQa(journal.patient, 'patient_required');
    await this.page.goto(`${this.origin}/dashboard/patients/${journal.patient}/edit`);
    requireQa(await this.page.locator('#first_names').inputValue() === 'QAauto' && await this.page.locator('#paternal_surname').inputValue() === journal.patientName.slice(7), 'retire_patient_identity_mismatch');
    await this.page.locator('#status').selectOption('inactive');
    await this.authorize(journal, true);
    await this.page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await this.page.waitForURL(/\/dashboard\/patients\/[a-f0-9-]+\?updated=1/);
  }
  async isPatientRetired(journal: Journal) {
    const rows = await this.reads.patients(journal);
    return rows.length === 1 && rows[0].id === journal.patient && rows[0].status === 'inactive';
  }
}
