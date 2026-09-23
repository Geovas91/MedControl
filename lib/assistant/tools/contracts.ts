import { appointmentDurations, isAllowedAppointmentDuration, isValidAppointmentTime } from "@/lib/appointments/create";
import { appointmentStatuses, isCanonicalAppointmentDate, isCanonicalAppointmentUuid, type AppointmentStatus } from "@/lib/appointments/query";
import type { Database } from "@/types/database";

export const assistantToolNames = [
  "search_patients", "search_appointments", "get_appointment", "get_available_slots",
  "get_professionals", "create_appointment", "confirm_appointment", "reschedule_appointment", "cancel_appointment"
] as const;
export type AssistantToolName = (typeof assistantToolNames)[number];
export type AssistantToolRole = Database["public"]["Enums"]["clinic_member_role"];

export type AssistantToolContext = {
  userId: string;
  clinicId: string;
  clinicMemberId: string;
  role: AssistantToolRole;
  isProfessional: boolean;
  timeZone: string;
};

export type AssistantToolErrorCode =
  | "forbidden" | "not_found" | "conflict" | "outside_availability" | "stale"
  | "invalid_transition" | "validation_error" | "entitlement" | "ambiguous" | "confirmation_required" | "generic";

export type AssistantToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AssistantToolErrorCode; safeMessage: string } };

export type AssistantToolSchema<T> = { parse(value: unknown): T | null };
export type AssistantToolDefinition<I, O> = {
  name: AssistantToolName;
  description: string;
  inputSchema: AssistantToolSchema<I>;
  outputSchema: AssistantToolSchema<O>;
  mutation: boolean;
  requiresConfirmation: boolean;
  execute(context: AssistantToolContext, input: I): Promise<AssistantToolResult<O>>;
};

export type CreateAppointmentToolInput = {
  patientId: string;
  professionalClinicMemberId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
};

export type PersistedCreateAppointmentArguments = {
  patient_id: string;
  professional_clinic_member_id: string;
  local_date: string;
  local_time: string;
  duration_minutes: number;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max = 120) => typeof value === "string" && value.trim().length <= max ? value.trim() : null;
const uuid = (value: unknown) => { const candidate = text(value, 80); return candidate && isCanonicalAppointmentUuid(candidate) ? candidate : null; };
const localDate = (value: unknown) => { const candidate = text(value, 10); return candidate && isCanonicalAppointmentDate(candidate) ? candidate : null; };
const localTime = (value: unknown) => { const candidate = text(value, 5); return candidate && isValidAppointmentTime(candidate) ? candidate : null; };
const duration = (value: unknown) => typeof value === "number" && Number.isInteger(value) && isAllowedAppointmentDuration(value) ? value : null;
const status = (value: unknown) => typeof value === "string" && appointmentStatuses.includes(value as AppointmentStatus) ? value as AppointmentStatus : null;

export const toolSchemas = {
  searchPatients: { parse(value: unknown) { const input = record(value); const query = input?.query === "" ? "" : text(input?.query, 100); return query !== null && query !== undefined ? { query } : null; } },
  searchAppointments: { parse(value: unknown) { const input = record(value); if (!input) return null; const patientId = input.patientId === undefined ? null : uuid(input.patientId); const professionalId = input.professionalId === undefined ? null : uuid(input.professionalId); const date = input.date === undefined ? null : localDate(input.date); const requestedStatus = input.status === undefined ? null : status(input.status); return (input.patientId !== undefined && !patientId) || (input.professionalId !== undefined && !professionalId) || (input.date !== undefined && !date) || (input.status !== undefined && !requestedStatus) ? null : { patientId, professionalId, date, status: requestedStatus }; } },
  appointmentId: { parse(value: unknown) { const input = record(value); const appointmentId = uuid(input?.appointmentId); return appointmentId ? { appointmentId } : null; } },
  availableSlots: { parse(value: unknown) { const input = record(value); const professionalClinicMemberId = uuid(input?.professionalClinicMemberId); const date = localDate(input?.date); const minutes = duration(input?.durationMinutes); return professionalClinicMemberId && date && minutes ? { professionalClinicMemberId, date, durationMinutes: minutes } : null; } },
  // The assistant uses the existing neutral appointment title. Free-form display text
  // is deliberately excluded from a durable confirmation proposal.
  createAppointment: { parse(value: unknown) { const input = record(value); const patientId = uuid(input?.patientId); const professionalClinicMemberId = uuid(input?.professionalClinicMemberId); const date = localDate(input?.date); const startTime = localTime(input?.startTime); const minutes = duration(input?.durationMinutes); return patientId && professionalClinicMemberId && date && startTime && minutes ? { patientId, professionalClinicMemberId, date, startTime, durationMinutes: minutes } : null; } },
  lifecycle: { parse(value: unknown) { const input = record(value); const appointmentId = uuid(input?.appointmentId); const expectedStatus = status(input?.expectedStatus); return appointmentId && expectedStatus ? { appointmentId, expectedStatus } : null; } },
  reschedule: { parse(value: unknown) { const input = record(value); const appointmentId = uuid(input?.appointmentId); const expectedStatus = status(input?.expectedStatus); const date = localDate(input?.date); const startTime = localTime(input?.startTime); const minutes = duration(input?.durationMinutes); return appointmentId && expectedStatus && date && startTime && minutes ? { appointmentId, expectedStatus, date, startTime, durationMinutes: minutes } : null; } },
  output: { parse(value: unknown) { return value as never; } }
} satisfies Record<string, AssistantToolSchema<never> | AssistantToolSchema<unknown>>;

// A pending action stores only stable execution identifiers and clinic-local time.
// Both proposal creation and confirmation must cross this same boundary so that a
// durable proposal cannot be accepted with a shape that confirmation rejects.
export function serializeCreateAppointmentPendingArguments(input: CreateAppointmentToolInput): PersistedCreateAppointmentArguments {
  return {
    patient_id: input.patientId,
    professional_clinic_member_id: input.professionalClinicMemberId,
    local_date: input.date,
    local_time: input.startTime,
    duration_minutes: input.durationMinutes
  };
}

export function parseCreateAppointmentPendingArguments(value: unknown): CreateAppointmentToolInput | null {
  const input = record(value);
  return toolSchemas.createAppointment.parse({
    patientId: input?.patient_id,
    professionalClinicMemberId: input?.professional_clinic_member_id,
    date: input?.local_date,
    startTime: input?.local_time,
    durationMinutes: input?.duration_minutes
  });
}

export const assistantToolError = (code: AssistantToolErrorCode, safeMessage: string): AssistantToolResult<never> => ({ ok: false, error: { code, safeMessage } });
export const allowedDurations = appointmentDurations;
