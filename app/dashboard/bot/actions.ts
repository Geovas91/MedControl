"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { parseAppointmentAssistantSettings } from "@/lib/appointment-assistant";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";
import { resolveUniqueEntity } from "@/lib/assistant/orchestration/intents";
import { getDefaultSchedulingProfessional, type ContextualHelper } from "@/lib/assistant/orchestration/conversation";
import { resolveConversationInput, type ConversationInput } from "@/lib/assistant/orchestration/conversation";
import { isAssistantReadIntent, isValidAssistantReadIntent, orchestrateAssistantReadIntent, shouldOrchestrateAssistantReads, type AssistantReadResponse } from "@/lib/assistant/orchestration/read-tools";
import { planAssistantConversation } from "@/lib/assistant/llm/planner";
import { openAiPlannerProvider } from "@/lib/assistant/llm/provider";
import { logger } from "@/lib/logger";
import { isAssistantIntent, matchesAssistantQuery } from "@/lib/assistant/parser/deterministic";
import {
  cancelAssistantPendingAction,
  executeAssistantReadTool,
  executeConfirmedAssistantAction,
  getAssistantToolContext,
  getCreateAppointmentProposalPresentation,
  prepareAssistantMutation,
  type AssistantProposal
} from "@/lib/assistant/tools/registry";
import { saveAppointmentAssistantSettingsForActiveTenant } from "@/lib/server/appointment-assistant";
import { getClinicEntitlements, planIncludesFeature } from "@/lib/server/entitlements";

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
  | AssistantReadResponse
  | { state: "availability_retry"; message: string; intent: Extract<AssistantIntent, { type: "create_appointment" }>; alternatives: Array<{ start: string; end: string }> }
  | { state: "proposal"; proposal: AssistantProposal; action: string; patient?: string; professional?: string | null; date?: string; time?: string; previous?: string }
  | { state: "success"; message: string }
  | { state: "cancelled"; message: string }
  | { state: "proposal_terminal"; status: "failed" | "expired" | "cancelled" | "executed" | "unavailable"; message: string };

export async function planAssistantConversationAction(message: unknown, pending: unknown): Promise<ConversationInput> {
  const text = typeof message === "string" ? message.trim().slice(0, 501) : "";
  const context = await getAssistantToolContext();
  if (!context.ok) return { state: "parsed", result: { state: "unsupported", message: context.error.safeMessage } };
  if (!planIncludesFeature(await getClinicEntitlements(context.data.clinicId), "appointment_assistant")) {
    return { state: "parsed", result: { state: "unsupported", message: "El asistente no está disponible para esta clínica." } };
  }
  const today = getClinicDayRange(context.data.timeZone).localDate;
  const active = pending === null || pending === undefined ? null : isAssistantIntent(pending) ? pending as AssistantIntent : null;
  if (process.env.APPOINTMENT_ASSISTANT_LLM_ENABLED !== "true") return resolveConversationInput(active, text, today);
  return planAssistantConversation({ message: text, today, pending: active, role: context.data.role, isProfessional: context.data.isProfessional, timeZone: context.data.timeZone, enabled: true, readToolsEnabled: process.env.APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED === "true", provider: openAiPlannerProvider });
}

type ReadPatient = { patient_id: string; display_name: string; status: string };
type ReadProfessional = { professional_clinic_member_id: string; professional_user_id: string; display_name: string };
type ReadAppointment = { appointment_id: string; patient_id: string | null; patient_display_name: string; professional_id: string | null; professional_display_name: string | null; starts_at: string; ends_at: string; status: string };
type ReadSlot = { local_start: string; local_end: string };

function safeToolError(result: { ok: false; error: { safeMessage: string } }): AssistantUiResponse {
  return { state: "error", message: result.error.safeMessage };
}

async function readTool<T>(name: string, input: unknown) {
  return executeAssistantReadTool(name, input) as Promise<{ ok: true; data: T } | { ok: false; error: { code: string; safeMessage: string } }>;
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
  const matches = result.data.filter((professional) => matchesAssistantQuery(professional.display_name, query));
  const resolved = resolveUniqueEntity(matches.map((professional) => ({ id: professional.professional_clinic_member_id, label: professional.display_name })));
  if (resolved.state === "NEEDS_INPUT") return { state: "none" as const, response: { state: "message", message: `No encontré un profesional que coincida con “${query}”.` } satisfies AssistantUiResponse };
  if (resolved.state === "AMBIGUOUS") return { state: "ambiguous" as const, response: { state: "choices", field: "professional", message: "Encontré más de un profesional con ese nombre. ¿Cuál quieres usar?", choices: matches.slice(0, 10).map((professional) => ({ id: professional.professional_clinic_member_id, label: professional.display_name })) } satisfies AssistantUiResponse };
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

function availabilityRetryResponse(intent: Extract<AssistantIntent, { type: "create_appointment" }>, professional: string, reason: "date" | "time", alternatives: ReadSlot[] = []): AssistantUiResponse {
  const nextIntent = reason === "date"
    ? { ...intent, localDate: undefined, localTime: undefined }
    : { ...intent, localTime: undefined };
  const requested = intent.localTime ? ` a las ${intent.localTime}` : "";
  const message = reason === "date"
    ? `${professional} no tiene horarios disponibles para esa fecha. Puedes indicar otra fecha u hora y conservaré el paciente y profesional.`
    : `No hay disponibilidad para ${professional}${requested}. Puedes elegir otro horario o indicar otra fecha; conservaré el paciente y profesional.`;
  return { state: "availability_retry", message, intent: nextIntent, alternatives: alternatives.slice(0, 5).map((slot) => ({ start: slot.local_start, end: slot.local_end })) };
}

export async function submitAssistantIntentAction(input: unknown): Promise<AssistantUiResponse> {
  if (!isAssistantIntent(input)) return { state: "error", message: "La solicitud no tiene un formato válido." };
  const intent = input as AssistantIntent;

  if (shouldOrchestrateAssistantReads(process.env.APPOINTMENT_ASSISTANT_LLM_ENABLED === "true", process.env.APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED === "true") && isAssistantReadIntent(intent)) {
    if (!isValidAssistantReadIntent(intent)) return { state: "error", message: "La consulta no tiene un formato válido." };
    const context = await getAssistantToolContext();
    if (!context.ok) return safeToolError(context);
    if (!planIncludesFeature(await getClinicEntitlements(context.data.clinicId), "appointment_assistant")) return { state: "error", message: "El asistente no está disponible para esta clínica." };
    return orchestrateAssistantReadIntent(intent, {
      readTool: executeAssistantReadTool,
      today: getClinicDayRange(context.data.timeZone).localDate,
      timeZone: context.data.timeZone,
      defaultProfessionalClinicMemberId: getDefaultSchedulingProfessional(context.data),
      observe: (event, details) => logger.info(event, details)
    });
  }
  if (intent.type === "get_appointment" || intent.type === "get_professionals") return { state: "error", message: "Esta consulta no está habilitada." };

  if (intent.type === "search_patients") {
    const result = await readTool<ReadPatient[]>("search_patients", { query: intent.query });
    if (!result.ok) return safeToolError(result);
    return { state: "patients", patients: result.data.map((patient) => ({ id: patient.patient_id, name: patient.display_name })) };
  }

  if (intent.type === "search_appointments") {
    const result = await readTool<ReadAppointment[]>("search_appointments", { date: intent.localDate ?? undefined });
    if (!result.ok) return safeToolError(result);
    const rows = matchingAppointments(result.data, intent.query);
    return { state: "appointments", appointments: rows.map((row) => ({ id: row.appointment_id, patient: row.patient_display_name, professional: row.professional_display_name, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status })) };
  }

  if (intent.type === "check_availability") {
    const context = await getAssistantToolContext();
    if (!context.ok) return safeToolError(context);
    const defaultProfessionalId = !intent.professionalClinicMemberId && !intent.professionalQuery
      ? getDefaultSchedulingProfessional(context.data)
      : null;
    const workingIntent = defaultProfessionalId
      ? { ...intent, professionalClinicMemberId: defaultProfessionalId }
      : intent;
    if (!workingIntent.professionalQuery && !workingIntent.professionalClinicMemberId) return { state: "message", message: "¿De qué profesional quieres consultar la disponibilidad?", intent: workingIntent };
    const professional = workingIntent.professionalClinicMemberId ? { state: "ready" as const, id: workingIntent.professionalClinicMemberId, label: defaultProfessionalId ? "Tú" : "Profesional" } : await resolveProfessional(workingIntent.professionalQuery);
    if (professional.state !== "ready") return professional.state === "error" || professional.state === "none" || professional.state === "ambiguous" ? professional.response : { state: "message", message: "¿De qué profesional quieres consultar la disponibilidad?" };
    if (!workingIntent.localDate) return { state: "message", message: "Necesito una fecha específica, por ejemplo '23 de septiembre' o 'mañana'.", intent: { ...workingIntent, professionalClinicMemberId: professional.id, professionalQuery: undefined } };
    const slots = await readTool<ReadSlot[]>("get_available_slots", { professionalClinicMemberId: professional.id, date: workingIntent.localDate, durationMinutes: workingIntent.durationMinutes });
    if (!slots.ok) {
      if (slots.error.code === "not_found" || slots.error.code === "forbidden") return { state: "message", message: slots.error.safeMessage, intent: workingIntent };
      return safeToolError(slots);
    }
    if (slots.data.length === 0) return { state: "message", message: `No encontré horarios disponibles para ${professional.label} en esa fecha.`, intent: workingIntent };
    return { state: "slots", professional: professional.label, date: workingIntent.localDate, slots: slots.data.map((slot) => ({ start: slot.local_start, end: slot.local_end })) };
  }

  if (intent.type === "create_appointment") {
    const context = await getAssistantToolContext();
    if (!context.ok) return safeToolError(context);
    const defaultProfessionalId = !intent.professionalClinicMemberId && !intent.professionalQuery
      ? getDefaultSchedulingProfessional(context.data)
      : null;
    const workingIntent = defaultProfessionalId
      ? { ...intent, professionalClinicMemberId: defaultProfessionalId }
      : intent;
    if (!workingIntent.patientId && !workingIntent.patientQuery) {
      const message = defaultProfessionalId ? "Agendaremos la cita contigo. ¿Con qué paciente quieres agendarla?" : "¿Con qué paciente quieres agendarla?";
      return { state: "message", message, intent: workingIntent };
    }
    const patient = workingIntent.patientId ? { state: "ready" as const, id: workingIntent.patientId, label: "Paciente" } : await resolvePatient(workingIntent.patientQuery);
    if (patient.state !== "ready") return patient.state === "error" || patient.state === "none" || patient.state === "ambiguous" ? patient.response : { state: "message", message: "¿Con qué paciente quieres agendarla?" };
    if (!workingIntent.professionalClinicMemberId && !workingIntent.professionalQuery) return { state: "message", message: "¿Con qué profesional quieres agendarla?", intent: { ...workingIntent, patientId: patient.id, patientQuery: undefined } };
    const professional = workingIntent.professionalClinicMemberId ? { state: "ready" as const, id: workingIntent.professionalClinicMemberId, label: defaultProfessionalId ? "Tú" : "Profesional" } : await resolveProfessional(workingIntent.professionalQuery);
    if (professional.state !== "ready") return professional.state === "error" || professional.state === "none" || professional.state === "ambiguous" ? professional.response : { state: "message", message: "¿Con qué profesional quieres agendarla?" };
    const resolvedIntent = { ...workingIntent, patientId: patient.id, patientQuery: undefined, professionalClinicMemberId: professional.id, professionalQuery: undefined };
    if (!resolvedIntent.localDate) return { state: "message", message: resolvedIntent.localTime ? "Necesito la fecha exacta, por ejemplo '24 de septiembre de 2026'." : "¿Para qué fecha? Usa hoy, mañana o una fecha explícita.", intent: resolvedIntent };
    if (!resolvedIntent.localTime) return { state: "message", message: "¿A qué hora?", intent: resolvedIntent };
    const slots = await readTool<ReadSlot[]>("get_available_slots", { professionalClinicMemberId: professional.id, date: resolvedIntent.localDate, durationMinutes: resolvedIntent.durationMinutes });
    if (!slots.ok) {
      if (slots.error.code === "not_found" || slots.error.code === "forbidden") return { state: "message", message: slots.error.safeMessage, intent: resolvedIntent };
      return availabilityRetryResponse(resolvedIntent, professional.label, "date");
    }
    if (slots.data.length === 0) return availabilityRetryResponse(resolvedIntent, professional.label, "date");
    if (!slots.data.some((slot) => slot.local_start === resolvedIntent.localTime)) return availabilityRetryResponse(resolvedIntent, professional.label, "time", slots.data);
    if (!resolvedIntent.professionalClinicMemberId) return { state: "error", message: "No fue posible validar el profesional seleccionado." };
    const proposalInput = { patientId: resolvedIntent.patientId, professionalClinicMemberId: resolvedIntent.professionalClinicMemberId, date: resolvedIntent.localDate, startTime: resolvedIntent.localTime, durationMinutes: resolvedIntent.durationMinutes };
    const presentation = await getCreateAppointmentProposalPresentation(proposalInput);
    if (!presentation.ok) return safeToolError(presentation);
    const proposal = await prepareAssistantMutation("create_appointment", proposalInput);
    if (!proposal.ok) return safeToolError(proposal);
    return proposalResponse(proposal.data, "Crear cita", { patient: presentation.data.patient, professional: presentation.data.professional, date: resolvedIntent.localDate, time: resolvedIntent.localTime });
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
    const professionals = await readTool<ReadProfessional[]>("get_professionals", {});
    if (!professionals.ok) return safeToolError(professionals);
    const currentProfessional = professionals.data.find((professional) => professional.professional_user_id === current.professional_id);
    if (!currentProfessional) return { state: "message", message: "El profesional de esta cita ya no está disponible en la clínica activa." };
    const slots = await readTool<ReadSlot[]>("get_available_slots", { professionalClinicMemberId: currentProfessional.professional_clinic_member_id, date: intent.localDate, durationMinutes: intent.durationMinutes });
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

export async function submitAssistantContextualHelperAction(input: unknown, helper: ContextualHelper): Promise<AssistantUiResponse> {
  if (!isAssistantIntent(input) || (helper !== "patients" && helper !== "professionals")) return { state: "error", message: "La solicitud no tiene un formato válido." };
  const intent = input as AssistantIntent;
  if (helper === "patients") {
    const result = await readTool<ReadPatient[]>("search_patients", { query: "" });
    if (!result.ok) return safeToolError(result);
    const rows = result.data.slice(0, 20);
    if (!rows.length) return { state: "message", message: "No hay pacientes disponibles para seleccionar." };
    return { state: "choices", field: "patient", message: "Selecciona un paciente para continuar:", choices: rows.map((row) => ({ id: row.patient_id, label: row.display_name })) };
  }
  const result = await readTool<ReadProfessional[]>("get_professionals", {});
  if (!result.ok) return safeToolError(result);
  const rows = result.data.slice(0, 20);
  if (!rows.length) return { state: "message", message: "No hay profesionales disponibles para seleccionar." };
  return { state: "choices", field: "professional", message: "Selecciona un profesional para continuar:", choices: rows.map((row) => ({ id: row.professional_clinic_member_id, label: row.display_name })) };
}

export async function confirmAssistantProposalAction(actionId: unknown): Promise<AssistantUiResponse> {
  if (typeof actionId !== "string" || !isCanonicalAppointmentUuid(actionId)) return { state: "error", message: "La propuesta no es válida." };
  const result = await executeConfirmedAssistantAction(actionId);
  if (!result.ok) {
    const status = result.error.code === "confirmation_required"
      ? result.error.safeMessage.includes("venció") ? "expired" : "unavailable"
      : "failed";
    return { state: "proposal_terminal", status, message: result.error.safeMessage };
  }
  revalidatePath("/dashboard/bot");
  revalidatePath("/dashboard/appointments");
  return { state: "success", message: "La acción se completó correctamente." };
}

export async function cancelAssistantProposalAction(actionId: unknown): Promise<AssistantUiResponse> {
  if (typeof actionId !== "string" || !isCanonicalAppointmentUuid(actionId)) return { state: "error", message: "La propuesta no es válida." };
  const result = await cancelAssistantPendingAction(actionId);
  if (!result.ok) return { state: "proposal_terminal", status: "unavailable", message: result.error.safeMessage };
  if (result.data.status === "cancelled") return { state: "cancelled", message: "Acción cancelada." };
  if (result.data.status === "expired") return { state: "proposal_terminal", status: "expired", message: "Esta propuesta expiró. Vuelve a solicitar la acción." };
  return { state: "proposal_terminal", status: result.data.status === "executed" ? "executed" : "failed", message: "La propuesta ya no puede ejecutarse." };
}
