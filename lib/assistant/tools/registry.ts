import "server-only";

import { calculateAppointmentEnd, combineClinicDateTime, type AppointmentFormValues } from "@/lib/appointments/create";
import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { logger } from "@/lib/logger";
import { getAppointmentAgendaForActiveTenant } from "@/lib/server/appointments";
import { getAppointmentDetailForActiveTenant } from "@/lib/server/appointment-detail";
import { mutateAppointmentLifecycleForActiveTenant } from "@/lib/server/appointment-lifecycle";
import { getAppointmentCreationOptions, createAppointmentForActiveTenant } from "@/lib/server/create-appointment";
import { getPatientsForActiveTenant } from "@/lib/server/patients";
import { getProfessionalAvailableSlots } from "@/lib/server/professional-slots";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import { assistantToolError, assistantToolNames, toolSchemas, type AssistantToolContext, type AssistantToolDefinition, type AssistantToolName, type AssistantToolResult } from "./contracts";

type ReadPatient = { patient_id: string; display_name: string; status: string };
type ReadAppointment = { appointment_id: string; patient_id: string | null; patient_display_name: string; professional_id: string | null; professional_display_name: string | null; starts_at: string; ends_at: string; status: string };
export type AssistantProposal = { actionId: string; toolName: AssistantToolName; expiresAt: string; summary: string };

function safeFailure(state: string): AssistantToolResult<never> {
  const errors: Record<string, [Parameters<typeof assistantToolError>[0], string]> = {
    forbidden: ["forbidden", "No tienes permiso para realizar esta operación."], not_found: ["not_found", "No se encontró el registro solicitado."], conflict: ["conflict", "El horario ya no está disponible."], stale_state: ["stale", "La cita cambió en otra sesión. Actualiza e intenta nuevamente."], invalid_transition: ["invalid_transition", "La transición solicitada no está permitida."], validation_error: ["validation_error", "Los datos de la operación no son válidos."], invalid_input: ["validation_error", "Los datos de la operación no son válidos."], no_active_membership: ["forbidden", "No tienes una clínica activa."], unauthenticated: ["forbidden", "Debes iniciar sesión."], error: ["generic", "No fue posible completar la operación."]
  };
  const [code, message] = errors[state] ?? errors.error;
  return assistantToolError(code, message);
}

function logTool(event: "started" | "succeeded" | "failed", context: AssistantToolContext, toolName: AssistantToolName, startedAt: number, errorCode?: string) {
  logger.info(`assistant_tool_${event}`, { tool_name: toolName, clinic_id: context.clinicId, actor_user_id: context.userId, actor_role: context.role, duration_ms: Date.now() - startedAt, error_code: errorCode });
}

export async function getAssistantToolContext(): Promise<AssistantToolResult<AssistantToolContext>> {
  const active = await getActiveTenantContext();
  if (active.state !== "ready") return safeFailure(active.state);
  return { ok: true, data: { userId: active.user.id, clinicId: active.tenant.clinic.id, clinicMemberId: active.tenant.membership.id, role: active.tenant.membership.role, isProfessional: active.tenant.membership.is_professional, timeZone: active.tenant.clinic.timezone } };
}

const searchPatients: AssistantToolDefinition<{ query: string }, ReadPatient[]> = {
  name: "search_patients", description: "Busca pacientes de la clínica activa por datos administrativos.", inputSchema: toolSchemas.searchPatients, outputSchema: toolSchemas.output, mutation: false, requiresConfirmation: false,
  async execute(context, input) {
    const result = await getPatientsForActiveTenant({ search: input.query, status: null, page: 1, pageSize: 20 });
    if (result.state !== "ready" || !result.data) return safeFailure(result.state);
    return { ok: true, data: result.data.patients.slice(0, 20).map((patient) => ({ patient_id: patient.id, display_name: patient.full_name, status: patient.status })) };
  }
};

const searchAppointments: AssistantToolDefinition<{ patientId: string | null; professionalId: string | null; date: string | null; status: string | null }, ReadAppointment[]> = {
  name: "search_appointments", description: "Consulta la agenda de la clínica activa.", inputSchema: toolSchemas.searchAppointments, outputSchema: toolSchemas.output, mutation: false, requiresConfirmation: false,
  async execute(context, input) {
    const date = input.date ?? getClinicDayRange(context.timeZone).localDate;
    const result = await getAppointmentAgendaForActiveTenant({ date, period: "day", doctor: input.professionalId ?? undefined, status: input.status ?? undefined });
    if (result.state !== "ready" || !result.data) return safeFailure(result.state);
    const rows = result.data.appointments.filter((appointment) => (!input.patientId || appointment.patient_id === input.patientId) && (context.role !== "doctor" || appointment.doctor_id === context.userId));
    return { ok: true, data: rows.slice(0, 25).map((appointment) => ({ appointment_id: appointment.id, patient_id: appointment.patient_id, patient_display_name: appointment.patientName, professional_id: appointment.doctor_id, professional_display_name: appointment.doctorName, starts_at: appointment.starts_at, ends_at: appointment.ends_at, status: appointment.status })) };
  }
};

const getAppointment: AssistantToolDefinition<{ appointmentId: string }, ReadAppointment> = {
  name: "get_appointment", description: "Obtiene datos de agenda mínimos para una cita.", inputSchema: toolSchemas.appointmentId, outputSchema: toolSchemas.output, mutation: false, requiresConfirmation: false,
  async execute(context, input) {
    const result = await getAppointmentDetailForActiveTenant(input.appointmentId);
    if (result.state !== "ready" || !result.data) return safeFailure(result.state);
    if (context.role === "doctor" && result.data.appointment.doctor_id !== context.userId) return assistantToolError("forbidden", "No tienes acceso a esta cita.");
    return { ok: true, data: { appointment_id: result.data.appointment.id, patient_id: result.data.appointment.patient_id, patient_display_name: result.data.patient?.full_name ?? "Sin registro", professional_id: result.data.appointment.doctor_id, professional_display_name: result.data.doctor?.display_name ?? null, starts_at: result.data.appointment.starts_at, ends_at: result.data.appointment.ends_at, status: result.data.appointment.status } };
  }
};

const getProfessionals: AssistantToolDefinition<Record<string, never>, { professional_id: string; display_name: string }[]> = {
  name: "get_professionals", description: "Lista profesionales activos que pueden recibir citas.", inputSchema: { parse(value) { return value === undefined || (value && typeof value === "object" && !Array.isArray(value)) ? {} : null; } }, outputSchema: toolSchemas.output, mutation: false, requiresConfirmation: false,
  async execute(context) {
    const options = await getAppointmentCreationOptions();
    if (options.state !== "ready" || !options.data) return safeFailure(options.state);
    const doctors = context.role === "doctor" ? options.data.doctors.filter((doctor) => doctor.id === context.userId) : options.data.doctors;
    return { ok: true, data: doctors.slice(0, 25).map((doctor) => ({ professional_id: doctor.id, display_name: doctor.name })) };
  }
};

const getAvailableSlots: AssistantToolDefinition<{ professionalId: string; date: string; durationMinutes: number }, { start_at: string; end_at: string; local_start: string; local_end: string; time_zone: string }[]> = {
  name: "get_available_slots", description: "Consulta slots mediante el Slot Engine de la clínica activa.", inputSchema: toolSchemas.availableSlots, outputSchema: toolSchemas.output, mutation: false, requiresConfirmation: false,
  async execute(context, input) {
    if (context.role === "doctor" && input.professionalId !== context.userId) return assistantToolError("forbidden", "No tienes acceso a la disponibilidad de otro profesional.");
    const memberResult = await (await createClient()).from("clinic_members").select("id").eq("clinic_id", context.clinicId).eq("user_id", input.professionalId).eq("status", "active").eq("is_professional", true).maybeSingle();
    if (memberResult.error) return safeFailure("error");
    if (!memberResult.data) return assistantToolError("not_found", "El profesional no está disponible para esta clínica.");
    const member = memberResult.data as { id: string } | null;
    if (!member) return assistantToolError("not_found", "El profesional no está disponible para esta clínica.");
    const slots = await getProfessionalAvailableSlots({ clinicMemberId: member.id, localDate: input.date, durationMinutes: input.durationMinutes, slotIntervalMinutes: 15 });
    if (slots.state !== "ready" || !slots.data) return safeFailure(slots.state);
    return { ok: true, data: slots.data.map((slot) => ({ ...slot, time_zone: context.timeZone })) };
  }
};

const createAppointment: AssistantToolDefinition<ReturnType<typeof toolSchemas.createAppointment.parse> & {}, { appointment_id: string }> = {
  name: "create_appointment", description: "Crea una cita usando el contrato de creación existente.", inputSchema: toolSchemas.createAppointment, outputSchema: toolSchemas.output, mutation: true, requiresConfirmation: true,
  async execute(_context, input) {
    const values: AppointmentFormValues = { patientId: input.patientId, doctorId: input.professionalId, title: "Cita", appointmentType: "", date: input.date, startTime: input.startTime, duration: String(input.durationMinutes), status: "scheduled", location: "", meetingUrl: "" };
    const result = await createAppointmentForActiveTenant(values);
    return result.state === "success" ? { ok: true, data: { appointment_id: result.appointmentId } } : safeFailure(result.state);
  }
};

function lifecycleTool(name: "confirm_appointment" | "cancel_appointment"): AssistantToolDefinition<{ appointmentId: string; expectedStatus: string }, { appointment_id: string; status: string }> {
  return { name, description: name === "confirm_appointment" ? "Confirma una cita mediante el lifecycle vigente." : "Cancela una cita mediante el lifecycle vigente.", inputSchema: toolSchemas.lifecycle, outputSchema: toolSchemas.output, mutation: true, requiresConfirmation: true,
    async execute(_context, input) { const result = await mutateAppointmentLifecycleForActiveTenant({ appointmentId: input.appointmentId, operation: name === "confirm_appointment" ? "confirm" : "cancel", expectedStatus: input.expectedStatus as never }); return result.state === "success" ? { ok: true, data: { appointment_id: result.appointment.appointment_id, status: result.appointment.status } } : safeFailure(result.state); }
  };
}

const rescheduleAppointment: AssistantToolDefinition<ReturnType<typeof toolSchemas.reschedule.parse> & {}, { appointment_id: string; status: string }> = {
  name: "reschedule_appointment", description: "Reprograma una cita mediante el lifecycle vigente.", inputSchema: toolSchemas.reschedule, outputSchema: toolSchemas.output, mutation: true, requiresConfirmation: true,
  async execute(context, input) {
    const local = combineClinicDateTime(input.date, input.startTime, context.timeZone);
    if (local.state !== "valid") return assistantToolError("validation_error", "No fue posible interpretar el horario local de la clínica.");
    const result = await mutateAppointmentLifecycleForActiveTenant({ appointmentId: input.appointmentId, operation: "reschedule", expectedStatus: input.expectedStatus as never, startsAt: local.iso, endsAt: calculateAppointmentEnd(local.iso, input.durationMinutes as never) });
    return result.state === "success" ? { ok: true, data: { appointment_id: result.appointment.appointment_id, status: result.appointment.status } } : safeFailure(result.state);
  }
};

export const assistantToolRegistry = new Map<AssistantToolName, AssistantToolDefinition<never, never>>([
  [searchPatients.name, searchPatients as never], [searchAppointments.name, searchAppointments as never], [getAppointment.name, getAppointment as never], [getAvailableSlots.name, getAvailableSlots as never], [getProfessionals.name, getProfessionals as never], [createAppointment.name, createAppointment as never], [lifecycleTool("confirm_appointment").name, lifecycleTool("confirm_appointment") as never], [rescheduleAppointment.name, rescheduleAppointment as never], [lifecycleTool("cancel_appointment").name, lifecycleTool("cancel_appointment") as never]
]);

export function getAssistantTool(name: string) { return assistantToolNames.includes(name as AssistantToolName) ? assistantToolRegistry.get(name as AssistantToolName) ?? null : null; }

export async function executeAssistantReadTool(name: string, rawInput: unknown): Promise<AssistantToolResult<unknown>> {
  const tool = getAssistantTool(name); if (!tool) return assistantToolError("validation_error", "La herramienta solicitada no existe.");
  if (tool.mutation) return assistantToolError("confirmation_required", "Esta operación requiere una confirmación explícita.");
  const context = await getAssistantToolContext(); if (!context.ok) return context;
  const input = tool.inputSchema.parse(rawInput); if (!input) return assistantToolError("validation_error", "Los datos de la herramienta no son válidos.");
  const startedAt = Date.now(); logTool("started", context.data, tool.name, startedAt);
  const executable = tool as unknown as { execute(context: AssistantToolContext, input: unknown): Promise<AssistantToolResult<unknown>> };
  const result = await executable.execute(context.data, input); logTool(result.ok ? "succeeded" : "failed", context.data, tool.name, startedAt, result.ok ? undefined : result.error.code); return result;
}

function persistedArguments(toolName: AssistantToolName, input: Record<string, unknown>) {
  if (toolName === "create_appointment") return { patient_id: input.patientId, professional_id: input.professionalId, local_date: input.date, local_time: input.startTime, duration_minutes: input.durationMinutes };
  if (toolName === "reschedule_appointment") return { appointment_id: input.appointmentId, expected_status: input.expectedStatus, local_date: input.date, local_time: input.startTime, duration_minutes: input.durationMinutes };
  return { appointment_id: input.appointmentId, expected_status: input.expectedStatus };
}

function registryArguments(toolName: AssistantToolName, value: Record<string, unknown>) {
  if (toolName === "create_appointment") return { patientId: value.patient_id, professionalId: value.professional_id, date: value.local_date, startTime: value.local_time, durationMinutes: value.duration_minutes };
  if (toolName === "reschedule_appointment") return { appointmentId: value.appointment_id, expectedStatus: value.expected_status, date: value.local_date, startTime: value.local_time, durationMinutes: value.duration_minutes };
  return { appointmentId: value.appointment_id, expectedStatus: value.expected_status };
}

export async function prepareAssistantMutation(name: string, rawInput: unknown): Promise<AssistantToolResult<AssistantProposal>> {
  const tool = getAssistantTool(name); if (!tool || !tool.mutation) return assistantToolError("validation_error", "La herramienta solicitada no admite una acción confirmable.");
  const context = await getAssistantToolContext(); if (!context.ok) return context;
  const input = tool.inputSchema.parse(rawInput); if (!input) return assistantToolError("validation_error", "Los datos de la acción no son válidos.");
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const rpc = await (await createClient()).rpc("create_assistant_pending_action_for_current_user" as never, { p_clinic_id: context.data.clinicId, p_tool_name: tool.name, p_validated_arguments: persistedArguments(tool.name, input as Record<string, unknown>), p_expires_at: expiresAt } as never) as unknown as { data: Array<{ id: string; tool_name: AssistantToolName; expires_at: string }> | null; error: { code?: string } | null };
  if (rpc.error || !rpc.data?.[0]) return safeFailure(rpc.error?.code === "42501" ? "forbidden" : "error");
  logger.info("assistant_action_proposed", { tool_name: tool.name, clinic_id: context.data.clinicId, actor_user_id: context.data.userId, actor_role: context.data.role });
  return { ok: true, data: { actionId: rpc.data[0].id, toolName: rpc.data[0].tool_name, expiresAt: rpc.data[0].expires_at, summary: `Acción propuesta: ${tool.name}.` } };
}

export async function executeConfirmedAssistantAction(actionId: string): Promise<AssistantToolResult<unknown>> {
  const current = await getAssistantToolContext(); if (!current.ok) return current;
  const claim = await (await createClient()).rpc("claim_assistant_pending_action_for_current_user" as never, { p_action_id: actionId } as never) as unknown as { data: Array<{ tool_name: string; validated_arguments: Record<string, unknown>; status: string }> | null; error: { code?: string } | null };
  if (claim.error || !claim.data?.[0]) return safeFailure(claim.error?.code === "42501" ? "forbidden" : "error");
  const pending = claim.data[0];
  if (pending.status === "expired") { logger.info("assistant_action_expired", { clinic_id: current.data.clinicId, actor_user_id: current.data.userId, actor_role: current.data.role }); return assistantToolError("confirmation_required", "La confirmación venció. Prepara una propuesta nueva."); }
  if (pending.status !== "claimed") return assistantToolError("confirmation_required", "La propuesta ya no puede ejecutarse.");
  const tool = getAssistantTool(pending.tool_name); if (!tool || !tool.mutation) return assistantToolError("validation_error", "La acción ya no está disponible.");
  const startedAt = Date.now(); logger.info("assistant_action_confirmed", { tool_name: tool.name, clinic_id: current.data.clinicId, actor_user_id: current.data.userId, actor_role: current.data.role });
  const executable = tool as unknown as { execute(context: AssistantToolContext, input: unknown): Promise<AssistantToolResult<unknown>> };
  const result = await executable.execute(current.data, registryArguments(tool.name, pending.validated_arguments));
  const finish = await (await createClient()).rpc("finish_assistant_pending_action_for_current_user" as never, { p_action_id: actionId, p_outcome: result.ok ? "executed" : "failed", p_error_code: result.ok ? null : result.error.code } as never) as unknown as { data: string | null; error: { code?: string } | null };
  if (finish.error || finish.data !== (result.ok ? "executed" : "failed")) {
    logger.error("assistant_action_failed", { tool_name: tool.name, clinic_id: current.data.clinicId, actor_user_id: current.data.userId, actor_role: current.data.role, error_code: "generic" });
    return assistantToolError("generic", "No fue posible confirmar el resultado de la acción. Prepara una propuesta nueva.");
  }
  logger.info(result.ok ? "assistant_action_executed" : "assistant_action_failed", { tool_name: tool.name, clinic_id: current.data.clinicId, actor_user_id: current.data.userId, actor_role: current.data.role, duration_ms: Date.now() - startedAt, error_code: result.ok ? undefined : result.error.code }); return result;
}

export async function cancelAssistantPendingAction(actionId: string): Promise<AssistantToolResult<{ status: string }>> {
  const context = await getAssistantToolContext(); if (!context.ok) return context;
  const result = await (await createClient()).rpc("cancel_assistant_pending_action_for_current_user" as never, { p_action_id: actionId } as never) as unknown as { data: string | null; error: { code?: string } | null };
  if (result.error || !result.data) return safeFailure(result.error?.code === "42501" ? "forbidden" : "error");
  logger.info("assistant_action_cancelled", { clinic_id: context.data.clinicId, actor_user_id: context.data.userId, actor_role: context.data.role }); return { ok: true, data: { status: result.data } };
}
