"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { parseAppointmentAssistantSettings } from "@/lib/appointment-assistant";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";
import { resolveUniqueEntity } from "@/lib/assistant/orchestration/intents";
import { isAssistantIntent } from "@/lib/assistant/parser/deterministic";
import {
  cancelAssistantPendingAction,
  executeAssistantReadTool,
  executeConfirmedAssistantAction,
  prepareAssistantMutation,
  type AssistantProposal
} from "@/lib/assistant/tools/registry";
import { saveAppointmentAssistantSettingsForActiveTenant } from "@/lib/server/appointment-assistant";

export async function saveAppointmentAssistantSettingsAction(formData: FormData) {
  const input = parseAppointmentAssistantSettings(formData);
  if (!input) redirect("/dashboard/bot?settings_error=1");

  const result = await saveAppointmentAssistantSettingsForActiveTenant(input);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "success") redirect("/dashboard/bot?settings_error=1");

  revalidatePath("/dashboard/bot");
  redirect("/dashboard/bot?saved=1");
}

export type AssistantUiResponse =
  | { state: "message"; message: string }
  | { state: "error"; message: string }
  | { state: "choices"; message: string; field: "patient" | "professional" | "appointment"; choices: Array<{ id: string; label: string }> }
  | { state: "slots"; professional: string; date: string; slots: Array<{ start: string; end: string }> }
  | { state: "appointments"; appointments: Array<{ id: string; patient: string; professional: string | null; startsAt: string; endsAt: string; status: string }> }
  | { state: "proposal"; proposal: AssistantProposal; action: string; patient?: string; professional?: string | null; date?: string; time?: string; previous?: string }
  | { state: "success"; message: string }
  | { state: "cancelled"; message: string };

type ReadPatient = { patient_id: string; display_name: string; status: string };
type ReadProfessional = { professional_id: string; display_name: string };
type ReadAppointment = { appointment_id: string; patient_id: string | null; patient_display_name: string; professional_id: string | null; professional_display_name: string | null; starts_at: string; ends_at: string; status: string };
type ReadSlot = { local_start: string; local_end: string };

function safeToolError(result: { ok: false; error: { safeMessage: string } }): AssistantUiResponse {
  return { state: "error", message: result.error.safeMessage };
}

async function readTool<T>(name: string, input: unknown) {
  return executeAssistantReadTool(name, input) as Promise<{ ok: true; data: T } | { ok: false; error: { safeMessage: string } }>;
}

function matchingAppointments(rows: ReadAppointment[], query?: string) {
  if (!query || isCanonicalAppointmentUuid(query)) return rows.filter((row) => !query || row.appointment_id === query);
  const needle = query.toLocaleLowerCase("es-MX");
  return rows.filter((row) => `${row.patient_display_name} ${row.professional_display_name ?? ""}`.toLocaleLowerCase("es-MX").includes(needle));
}

async function resolvePatient(query: string | undefined) {
  if (!query) return { state: "missing" as const };
  const result = await readTool<ReadPatient[]>("search_patients", { query });
  if (!result.ok) return { state: "error" as const, response: safeToolError(result) };
  const resolved = resolveUniqueEntity(result.data.map((patient) => ({ id: patient.patient_id, label: patient.display_name })));
  if (resolved.state === "NEEDS_INPUT") return { state: "none" as const, response: { state: "message", message: `No encontré un paciente que coincida con “${query}”.` } satisfies AssistantUiResponse };
  if (resolved.state === "AMBIGUOUS") return { state: "ambiguous" as const, response: { state: "choices", field: "patient", message: "Encontré más de un paciente con ese nombre. ¿Cuál quieres usar?", choices: result.data.slice(0, 10).map((patient) => ({ id: patient.patient_id, label: patient.display_name })) } satisfies AssistantUiResponse };
  return { state: "ready" as const, id: resolved.value.id, label: resolved.value.label };
}

async function resolveProfessional(query: string | undefined) {
  if (!query) return { state: "missing" as const };
  const result = await readTool<ReadProfessional[]>("get_professionals", {});
  if (!result.ok) return { state: "error" as const, response: safeToolError(result) };
  const needle = query.toLocaleLowerCase("es-MX");
  const matches = result.data.filter((professional) => professional.display_name.toLocaleLowerCase("es-MX").includes(needle));
  const resolved = resolveUniqueEntity(matches.map((professional) => ({ id: professional.professional_id, label: professional.display_name })));
  if (resolved.state === "NEEDS_INPUT") return { state: "none" as const, response: { state: "message", message: `No encontré un profesional que coincida con “${query}”.` } satisfies AssistantUiResponse };
  if (resolved.state === "AMBIGUOUS") return { state: "ambiguous" as const, response: { state: "choices", field: "professional", message: "Encontré más de un profesional con ese nombre. ¿Cuál quieres usar?", choices: matches.slice(0, 10).map((professional) => ({ id: professional.professional_id, label: professional.display_name })) } satisfies AssistantUiResponse };
  return { state: "ready" as const, id: resolved.value.id, label: resolved.value.label };
}

async function resolveAppointment(query: string | undefined, localDate?: string) {
  if (!query) return { state: "missing" as const };
  if (isCanonicalAppointmentUuid(query)) {
    const result = await readTool<ReadAppointment>("get_appointment", { appointmentId: query });
    if (!result.ok) return { state: "error" as const, response: safeToolError(result) };
    return { state: "ready" as const, appointment: result.data };
  }
  const result = await readTool<ReadAppointment[]>("search_appointments", { date: localDate ?? undefined });
  if (!result.ok) return { state: "error" as const, response: safeToolError(result) };
  const matches = matchingAppointments(result.data, query);
  if (!matches.length) return { state: "none" as const, response: { state: "message", message: `No encontré una cita que coincida con “${query}”.` } satisfies AssistantUiResponse };
  if (matches.length > 1) return { state: "ambiguous" as const, response: { state: "choices", field: "appointment", message: "Encontré más de una cita compatible. ¿Cuál quieres usar?", choices: matches.slice(0, 10).map((appointment) => ({ id: appointment.appointment_id, label: `${appointment.patient_display_name} · ${appointment.starts_at}` })) } satisfies AssistantUiResponse };
  return { state: "ready" as const, appointment: matches[0] };
}

function proposalResponse(proposal: AssistantProposal, action: string, values: { patient?: string; professional?: string | null; date?: string; time?: string; previous?: string }): AssistantUiResponse {
  return { state: "proposal", proposal, action, ...values };
}

export async function submitAssistantIntentAction(input: unknown): Promise<AssistantUiResponse> {
  if (!isAssistantIntent(input)) return { state: "error", message: "La solicitud no tiene un formato válido." };
  const intent = input as AssistantIntent;

  if (intent.type === "search_appointments") {
    const result = await readTool<ReadAppointment[]>("search_appointments", { date: intent.localDate ?? undefined });
    if (!result.ok) return safeToolError(result);
    const rows = matchingAppointments(result.data, intent.query);
    return { state: "appointments", appointments: rows.map((row) => ({ id: row.appointment_id, patient: row.patient_display_name, professional: row.professional_display_name, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status })) };
  }

  if (intent.type === "check_availability") {
    if (!intent.professionalQuery && !intent.professionalId) return { state: "message", message: "¿De qué profesional quieres consultar la disponibilidad?" };
    if (!intent.localDate) return { state: "message", message: "¿Para qué fecha necesitas los horarios?" };
    const professional = intent.professionalId ? { state: "ready" as const, id: intent.professionalId, label: "Profesional" } : await resolveProfessional(intent.professionalQuery);
    if (professional.state !== "ready") return professional.state === "error" || professional.state === "none" || professional.state === "ambiguous" ? professional.response : { state: "message", message: "¿De qué profesional quieres consultar la disponibilidad?" };
    const slots = await readTool<ReadSlot[]>("get_available_slots", { professionalId: professional.id, date: intent.localDate, durationMinutes: intent.durationMinutes });
    if (!slots.ok) return safeToolError(slots);
    return { state: "slots", professional: professional.label, date: intent.localDate, slots: slots.data.map((slot) => ({ start: slot.local_start, end: slot.local_end })) };
  }

  if (intent.type === "create_appointment") {
    if (!intent.patientId && !intent.patientQuery) return { state: "message", message: "¿Con qué paciente quieres agendarla?" };
    if (!intent.professionalId && !intent.professionalQuery) return { state: "message", message: "¿Con qué profesional quieres agendarla?" };
    if (!intent.localDate) return { state: "message", message: "¿Para qué fecha? Usa hoy, mañana o una fecha explícita." };
    if (!intent.localTime) return { state: "message", message: "¿A qué hora?" };
    const patient = intent.patientId ? { state: "ready" as const, id: intent.patientId, label: "Paciente" } : await resolvePatient(intent.patientQuery);
    if (patient.state !== "ready") return patient.state === "error" || patient.state === "none" || patient.state === "ambiguous" ? patient.response : { state: "message", message: "¿Con qué paciente quieres agendarla?" };
    const professional = intent.professionalId ? { state: "ready" as const, id: intent.professionalId, label: "Profesional" } : await resolveProfessional(intent.professionalQuery);
    if (professional.state !== "ready") return professional.state === "error" || professional.state === "none" || professional.state === "ambiguous" ? professional.response : { state: "message", message: "¿Con qué profesional quieres agendarla?" };
    const slots = await readTool<ReadSlot[]>("get_available_slots", { professionalId: professional.id, date: intent.localDate, durationMinutes: intent.durationMinutes });
    if (!slots.ok) return safeToolError(slots);
    if (!slots.data.some((slot) => slot.local_start === intent.localTime)) return { state: "message", message: "No encontré ese horario disponible para el profesional seleccionado." };
    const proposal = await prepareAssistantMutation("create_appointment", { patientId: patient.id, professionalId: professional.id, date: intent.localDate, startTime: intent.localTime, durationMinutes: intent.durationMinutes });
    if (!proposal.ok) return safeToolError(proposal);
    return proposalResponse(proposal.data, "Crear cita", { patient: patient.label, professional: professional.label, date: intent.localDate, time: intent.localTime });
  }

  if (intent.type !== "confirm_appointment" && intent.type !== "cancel_appointment" && intent.type !== "reschedule_appointment") {
    return { state: "error", message: "La solicitud no corresponde a una acción de agenda compatible." };
  }

  const appointment = await resolveAppointment(intent.appointmentId ?? intent.appointmentQuery, intent.type === "reschedule_appointment" ? intent.localDate : undefined);
  if (appointment.state !== "ready") return appointment.state === "error" || appointment.state === "none" || appointment.state === "ambiguous" ? appointment.response : { state: "message", message: "¿Qué cita quieres usar?" };
  const current = appointment.appointment;
  if (intent.type === "reschedule_appointment") {
    if (!intent.localDate) return { state: "message", message: "¿Para qué fecha quieres reprogramarla?" };
    if (!intent.localTime) return { state: "message", message: "¿A qué hora quieres reprogramarla?" };
    if (!current.professional_id) return { state: "error", message: "La cita no tiene un profesional disponible para reprogramarse." };
    const slots = await readTool<ReadSlot[]>("get_available_slots", { professionalId: current.professional_id, date: intent.localDate, durationMinutes: intent.durationMinutes });
    if (!slots.ok) return safeToolError(slots);
    if (!slots.data.some((slot) => slot.local_start === intent.localTime)) return { state: "message", message: "No encontré ese horario disponible para reprogramar la cita." };
    const proposal = await prepareAssistantMutation("reschedule_appointment", { appointmentId: current.appointment_id, expectedStatus: current.status, date: intent.localDate, startTime: intent.localTime, durationMinutes: intent.durationMinutes });
    if (!proposal.ok) return safeToolError(proposal);
    return proposalResponse(proposal.data, "Reprogramar cita", { patient: current.patient_display_name, professional: current.professional_display_name, date: intent.localDate, time: intent.localTime, previous: current.starts_at });
  }
  const toolName = intent.type === "confirm_appointment" ? "confirm_appointment" : "cancel_appointment";
  const proposal = await prepareAssistantMutation(toolName, { appointmentId: current.appointment_id, expectedStatus: current.status });
  if (!proposal.ok) return safeToolError(proposal);
  return proposalResponse(proposal.data, intent.type === "confirm_appointment" ? "Confirmar cita" : "Cancelar cita", { patient: current.patient_display_name, professional: current.professional_display_name, previous: current.starts_at });
}

export async function confirmAssistantProposalAction(actionId: unknown): Promise<AssistantUiResponse> {
  if (typeof actionId !== "string" || !isCanonicalAppointmentUuid(actionId)) return { state: "error", message: "La propuesta no es válida." };
  const result = await executeConfirmedAssistantAction(actionId);
  if (!result.ok) return { state: "error", message: result.error.safeMessage };
  revalidatePath("/dashboard/bot");
  revalidatePath("/dashboard/appointments");
  return { state: "success", message: "La acción se completó correctamente." };
}

export async function cancelAssistantProposalAction(actionId: unknown): Promise<AssistantUiResponse> {
  if (typeof actionId !== "string" || !isCanonicalAppointmentUuid(actionId)) return { state: "error", message: "La propuesta no es válida." };
  const result = await cancelAssistantPendingAction(actionId);
  if (!result.ok) return { state: "error", message: result.error.safeMessage };
  return { state: "cancelled", message: result.data.status === "expired" ? "Esta propuesta expiró. Vuelve a solicitar la acción." : "Acción cancelada." };
}
