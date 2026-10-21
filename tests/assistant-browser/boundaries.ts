import type { AssistantConversationContext } from '../../lib/assistant/orchestration/context';
import type { AssistantTimeFilter } from '../../lib/assistant/orchestration/time-filter';
import { assistantTimeMatches } from '../../lib/assistant/orchestration/time-filter';

export const today = '2030-10-21';
export const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  norte: '22222222-2222-4222-8222-222222222222',
  sur: '22222222-2222-4222-8222-222222222223',
  patient: '33333333-3333-4333-8333-333333333333',
  otherPatient: '33333333-3333-4333-8333-333333333334',
  professional: '44444444-4444-4444-8444-444444444444',
  otherProfessional: '44444444-4444-4444-8444-444444444445',
  appointment: '55555555-5555-4555-8555-555555555555'
};
type Appointment = {
  appointment_id: string; patient_id: string; patient_display_name: string;
  professional_id: string; professional_display_name: string;
  starts_at: string; ends_at: string; status: string; clinic_id: string;
};
type Pending = { tool: string; input: Record<string, unknown>; status: string; clinic: string };
export const state = {
  authenticated: true, clinic: ids.norte, failRead: false, empty: false,
  mutations: 0, confirmations: 0, pending: new Map<string, Pending>(), appointments: [] as Appointment[],
  context: null as AssistantConversationContext | null,
  reads: [] as Array<{ name: string; input: Record<string, unknown> }>,
  events: [] as Array<{ event: string; metadata: Record<string, unknown> }>
};
function times(date: string, time: string, duration: number) {
  const start = new Date(`${date}T${time}:00-06:00`);
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + duration * 60_000).toISOString() };
}
export function seedAppointment(input = { date: '2030-10-22', startTime: '10:00', durationMinutes: 30 }) {
  state.appointments.push({ appointment_id: ids.appointment, patient_id: ids.patient, patient_display_name: 'QA Patient Norte', professional_id: ids.professional, professional_display_name: 'QA Doctor Norte', ...times(input.date, input.startTime, input.durationMinutes), status: 'scheduled', clinic_id: ids.norte });
}
const denied = () => ({ ok: false as const, error: { code: 'forbidden', safeMessage: 'Debes iniciar sesión o usar una referencia autorizada.' } });
const ready = <T,>(data: T) => ({ ok: true as const, data });
export async function getAssistantToolContext() {
  return state.authenticated ? ready({ userId: ids.actor, clinicId: state.clinic, clinicMemberId: ids.professional, role: 'assistant', isProfessional: false, timeZone: 'America/Mexico_City' }) : denied();
}
export function getClinicDayRange() { return { localDate: today }; }
export const logger = { info(event: string, metadata: Record<string, unknown> = {}) { state.events.push({ event, metadata }); }, error() {} };
export function revalidatePath() {}
export function redirect() { throw new Error('Unexpected redirect in component harness'); }
export async function saveAppointmentAssistantSettingsForActiveTenant() { throw new Error('Settings not supported in component harness'); }
export async function openAiPlannerProvider() { throw new Error('Real provider forbidden in component harness'); }
export async function isPatientAvailableForActiveTenant(ref: string) { return state.authenticated && ref === (state.clinic === ids.norte ? ids.patient : ids.otherPatient); }
export async function isPatientEligibleForSchedulingWithProfessionalActiveTenant(patient: string, professional: string) {
  return await isPatientAvailableForActiveTenant(patient) && professional === (state.clinic === ids.norte ? ids.professional : ids.otherProfessional);
}
export async function getPatientEligibleProfessionalIdsForSchedulingActiveTenant(patient: string) {
  return { state: 'ready', ids: await isPatientAvailableForActiveTenant(patient) ? [state.clinic === ids.norte ? ids.professional : ids.otherProfessional] : [] };
}
export async function searchAssistantPatientNamesForActiveTenant(query: string) {
  const rows = state.authenticated ? [{ id: state.clinic === ids.norte ? ids.patient : ids.otherPatient, name: state.clinic === ids.norte ? 'QA Patient Norte' : 'QA Patient Sur' }] : [];
  return { state: 'ready', data: { patients: rows.filter(row => row.name.toLowerCase().includes(query.toLowerCase())), hasMore: false } };
}
export async function executeAssistantReadTool(name: string, input: Record<string, unknown> = {}): Promise<{ ok: true; data: unknown } | ReturnType<typeof denied>> {
  if (!state.authenticated) return denied();
  state.reads.push({ name, input: structuredClone(input) });
  const norte = state.clinic === ids.norte;
  if (name === 'search_patients') return ready([{ patient_id: norte ? ids.patient : ids.otherPatient, display_name: norte ? 'QA Patient Norte' : 'QA Patient Sur', status: 'active' }]);
  if (name === 'get_professionals') return ready([{ professional_clinic_member_id: norte ? ids.professional : ids.otherProfessional, professional_user_id: norte ? ids.professional : ids.otherProfessional, display_name: norte ? 'QA Doctor Norte' : 'QA Doctor Sur' }]);
  if (name === 'get_available_slots') {
    if (input.professionalClinicMemberId !== (norte ? ids.professional : ids.otherProfessional)) return denied();
    return ready([{ local_start: '10:00', local_end: '10:30' }, { local_start: '11:00', local_end: '11:30' }]);
  }
  if (name === 'get_appointment') {
    const row = state.appointments.find(row => row.appointment_id === input.appointmentId && row.clinic_id === state.clinic);
    return row ? ready(row) : denied();
  }
  if (name === 'search_appointments') {
    if (state.failRead) return { ok: false, error: { code: 'generic', safeMessage: 'No fue posible consultar la agenda. Intenta de nuevo.' } };
    return ready(state.empty ? [] : state.appointments.filter(row => {
      const local = new Date(new Date(row.starts_at).getTime() - 6 * 60 * 60_000).toISOString();
      return row.clinic_id === state.clinic && (!input.date || local.startsWith(String(input.date))) && (!input.timeFilter || assistantTimeMatches(local.substring(11, 16), input.timeFilter as AssistantTimeFilter));
    }));
  }
  throw new Error(`Unsupported test boundary: ${name}`);
}
export async function getCreateAppointmentProposalPresentation() { return ready({ patient: 'QA Patient Norte', professional: 'QA Doctor Norte' }); }
export async function prepareAssistantMutation(tool: string, input: Record<string, unknown>) {
  if (!state.authenticated) return denied();
  const actionId = `66666666-6666-4666-8666-${String(state.pending.size + 1).padStart(12, '0')}`;
  state.pending.set(actionId, { tool, input: structuredClone(input), status: 'pending', clinic: state.clinic });
  return ready({ actionId, toolName: tool, expiresAt: '2030-10-23T00:00:00Z', summary: 'QA proposal' });
}
export async function executeConfirmedAssistantAction(actionId: string) {
  state.confirmations++;
  const pending = state.pending.get(actionId);
  if (!state.authenticated || !pending || pending.clinic !== state.clinic || pending.status !== 'pending') return denied();
  pending.status = 'executed';
  state.mutations++;
  if (pending.tool === 'create_appointment') seedAppointment({ date: String(pending.input.date), startTime: String(pending.input.startTime), durationMinutes: Number(pending.input.durationMinutes) });
  else {
    const row = state.appointments.find(row => row.appointment_id === pending.input.appointmentId && row.clinic_id === state.clinic);
    if (!row) throw new Error('Missing mock appointment');
    if (pending.tool === 'cancel_appointment') row.status = 'cancelled';
    else if (pending.tool === 'reschedule_appointment') {
      Object.assign(row, times(String(pending.input.date), String(pending.input.startTime), Number(pending.input.durationMinutes)));
    }
  }
  // Keep the UI busy long enough for the duplicate-click assertion.
  await new Promise(resolve => setTimeout(resolve, 100));
  return ready({});
}
export async function cancelAssistantPendingAction(actionId: string) {
  const pending = state.pending.get(actionId);
  if (!pending || !state.authenticated || pending.clinic !== state.clinic) return denied();
  pending.status = 'cancelled';
  return ready({ status: 'cancelled' });
}
