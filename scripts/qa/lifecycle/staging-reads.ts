import { createServerClient } from '@supabase/ssr';
import type { BrowserContext, Page } from '@playwright/test';
import { getPlanEntitlements } from '../../../config/plans.ts';
import { getClinicDayRange } from '../../../lib/dashboard/timezone.ts';
import { PROJECT, STAGING, requireQa, type Appointment, type Gate, type Journal, type Patient, type Preflight, type Proposal, type Scope, type Slot } from './contracts.ts';
import type { LifecycleReads } from './browser.ts';
import { canonicalSlots, discoverSchedule, futureDates, qaProfessionals } from './discovery.ts';
import { runtimeVerificationBoundary } from './runtime-verification.ts';
import { acquireTrustedRuntimeProof } from './signed-runtime-evidence.ts';

type Row = Record<string, unknown>;
export function publicKeyOnly(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { return false; }
}
const pass = (source: string): Gate => ({ state: 'verified', source });
const check = (condition: unknown, source: string): Gate => ({ state: condition ? 'verified' : 'blocked', source });

/** Normal browser session -> read-only PostgREST verification. No service role,
 * table writes or synthetic JWT. Only the one-shot negative test uses the same
 * authorized mutation RPC as the application, after a verified execution. */
export async function stagingReads(page: Page, context: BrowserContext, env: Record<string, string | undefined>, recovery?: Scope): Promise<LifecycleReads> {
  requireQa(env.ASSISTANT_QA_SUPABASE_URL === PROJECT && publicKeyOnly(env.ASSISTANT_QA_PUBLISHABLE_KEY ?? ''), 'approved_public_supabase_configuration_required');
  const client = createServerClient(PROJECT, env.ASSISTANT_QA_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: async () => (await context.cookies(STAGING)).map(({ name, value }) => ({ name, value })),
      setAll: async values => context.addCookies(values.map(({ name, value, options }) => ({ name, value, domain: new URL(STAGING).hostname, path: '/', secure: true, httpOnly: options.httpOnly ?? false, sameSite: 'Lax' as const })))
    }
  });
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await client.rpc(name, args);
    requireQa(!result.error, 'protected_read_failed');
    return result.data;
  }
  async function rows(table: string, columns: string, filters: Record<string, string>): Promise<Row[]> {
    let query = client.from(table).select(columns);
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
    const result = await query.limit(100);
    requireQa(!result.error && Array.isArray(result.data) && result.data.length < 100, 'protected_read_failed_or_truncated');
    return result.data as unknown as Row[];
  }
  const actor = await client.auth.getUser();
  requireQa(!actor.error && actor.data.user && actor.data.user.email === env.ASSISTANT_QA_EMAIL && /^qa\.owner\.(norte|sur)@clinicontrol\.mx$/.test(actor.data.user.email!), 'qa_owner_identity_required');
  const memberships = await rows('clinic_members', 'id,clinic_id,role,status', { user_id: actor.data.user.id, status: 'active' });
  requireQa(memberships.length === 1 && memberships[0].role === 'owner', 'single_qa_owner_membership_required');
  const clinic = await rows('clinics', 'id,name,timezone,tenant_type', { id: String(memberships[0].clinic_id) });
  requireQa(clinic.length === 1 && clinic[0].tenant_type === 'qa' && clinic[0].name === env.ASSISTANT_QA_CLINIC, 'qa_tenant_type_required');
  requireQa(!recovery || recovery.actor === actor.data.user.id && recovery.clinic === clinic[0].id, 'recovery_scope_mismatch');
  const professionals = await rpc('list_clinic_members_for_current_user', { target_clinic_id: clinic[0].id }) as Row[];
  // The engine steps from each working window's start (which need not be :00).
  // Preserve one-minute enumeration, then select only canonical :00/:30 slots.
  const readSlots = async (member: string, date: string) => await rpc('get_professional_available_slots', { p_clinic_id: clinic[0].id, p_clinic_member_id: member, p_local_date: date, p_duration_minutes: 30, p_slot_interval_minutes: 1, p_buffer_before_minutes: 0, p_buffer_after_minutes: 0 }) as Row[];
  const candidates = qaProfessionals(professionals, recovery?.professional ?? env.ASSISTANT_QA_PROFESSIONAL_MEMBER);
  const dates = futureDates(getClinicDayRange(String(clinic[0].timezone)).localDate, recovery ? undefined : env.ASSISTANT_QA_DATE);
  const discovered = recovery ? { professional: candidates[0], date: dates[0] } : await discoverSchedule(candidates, dates, readSlots);
  const professional = discovered.professional;
  const scope: Scope = { actor: actor.data.user.id, clinic: String(clinic[0].id), professional: String(professional.id), professionalUser: String(professional.user_id), professionalName: String(professional.full_name), clinicName: String(clinic[0].name), timeZone: String(clinic[0].timezone) };
  const patients = async (journal: Journal): Promise<Patient[]> => (await rows('patients', 'id,clinic_id,full_name,created_by,created_at,status', { clinic_id: journal.scope.clinic, full_name: journal.patientName })).map(row => ({ id: String(row.id), clinic: String(row.clinic_id), name: String(row.full_name), createdBy: String(row.created_by), createdAt: String(row.created_at), status: String(row.status) }));
  const appointments = async (journal: Journal): Promise<Appointment[]> => {
    requireQa(journal.patient, 'patient_required');
    const records = await rows('appointments', 'id,clinic_id,patient_id,doctor_id,starts_at,ends_at,status,created_at', { clinic_id: journal.scope.clinic, patient_id: journal.patient });
    return Promise.all(records.map(async row => {
      const events = await rows('appointment_events', 'actor_user_id', { clinic_id: journal.scope.clinic, appointment_id: String(row.id), event_type: 'created' });
      requireQa(events.length === 1, 'creation_audit_unverified');
      return { id: String(row.id), clinic: String(row.clinic_id), patient: String(row.patient_id), professional: String(row.doctor_id), startsAt: String(row.starts_at), endsAt: String(row.ends_at), status: String(row.status), createdAt: String(row.created_at), createdBy: String(events[0].actor_user_id) };
    }));
  };
  const proposals = async (journal: Journal): Promise<Proposal[]> => {
    requireQa(journal.patient, 'patient_required');
    const result = await client.from('assistant_pending_actions').select('id,clinic_id,actor_user_id,tool_name,validated_arguments,status,mutation_executed_at,expires_at,created_at')
      .eq('clinic_id', journal.scope.clinic).eq('actor_user_id', journal.scope.actor).gte('created_at', journal.startedAt).order('created_at').limit(100);
    requireQa(!result.error && result.data && result.data.length < 100, 'pending_action_read_failed');
    return (result.data as Row[]).filter(row => {
      const args = row.validated_arguments as Row;
      return args.patient_id === journal.patient || journal.appointments.includes(String(args.appointment_id));
    }).map(row => {
      const args = row.validated_arguments as Row;
      return { id: String(row.id), clinic: String(row.clinic_id), actor: String(row.actor_user_id), kind: row.tool_name === 'create_appointment' ? 'create' : row.tool_name === 'reschedule_appointment' ? 'reschedule' : 'cancel', status: row.status === 'pending' && Date.parse(String(row.expires_at)) <= Date.now() ? 'expired' : String(row.status), mutationExecuted: row.mutation_executed_at !== null, patient: args.patient_id as string | undefined, appointment: args.appointment_id as string | undefined, professional: args.professional_clinic_member_id as string | undefined, date: args.local_date as string | undefined, time: args.local_time as string | undefined, duration: args.duration_minutes as number | undefined };
    });
  };
  return {
    patients, appointments, proposals,
    async preflight(patient) {
      const freshUser = await client.auth.getUser();
      requireQa(!freshUser.error && freshUser.data.user?.id === scope.actor, 'session_changed');
      const active = await rows('clinic_members', 'id,clinic_id,role,status', { user_id: scope.actor, status: 'active' });
      const activeClinic = await rows('clinics', 'id,name,tenant_type', { id: scope.clinic });
      const subscription = await rows('clinic_subscriptions', 'plan_id,status,current_period_end', { clinic_id: scope.clinic });
      const sub = subscription[0];
      const allowed = sub && ['plus', 'pro'].includes(String(sub.plan_id)) && getPlanEntitlements(sub.plan_id as 'plus' | 'pro').features.appointment_assistant && (sub.status === 'active' || sub.status === 'trialing' && Date.parse(String(sub.current_period_end)) > Date.now());
      const members = await rpc('list_clinic_members_for_current_user', { target_clinic_id: scope.clinic }) as Row[];
      const scheduler = await rpc('get_appointment_automation_scheduler_status_for_current_user', { p_clinic_id: scope.clinic }) as Row[];
      const calendars = await rpc('list_google_calendar_integration_status_for_current_user', { p_clinic_id: scope.clinic }) as Row[];
      const date = discovered.date;
      const futureDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date > getClinicDayRange(scope.timeZone).localDate;
      const slots: Slot[] = futureDate ? canonicalSlots(await readSlots(scope.professional, date), date).slice(0, 2) : [];
      const readyResponse = await page.request.get(`${STAGING}/api/ready`);
      const ready = readyResponse.ok() ? await readyResponse.json() : null;
      const formResponse = await page.request.get(`${STAGING}/dashboard/patients/${patient ? `${patient}/edit` : 'new'}`);
      const form = formResponse.ok() && new URL(formResponse.url()).origin === STAGING ? await formResponse.text() : '';
      const independent = await acquireTrustedRuntimeProof();
      const runtime = runtimeVerificationBoundary(new URL(page.url()).origin, ready, independent.proof);
      return {
        origin: new URL(page.url()).origin, project: PROJECT, scope, slots, checkedAt: Date.now(), runtime: runtime.observations,
        gates: {
          authenticatedQa: pass('auth.getUser_verified_email'),
          qaTenant: check(activeClinic.length === 1 && activeClinic[0].tenant_type === 'qa' && activeClinic[0].name === scope.clinicName, 'RLS_clinics_tenant_type'),
          permissions: check(active.length === 1 && active[0].clinic_id === scope.clinic && active[0].role === 'owner' && allowed, 'RLS_membership_and_subscription'),
          professional: check(members.some(row => row.id === scope.professional && row.user_id === scope.professionalUser && row.status === 'active' && row.is_professional === true), 'authorized_member_RPC'),
          patientEligibility: patient ? check(await rpc('is_patient_eligible_for_scheduling', { p_clinic_id: scope.clinic, p_professional_clinic_member_id: scope.professional, p_patient_id: patient }) === true, 'canonical_eligibility_RPC') : { state: 'unknown', source: 'verify_after_patient_creation_before_proposal' },
          availability: check(slots.length >= 2, 'canonical_future_slot_RPC'),
          email: check(ready?.checks?.email === 'disabled', 'current_api_ready_email_configuration'),
          automations: check(scheduler.length === 1 && scheduler[0].assistant_enabled === false && scheduler[0].reminder_enabled === false && scheduler[0].review_request_enabled === false, 'current_scheduler_status_RPC'),
          calendar: check(!calendars.some(row => row.status === 'connected'), 'owner_safe_calendar_status_RPC'),
          whatsapp: runtime.whatsapp,
          deployment: runtime.deployment,
          cleanup: check(form.includes('name="status"') && form.includes('value="inactive"') && (patient ? form.includes('Guardar cambios') : form.includes('Guardar y hacerlo después')), 'current_authorized_patient_form_and_inactive_option')
        }
      } satisfies Preflight;
    },
    async audit(journal, appointment) { return (await rows('appointment_events', 'event_type', { clinic_id: journal.scope.clinic, appointment_id: appointment })).map(row => String(row.event_type)); },
    async assertOneShot(journal, proposal) {
      requireQa(proposal.clinic === journal.scope.clinic && proposal.actor === journal.scope.actor && proposal.status === 'executed' && proposal.mutationExecuted, 'duplicate_test_scope_invalid');
      const result = await client.rpc('execute_claimed_assistant_pending_action_for_current_user', { p_action_id: proposal.id });
      requireQa(result.error?.code === '42501', 'duplicate_execution_not_rejected');
    },
    async isolation(journal) {
      if (!env.ASSISTANT_QA_OTHER_EMAIL || !env.ASSISTANT_QA_OTHER_PASSWORD) return false;
      requireQa(/^qa\.owner\.(norte|sur)@clinicontrol\.mx$/.test(env.ASSISTANT_QA_OTHER_EMAIL) && env.ASSISTANT_QA_OTHER_EMAIL !== env.ASSISTANT_QA_EMAIL && journal.patient && journal.appointments.length === 1, 'other_qa_identity_required');
      const other = await context.browser()!.newContext({ serviceWorkers: 'block' });
      try {
        await other.route('**/*', route => [STAGING, PROJECT].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
        const otherPage = await other.newPage(); otherPage.setDefaultTimeout(20_000);
        await otherPage.goto(`${STAGING}/login`);
        requireQa(new URL(otherPage.url()).origin === STAGING, 'other_origin_invalid');
        await otherPage.getByLabel('Email', { exact: true }).fill(env.ASSISTANT_QA_OTHER_EMAIL);
        await otherPage.getByLabel('Contraseña', { exact: true }).fill(env.ASSISTANT_QA_OTHER_PASSWORD);
        await otherPage.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
        await otherPage.waitForURL(`${STAGING}/dashboard**`);
        const otherClient = createServerClient(PROJECT, env.ASSISTANT_QA_PUBLISHABLE_KEY!, { cookies: { getAll: async () => (await other.cookies(STAGING)).map(({ name, value }) => ({ name, value })), setAll: () => {} } });
        const otherUser = await otherClient.auth.getUser();
        requireQa(!otherUser.error && otherUser.data.user?.email === env.ASSISTANT_QA_OTHER_EMAIL && otherUser.data.user.id !== scope.actor, 'other_qa_authentication_failed');
        const membership = await otherClient.from('clinic_members').select('clinic_id,role').eq('user_id', otherUser.data.user.id).eq('status', 'active').limit(2);
        requireQa(!membership.error && membership.data?.length === 1 && membership.data[0].role === 'owner' && membership.data[0].clinic_id !== scope.clinic, 'other_tenant_membership_invalid');
        const otherClinic = await otherClient.from('clinics').select('id,name,tenant_type').eq('id', membership.data[0].clinic_id);
        const otherName = env.ASSISTANT_QA_OTHER_EMAIL.includes('.norte@') ? 'CliniControl QA Norte' : 'CliniControl QA Sur';
        requireQa(!otherClinic.error && otherClinic.data?.length === 1 && otherClinic.data[0].tenant_type === 'qa' && otherClinic.data[0].name === otherName, 'other_qa_tenant_invalid');
        // Only this run's two synthetic references are probed. No enumeration
        // of unrelated patient/appointment records in either clinic.
        const patient = await otherClient.from('patients').select('id').eq('id', journal.patient).eq('clinic_id', scope.clinic);
        const appointment = await otherClient.from('appointments').select('id').eq('id', journal.appointments[0]).eq('clinic_id', scope.clinic);
        requireQa(!patient.error && !appointment.error && patient.data?.length === 0 && appointment.data?.length === 0, 'cross_tenant_read_leak_or_unverified');
        return true;
      } finally { await other.clearCookies().catch(() => {}); await other.close().catch(() => {}); }
    }
  };
}
