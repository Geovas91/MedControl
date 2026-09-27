"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { parseAppointmentAssistantSettings } from "@/lib/appointment-assistant";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";
import { resolveUniqueEntity } from "@/lib/assistant/orchestration/intents";
import { amendPendingProposalIntent, getDefaultSchedulingProfessional, type ContextualHelper } from "@/lib/assistant/orchestration/conversation";
import { resolveConversationInput, type ConversationInput } from "@/lib/assistant/orchestration/conversation";
import { parseAssistantStructuredChoice, resolveAssistantStructuredChoice, type AssistantStructuredChoice, type VerifiedAssistantAppointment } from "@/lib/assistant/orchestration/structured-selection";
import { isAssistantReadIntent, isValidAssistantReadIntent, orchestrateAssistantReadIntent, shouldOrchestrateAssistantReads, type AssistantReadResponse } from "@/lib/assistant/orchestration/read-tools";
import { runGatedAssistantPlanner } from "@/lib/assistant/llm/gated-planner";
import { evaluateAssistantDomainGate, getAssistantLlmMaxInputChars } from "@/lib/assistant/llm/domain-gate";
import { assistantLlmRateLimiter, getAssistantLlmRateLimitConfig } from "@/lib/assistant/llm/rate-limit";
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
import { isPatientAvailableForActiveTenant, isPatientEligibleForSchedulingWithProfessionalActiveTenant, searchAssistantPatientNamesForActiveTenant } from "@/lib/server/patients";
import { getClinicEntitlements, planIncludesFeature } from "@/lib/server/entitlements";
import { ambiguousAppointmentRequest, applyVerifiedAssistantChoiceToContext, assistantContextTtlSeconds, contextualAppointmentCommand, contextualSchedulingFollowUp, intentFromAssistantContext, newAssistantConversationContext, parseSchedulingContextPatch, reconcileSchedulingContext, revalidateAssistantConversationContext, updateAssistantConversationContext, type AssistantConversationContext } from "@/lib/assistant/orchestration/context";

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
  | { state: "availability_retry"; message: string; intent: Extract<AssistantIntent, { type: "create_appointment" }>; alternatives: Array<{ start: string; end: string; choice: AssistantStructuredChoice }> }
  | { state: "proposal"; proposal: AssistantProposal; action: string; patient?: string; professional?: string | null; date?: string; time?: string; previous?: string; resolvedPatientRef?: string; resolvedProfessionalRef?: string; resolvedAppointmentRef?: string }
  | { state: "success"; message: string }
  | { state: "cancelled"; message: string }
  | { state: "proposal_terminal"; status: "failed" | "expired" | "cancelled" | "executed" | "unavailable"; message: string };

export async function planAssistantConversationAction(message: unknown, pending: unknown): Promise<ConversationInput> {
  const text = typeof message === "string" ? message : "";
  const context = await getAssistantToolContext();
  if (!context.ok) return { state: "parsed", result: { state: "unsupported", message: context.error.safeMessage } };
  if (!planIncludesFeature(await getClinicEntitlements(context.data.clinicId), "appointment_assistant")) {
    return { state: "parsed", result: { state: "unsupported", message: "El asistente no está disponible para esta clínica." } };
  }
  const today = getClinicDayRange(context.data.timeZone).localDate;
  const active = pending === null || pending === undefined ? null : isAssistantIntent(pending) ? pending as AssistantIntent : null;
  if (process.env.APPOINTMENT_ASSISTANT_LLM_ENABLED !== "true") return resolveConversationInput(active, text.trim().slice(0, 501), today);
  const rateConfig = getAssistantLlmRateLimitConfig(process.env.APPOINTMENT_ASSISTANT_LLM_RATE_LIMIT_MAX, process.env.APPOINTMENT_ASSISTANT_LLM_RATE_LIMIT_WINDOW_SECONDS);
  return runGatedAssistantPlanner({
    message: text, today, pending: active, role: context.data.role, isProfessional: context.data.isProfessional, timeZone: context.data.timeZone,
    readToolsEnabled: process.env.APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED === "true",
    maxInputChars: getAssistantLlmMaxInputChars(process.env.APPOINTMENT_ASSISTANT_LLM_MAX_INPUT_CHARS),
    consumeRateLimit: () => assistantLlmRateLimiter.consume({ clinicId: context.data.clinicId, actorId: context.data.userId, ...rateConfig }),
    provider: openAiPlannerProvider,
    observe: (event, details) => logger.info(event, details)
  });
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

async function resolvePatient(query: string | undefined, professionalClinicMemberId?: string) {
  if (!query) return { state: "missing" as const };
  const result = await searchAssistantPatientNamesForActiveTenant(query, professionalClinicMemberId);
  if (result.state === "invalid_query") return { state: "none" as const, response: { state: "message", message: "Indica al menos dos caracteres del nombre del paciente." } satisfies AssistantUiResponse };
  if (result.state !== "ready") return { state: "error" as const, response: { state: "error", message: "No fue posible buscar pacientes. Intenta de nuevo." } satisfies AssistantUiResponse };
  if (!result.data.patients.length) return { state: "none" as const, response: { state: "message", message: "No encontré pacientes con ese nombre en tu clínica y ámbito de acceso." } satisfies AssistantUiResponse };
  if (result.data.patients.length > 1 || result.data.hasMore) return { state: "ambiguous" as const, response: { state: "choices", field: "patient", message: result.data.hasMore ? "Encontré varias coincidencias. Refina el nombre si no aparece el paciente." : "Encontré más de un paciente con ese nombre. ¿Cuál quieres usar?", choices: result.data.patients.map((patient) => ({ id: patient.id, label: patient.name, choice: { kind: "patient" as const, label: patient.name, reference: patient.id } })) } satisfies AssistantUiResponse };
  return { state: "ready" as const, id: result.data.patients[0].id, label: result.data.patients[0].name };
}

async function resolveProfessional(query: string | undefined) {
  if (!query) return { state: "missing" as const };
  const result = await readTool<ReadProfessional[]>("get_professionals", {});
  if (!result.ok) return { state: "error" as const, response: safeToolError(result) };
  const matches = result.data.filter((professional) => matchesAssistantQuery(professional.display_name, query));
  const resolved = resolveUniqueEntity(matches.map((professional) => ({ id: professional.professional_clinic_member_id, label: professional.display_name })));
  if (resolved.state === "NEEDS_INPUT") return { state: "none" as const, response: { state: "message", message: `No encontré un profesional que coincida con “${query}”.` } satisfies AssistantUiResponse };
  if (resolved.state === "AMBIGUOUS") return { state: "ambiguous" as const, response: { state: "choices", field: "professional", message: "Encontré más de un profesional con ese nombre. ¿Cuál quieres usar?", choices: matches.slice(0, 10).map((professional) => ({ id: professional.professional_clinic_member_id, label: professional.display_name, choice: { kind: "professional" as const, label: professional.display_name, reference: professional.professional_clinic_member_id } })) } satisfies AssistantUiResponse };
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
  if (matches.length > 1) return { state: "ambiguous" as const, response: { state: "choices", field: "appointment", message: "Encontré más de una cita compatible. ¿Cuál quieres usar?", choices: matches.slice(0, 10).map((appointment) => ({ id: appointment.appointment_id, label: `${appointment.patient_display_name} · ${appointment.starts_at}`, choice: { kind: "appointment" as const, label: `${appointment.patient_display_name} · ${appointment.starts_at}`, reference: appointment.appointment_id } })) } satisfies AssistantUiResponse };
  return { state: "ready" as const, appointment: matches[0] };
}

function proposalResponse(proposal: AssistantProposal, action: string, values: { patient?: string; professional?: string | null; date?: string; time?: string; previous?: string; resolvedPatientRef?: string; resolvedProfessionalRef?: string; resolvedAppointmentRef?: string }): AssistantUiResponse {
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
  return { state: "availability_retry", message, intent: nextIntent, alternatives: alternatives.slice(0, 5).map((slot) => ({ start: slot.local_start, end: slot.local_end, choice: { kind: "available_slot", label: `${slot.local_start}–${slot.local_end}`, professionalReference: intent.professionalClinicMemberId!, localDate: intent.localDate!, startTime: slot.local_start, endTime: slot.local_end, durationMinutes: intent.durationMinutes } })) };
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
    return { state: "patients", patients: result.data.slice(0, 10).map((patient) => ({ id: patient.patient_id, name: patient.display_name, choice: { kind: "patient" as const, label: patient.display_name, reference: patient.patient_id } })), hasMore: result.data.length > 10 };
  }

  if (intent.type === "search_appointments") {
    const result = await readTool<ReadAppointment[]>("search_appointments", { date: intent.localDate ?? undefined });
    if (!result.ok) return safeToolError(result);
    const rows = matchingAppointments(result.data, intent.query);
    return { state: "appointments", appointments: rows.slice(0, 10).map((row) => ({ id: row.appointment_id, patient: row.patient_display_name, professional: row.professional_display_name, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, choice: { kind: "appointment" as const, label: `${row.patient_display_name} · ${row.starts_at}`, reference: row.appointment_id } })), uniqueVerified: result.data.length < 25 && rows.length === 1, hasMore: rows.length > 10 };
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
    return { state: "slots", professional: professional.label, professionalClinicMemberId: professional.id, date: workingIntent.localDate, durationMinutes: workingIntent.durationMinutes, slots: slots.data.map((slot) => ({ start: slot.local_start, end: slot.local_end, choice: { kind: "available_slot" as const, label: `${slot.local_start}–${slot.local_end}`, professionalReference: professional.id, localDate: workingIntent.localDate!, startTime: slot.local_start, endTime: slot.local_end, durationMinutes: workingIntent.durationMinutes } })) };
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
    const patient = workingIntent.patientId
      ? { state: "ready" as const, id: workingIntent.patientId, label: "Paciente" }
      : workingIntent.patientQuery ? await resolvePatient(workingIntent.patientQuery, workingIntent.professionalClinicMemberId) : null;
    if (patient && patient.state !== "ready") return patient.state === "missing" ? { state: "message", message: "¿Con qué paciente quieres agendarla?" } : patient.response;
    const professional = workingIntent.professionalClinicMemberId
      ? { state: "ready" as const, id: workingIntent.professionalClinicMemberId, label: defaultProfessionalId ? "Tú" : "Profesional" }
      : workingIntent.professionalQuery ? await resolveProfessional(workingIntent.professionalQuery) : null;
    if (professional && professional.state !== "ready") return professional.state === "missing"
      ? { state: "message", message: "¿Con qué profesional quieres agendarla?" }
      : { ...professional.response, ...(patient?.state === "ready" ? { resolvedPatientRef: patient.id } : {}) };
    const resolvedIntent = {
      ...workingIntent,
      patientId: patient?.state === "ready" ? patient.id : undefined,
      patientQuery: undefined,
      professionalClinicMemberId: professional?.state === "ready" ? professional.id : undefined,
      professionalQuery: undefined
    };
    if (resolvedIntent.patientId && resolvedIntent.professionalClinicMemberId
      && !await isPatientEligibleForSchedulingWithProfessionalActiveTenant(resolvedIntent.patientId, resolvedIntent.professionalClinicMemberId)) {
      return { state: "error", message: "El paciente no está disponible para agendar con ese profesional. Selecciona otro paciente o profesional." };
    }
    if (!professional) {
      const message = patient ? "¿Con qué profesional quieres agendarla?" : "¿Con qué paciente quieres agendarla?";
      return { state: "message", message, intent: resolvedIntent, ...(patient?.state === "ready" ? { resolvedPatientRef: patient.id } : {}) };
    }
    if (!resolvedIntent.localDate) return { state: "message", message: !patient && defaultProfessionalId ? "Agendaremos la cita contigo. Puedes indicar el paciente o la fecha." : resolvedIntent.localTime ? "Necesito la fecha exacta, por ejemplo '24 de septiembre de 2026'." : "¿Para qué fecha? Usa hoy, mañana o una fecha explícita.", intent: resolvedIntent };
    const slots = await readTool<ReadSlot[]>("get_available_slots", { professionalClinicMemberId: professional.id, date: resolvedIntent.localDate, durationMinutes: resolvedIntent.durationMinutes });
    if (!slots.ok) {
      if (slots.error.code === "not_found" || slots.error.code === "forbidden") return { state: "message", message: slots.error.safeMessage, intent: resolvedIntent };
      return availabilityRetryResponse(resolvedIntent, professional.label, "date");
    }
    if (slots.data.length === 0) return availabilityRetryResponse(resolvedIntent, professional.label, "date");
    if (!resolvedIntent.localTime) return { state: "slots", professional: professional.label, professionalClinicMemberId: professional.id, date: resolvedIntent.localDate, durationMinutes: resolvedIntent.durationMinutes, resolvedPatientRef: resolvedIntent.patientId, slots: slots.data.map((slot) => ({ start: slot.local_start, end: slot.local_end, choice: { kind: "available_slot" as const, label: `${slot.local_start}–${slot.local_end}`, professionalReference: professional.id, localDate: resolvedIntent.localDate!, startTime: slot.local_start, endTime: slot.local_end, durationMinutes: resolvedIntent.durationMinutes } })) };
    if (!slots.data.some((slot) => slot.local_start === resolvedIntent.localTime)) return availabilityRetryResponse(resolvedIntent, professional.label, "time", slots.data);
    if (!patient) return { state: "message", message: "¿Con qué paciente quieres agendarla?", intent: resolvedIntent };
    if (!resolvedIntent.professionalClinicMemberId) return { state: "error", message: "No fue posible validar el profesional seleccionado." };
    const proposalInput = { patientId: resolvedIntent.patientId, professionalClinicMemberId: resolvedIntent.professionalClinicMemberId, date: resolvedIntent.localDate, startTime: resolvedIntent.localTime, durationMinutes: resolvedIntent.durationMinutes };
    const presentation = await getCreateAppointmentProposalPresentation(proposalInput);
    if (!presentation.ok) return safeToolError(presentation);
    const proposal = await prepareAssistantMutation("create_appointment", proposalInput);
    if (!proposal.ok) return safeToolError(proposal);
    return proposalResponse(proposal.data, "Crear cita", { patient: presentation.data.patient, professional: presentation.data.professional, date: resolvedIntent.localDate, time: resolvedIntent.localTime, resolvedPatientRef: patient.id, resolvedProfessionalRef: professional.id });
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
    return proposalResponse(proposal.data, "Reprogramar cita", { patient: current.patient_display_name, professional: current.professional_display_name, date: intent.localDate, time: intent.localTime, previous: current.starts_at, resolvedAppointmentRef: current.appointment_id });
  }
  const toolName = intent.type === "confirm_appointment" ? "confirm_appointment" : "cancel_appointment";
  const proposal = await prepareAssistantMutation(toolName, { appointmentId: current.appointment_id, expectedStatus: current.status });
  if (!proposal.ok) return safeToolError(proposal);
  return proposalResponse(proposal.data, intent.type === "confirm_appointment" ? "Confirmar cita" : "Cancelar cita", { patient: current.patient_display_name, professional: current.professional_display_name, previous: current.starts_at, resolvedAppointmentRef: current.appointment_id });
}

export async function submitAssistantContextualHelperAction(input: unknown, helper: ContextualHelper): Promise<AssistantUiResponse> {
  if (!isAssistantIntent(input) || (helper !== "patients" && helper !== "professionals")) return { state: "error", message: "La solicitud no tiene un formato válido." };
  const intent = input as AssistantIntent;
  if (helper === "patients") {
    const result = await readTool<ReadPatient[]>("search_patients", { query: "" });
    if (!result.ok) return safeToolError(result);
    const rows = result.data.slice(0, 10);
    if (!rows.length) return { state: "message", message: "No hay pacientes disponibles para seleccionar." };
    return { state: "choices", field: "patient", message: "Selecciona un paciente para continuar:", choices: rows.map((row) => ({ id: row.patient_id, label: row.display_name, choice: { kind: "patient" as const, label: row.display_name, reference: row.patient_id } })) };
  }
  const result = await readTool<ReadProfessional[]>("get_professionals", {});
  if (!result.ok) return safeToolError(result);
  const rows = result.data.slice(0, 10);
  if (!rows.length) return { state: "message", message: "No hay profesionales disponibles para seleccionar." };
  return { state: "choices", field: "professional", message: "Selecciona un profesional para continuar:", choices: rows.map((row) => ({ id: row.professional_clinic_member_id, label: row.display_name, choice: { kind: "professional" as const, label: row.display_name, reference: row.professional_clinic_member_id } })) };
}

function verifiedAppointment(value: unknown): VerifiedAssistantAppointment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.appointment_id !== "string" || typeof row.patient_display_name !== "string" || typeof row.starts_at !== "string" || typeof row.ends_at !== "string" || typeof row.status !== "string") return null;
  return { id: row.appointment_id, patient: row.patient_display_name, professional: typeof row.professional_display_name === "string" ? row.professional_display_name : null, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status };
}

/** Structured result clicks revalidate under the active authenticated tenant and never invoke the planner. */
export async function selectAssistantResultAction(choice: unknown, pendingValue: unknown): Promise<AssistantUiResponse> {
  const context = await getAssistantToolContext();
  if (!context.ok) return safeToolError(context);
  if (!planIncludesFeature(await getClinicEntitlements(context.data.clinicId), "appointment_assistant")) return { state: "error", message: "El asistente no está disponible para esta clínica." };

  const result = await resolveAssistantStructuredChoice(choice, pendingValue, {
    patient: (reference) => {
      const pending = isAssistantIntent(pendingValue) ? pendingValue : null;
      return pending?.type === "create_appointment" && pending.professionalClinicMemberId
        ? isPatientEligibleForSchedulingWithProfessionalActiveTenant(reference, pending.professionalClinicMemberId)
        : isPatientAvailableForActiveTenant(reference);
    },
    professional: async (reference) => {
      const result = await executeAssistantReadTool("get_professionals", {});
      if (!result.ok || !Array.isArray(result.data)) return null;
      const member = result.data.find((row) => row && typeof row === "object" && ((row as Record<string, unknown>).professional_clinic_member_id === reference || (row as Record<string, unknown>).professional_user_id === reference)) as Record<string, unknown> | undefined;
      return member && typeof member.professional_clinic_member_id === "string" && typeof member.professional_user_id === "string" && typeof member.display_name === "string"
        ? { clinicMemberId: member.professional_clinic_member_id, userId: member.professional_user_id, label: member.display_name }
        : null;
    },
    appointment: async (reference) => {
      const result = await executeAssistantReadTool("get_appointment", { appointmentId: reference });
      return result.ok ? verifiedAppointment(result.data) : null;
    },
    slot: async (slot, pending) => {
      let appointment: VerifiedAssistantAppointment | null = null;
      if (pending?.type === "reschedule_appointment") {
        if (!pending.appointmentId) return { valid: false };
        const appointmentResult = await executeAssistantReadTool("get_appointment", { appointmentId: pending.appointmentId });
        if (!appointmentResult.ok) return { valid: false };
        const appointmentData = appointmentResult.data;
        appointment = verifiedAppointment(appointmentData);
        if (!appointment) return { valid: false };
        const professionals = await executeAssistantReadTool("get_professionals", {});
        if (!professionals.ok || !Array.isArray(professionals.data)) return { valid: false };
        const appointmentProfessionalId = appointmentData && typeof appointmentData === "object" ? (appointmentData as Record<string, unknown>).professional_id : null;
        const member = professionals.data.find((row) => row && typeof row === "object" && (row as Record<string, unknown>).professional_user_id === appointmentProfessionalId) as Record<string, unknown> | undefined;
        if (!member || member.professional_clinic_member_id !== slot.professionalReference) return { valid: false };
      }
      const slots = await executeAssistantReadTool("get_available_slots", { professionalClinicMemberId: slot.professionalReference, date: slot.localDate, durationMinutes: slot.durationMinutes });
      const valid = slots.ok && Array.isArray(slots.data) && slots.data.some((row) => row && typeof row === "object" && (row as Record<string, unknown>).local_start === slot.startTime && (row as Record<string, unknown>).local_end === slot.endTime);
      return { valid, appointment };
    }
  });

  if (result.state === "error") return result;
  if (result.state === "appointment") return { state: "appointment", appointment: result.appointment };
  return submitAssistantIntentAction(result.intent);
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

const CONTEXT_CHANGED_REPLY = "La selección anterior ya no está disponible. Vuelve a elegirla para continuar.";

async function loadAssistantContext(raw: unknown) {
  const actor = await getAssistantToolContext();
  if (!actor.ok) return { ok: false as const, message: actor.error.safeMessage, context: null };
  if (!planIncludesFeature(await getClinicEntitlements(actor.data.clinicId), "appointment_assistant")) return { ok: false as const, message: "El asistente no está disponible para esta clínica.", context: null };
  const scope = { actorId: actor.data.userId, clinicId: actor.data.clinicId };
  const validators = {
    patient: isPatientAvailableForActiveTenant,
    professional: async (ref: string) => {
      const result = await executeAssistantReadTool("get_professionals", {});
      if (!result.ok || !Array.isArray(result.data)) return null;
      const row = result.data.find((value) => value && typeof value === "object" && (value as Record<string, unknown>).professional_clinic_member_id === ref) as Record<string, unknown> | undefined;
      return row && typeof row.professional_user_id === "string" ? { userId: row.professional_user_id } : null;
    },
    appointment: async (ref: string) => {
      const result = await executeAssistantReadTool("get_appointment", { appointmentId: ref });
      if (!result.ok || !result.data || typeof result.data !== "object") return null;
      const status = (result.data as Record<string, unknown>).status;
      return typeof status === "string" ? { status } : null;
    },
    slot: async (slot: NonNullable<AssistantConversationContext["selectedSlot"]>) => {
      const result = await executeAssistantReadTool("get_available_slots", { professionalClinicMemberId: slot.professionalRef, date: slot.localDate, durationMinutes: slot.durationMinutes });
      return result.ok && Array.isArray(result.data) && result.data.some((value) => value && typeof value === "object" && (value as Record<string, unknown>).local_start === slot.startTime);
    }
  };
  const ttl = assistantContextTtlSeconds(process.env.APPOINTMENT_ASSISTANT_CONTEXT_TTL_SECONDS);
  let checked;
  try { checked = await revalidateAssistantConversationContext(raw, scope, validators, Date.now(), ttl); }
  catch { checked = { context: newAssistantConversationContext(scope), reason: "invalidated" as const }; }
  if (checked.reason !== "continued") logger.info(`assistant_context_${checked.reason === "created" ? "created" : checked.reason === "expired" ? "expired" : "invalidated"}`, { reason_code: checked.reason });
  return { ok: true as const, context: checked.context, reason: checked.reason, scope, validators, timeZone: actor.data.timeZone, today: getClinicDayRange(actor.data.timeZone).localDate, ttl };
}

/** A read-only, bounded name lookup for the current patient-selection step. */
export async function searchAssistantPatientSuggestionsAction(query: unknown, rawContext: unknown) {
  const loaded = await loadAssistantContext(rawContext);
  if (!loaded.ok || loaded.reason !== "continued" || loaded.context.activeIntent !== "create_appointment" || loaded.context.focusedPatientRef) {
    return { state: "unavailable" as const, suggestions: [] };
  }
  const result = await searchAssistantPatientNamesForActiveTenant(query, loaded.context.focusedProfessionalRef);
  if (result.state !== "ready") return { state: "unavailable" as const, suggestions: [] };
  return {
    state: "ready" as const,
    suggestions: result.data.patients.map((patient) => ({ id: patient.id, name: patient.name, choice: { kind: "patient" as const, label: patient.name, reference: patient.id } })),
    hasMore: result.data.hasMore
  };
}

/** A bounded professional lookup only during the professional-selection step. */
export async function searchAssistantProfessionalSuggestionsAction(query: unknown, rawContext: unknown) {
  const loaded = await loadAssistantContext(rawContext);
  if (!loaded.ok || loaded.reason !== "continued") return { state: "unavailable" as const, suggestions: [] };
  const context = loaded.context;
  const canSelectProfessional = !context.focusedProfessionalRef && (
    context.activeIntent === "create_appointment" && Boolean(context.focusedPatientRef)
    || context.activeIntent === "check_availability"
  );
  if (!canSelectProfessional) return { state: "unavailable" as const, suggestions: [] };

  const text = typeof query === "string" ? query.trim().replace(/^con\s+/i, "").trim() : "";
  if (text.length < 2 || text.length > 100 || /[\u0000-\u001f\u007f]/.test(text)) {
    return { state: "ready" as const, suggestions: [] };
  }
  const result = await readTool<ReadProfessional[]>("get_professionals", {});
  if (!result.ok || !Array.isArray(result.data)) return { state: "unavailable" as const, suggestions: [] };
  const suggestions = result.data
    .filter((professional) => professional && typeof professional.professional_clinic_member_id === "string"
      && typeof professional.display_name === "string" && matchesAssistantQuery(professional.display_name, text))
    .slice(0, 8)
    .map((professional) => ({
      id: professional.professional_clinic_member_id,
      name: professional.display_name,
      choice: { kind: "professional" as const, label: professional.display_name, reference: professional.professional_clinic_member_id }
    }));
  return { state: "ready" as const, suggestions };
}

/** The browser carries only bounded, ephemeral UX state. Every canonical reference is re-read under the current actor and tenant. */
export async function planAssistantConversationWithContextAction(message: unknown, rawContext: unknown, pendingProposalActionId?: unknown) {
  const loaded = await loadAssistantContext(rawContext);
  if (!loaded.ok) return { resolved: { state: "parsed", result: { state: "unsupported", message: loaded.message } } as ConversationInput, context: loaded.context };
  const text = typeof message === "string" ? message : "";
  const pending = intentFromAssistantContext(loaded.context);
  const gate = evaluateAssistantDomainGate({ message: text, today: loaded.today, pending, maxInputChars: getAssistantLlmMaxInputChars(process.env.APPOINTMENT_ASSISTANT_LLM_MAX_INPUT_CHARS) });
  const amendment = pending && gate.state === "allowed" ? amendPendingProposalIntent({ intent: pending, message: gate.message, clinicLocalDate: loaded.today }) : null;
  let proposalDisposition = "retained" as "retained" | "invalidated" | "unavailable";
  const invalidateProposal = async () => {
    if (typeof pendingProposalActionId !== "string" || !isCanonicalAppointmentUuid(pendingProposalActionId)) {
      return "unavailable" as const;
    }
    const cancelled = await cancelAssistantPendingAction(pendingProposalActionId);
    if (!cancelled.ok || !["cancelled", "expired"].includes(cancelled.data.status)) {
      return "unavailable" as const;
    }
    return "invalidated" as const;
  };
  if (loaded.reason === "invalidated") {
    proposalDisposition = pendingProposalActionId === undefined ? "retained" : await invalidateProposal();
    return { resolved: { state: "parsed", result: { state: "unsupported", message: CONTEXT_CHANGED_REPLY } } as ConversationInput, context: loaded.context, proposalDisposition };
  }
  if (amendment && pendingProposalActionId !== undefined) {
    proposalDisposition = await invalidateProposal();
    if (proposalDisposition === "unavailable") {
      return { resolved: { state: "parsed", result: { state: "unsupported", message: "La propuesta pendiente ya no está disponible. Vuelve a preparar la acción." } } as ConversationInput, context: loaded.context, proposalDisposition };
    }
  }
  const ambiguous = ambiguousAppointmentRequest(text, loaded.context);
  if (ambiguous) {
    return { resolved: { state: "parsed", result: { state: "needs_input", intent: ambiguous, message: "Hay varias citas. Selecciona la cita específica antes de continuar." } } as ConversationInput, context: { ...loaded.context, activeIntent: ambiguous.type } };
  }
  const parsedPatch = gate.state === "allowed" ? parseSchedulingContextPatch(gate.message, loaded.context, loaded.today) : { state: "none" as const };
  if (parsedPatch.state === "ambiguous") return { resolved: { state: "parsed", result: { state: "needs_input", message: "Hay más de una fecha posible. Indica una fecha específica para continuar." } } as ConversationInput, context: loaded.context, proposalDisposition };
  const reconciled = parsedPatch.state === "patch" ? reconcileSchedulingContext(loaded.context, parsedPatch.patch, loaded.timeZone) : null;
  const contextual = amendment?.intent ?? contextualAppointmentCommand(text, loaded.context) ?? (gate.state === "allowed" ? reconciled?.intent ?? contextualSchedulingFollowUp(gate.message, loaded.context, loaded.today) : null);
  let conversationContext = contextual === reconciled?.intent ? reconciled.context : contextual ? updateAssistantConversationContext(loaded.context, contextual, { state: "message" }, loaded.timeZone) : loaded.context;
  if (contextual?.type === "create_appointment" && loaded.context.activeIntent === "check_availability" && contextual.professionalClinicMemberId && contextual.localDate && contextual.localTime && loaded.context.availableSlotTimes?.includes(contextual.localTime)) {
    const selectedSlot = { professionalRef: contextual.professionalClinicMemberId, localDate: contextual.localDate, startTime: contextual.localTime, durationMinutes: contextual.durationMinutes };
    if (!await loaded.validators.slot(selectedSlot)) return { resolved: { state: "parsed", result: { state: "unsupported", message: CONTEXT_CHANGED_REPLY } } as ConversationInput, context: { ...loaded.context, availableSlotTimes: undefined, selectedSlot: undefined, startTime: undefined } };
    conversationContext = { ...conversationContext, selectedSlot, startTime: selectedSlot.startTime };
  }
  let resolved: ConversationInput = contextual
    ? { state: "parsed", result: { state: "intent", intent: contextual } }
    : await planAssistantConversationAction(text, intentFromAssistantContext(loaded.context));
  if (!contextual && loaded.context.activeIntent === "create_appointment" && resolved.state === "parsed" && resolved.result.state === "intent" && resolved.result.intent.type === "check_availability") {
    const read = resolved.result.intent;
    const converted = reconcileSchedulingContext(loaded.context, { turnIntent: "request_availability", ...(read.localDate ? { dateCandidate: read.localDate } : {}), ...(read.professionalQuery ? { professionalQuery: read.professionalQuery } : {}) }, loaded.timeZone);
    if (converted) { resolved = { state: "parsed", result: { state: "intent", intent: converted.intent } }; conversationContext = converted.context; }
  }
  if (!amendment && pendingProposalActionId !== undefined && resolved.state === "parsed" && resolved.result.state === "intent") {
    const proposed = resolved.result.intent;
    const mutationTypes = ["create_appointment", "confirm_appointment", "cancel_appointment", "reschedule_appointment"];
    if (mutationTypes.includes(proposed.type)) {
      const fields = ["patientId", "patientQuery", "professionalClinicMemberId", "professionalQuery", "appointmentId", "appointmentQuery", "localDate", "localTime", "durationMinutes"] as const;
      const sameAction = pending?.type === proposed.type && fields.every((field) => (pending as unknown as Record<string, unknown>)[field] === (proposed as unknown as Record<string, unknown>)[field]);
      if (sameAction) {
        return { resolved: { state: "parsed", result: { state: "unsupported", message: "La propuesta conserva esos datos. Puedes confirmarla o indicar otro cambio." } } as ConversationInput, context: loaded.context, proposalDisposition };
      }
      proposalDisposition = await invalidateProposal();
      if (proposalDisposition === "unavailable") {
        return { resolved: { state: "parsed", result: { state: "unsupported", message: "La propuesta pendiente ya no está disponible. Vuelve a preparar la acción." } } as ConversationInput, context: loaded.context, proposalDisposition };
      }
    }
  }
  if (resolved.state === "parsed" && resolved.result.state === "intent") conversationContext = updateAssistantConversationContext(conversationContext, resolved.result.intent, { state: "message" }, loaded.timeZone);
  return { resolved, context: conversationContext, proposalDisposition };
}

export async function submitAssistantIntentWithContextAction(input: unknown, rawContext: unknown) {
  const loaded = await loadAssistantContext(rawContext);
  if (!loaded.ok) return { response: { state: "error", message: loaded.message } as AssistantUiResponse, context: loaded.context };
  if (loaded.reason === "invalidated") return { response: { state: "message", message: CONTEXT_CHANGED_REPLY } as AssistantUiResponse, context: loaded.context };
  const response = await submitAssistantIntentAction(input);
  const intent = isAssistantIntent(input) ? input : null;
  const next = updateAssistantConversationContext(loaded.context, intent, response, loaded.timeZone);
  const checked = await revalidateAssistantConversationContext(next, loaded.scope, loaded.validators, Date.now(), loaded.ttl);
  if (checked.reason === "invalidated") return { response: { state: "message", message: CONTEXT_CHANGED_REPLY } as AssistantUiResponse, context: checked.context };
  return { response, context: checked.context };
}

export async function submitAssistantContextualHelperWithContextAction(input: unknown, helper: ContextualHelper, rawContext: unknown) {
  const loaded = await loadAssistantContext(rawContext);
  if (!loaded.ok) return { response: { state: "error", message: loaded.message } as AssistantUiResponse, context: loaded.context };
  if (loaded.reason === "invalidated") return { response: { state: "message", message: CONTEXT_CHANGED_REPLY } as AssistantUiResponse, context: loaded.context };
  const response = await submitAssistantContextualHelperAction(input, helper);
  const context = updateAssistantConversationContext(loaded.context, isAssistantIntent(input) ? input : null, response, loaded.timeZone);
  return { response, context };
}

export async function selectAssistantResultWithContextAction(choice: unknown, rawContext: unknown) {
  const loaded = await loadAssistantContext(rawContext);
  if (!loaded.ok) return { response: { state: "error", message: loaded.message } as AssistantUiResponse, context: loaded.context };
  if (loaded.reason === "invalidated") return { response: { state: "message", message: CONTEXT_CHANGED_REPLY } as AssistantUiResponse, context: loaded.context };
  const pending = intentFromAssistantContext(loaded.context);
  const response = await selectAssistantResultAction(choice, pending);
  let next = loaded.context;
  const selected = parseAssistantStructuredChoice(choice);
  if (selected && response.state !== "error" && response.state !== "proposal_terminal") next = applyVerifiedAssistantChoiceToContext(next, selected);
  next = updateAssistantConversationContext(next, pending, response, loaded.timeZone);
  const checked = await revalidateAssistantConversationContext(next, loaded.scope, loaded.validators, Date.now(), loaded.ttl);
  if (checked.reason === "invalidated") return { response: { state: "message", message: CONTEXT_CHANGED_REPLY } as AssistantUiResponse, context: checked.context };
  return { response, context: checked.context };
}
