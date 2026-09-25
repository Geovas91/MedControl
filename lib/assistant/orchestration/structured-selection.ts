import { isAllowedAppointmentDuration, isValidAppointmentTime } from "@/lib/appointments/create";
import { isCanonicalAppointmentDate, isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import type { AssistantIntent } from "./intents";
import { isAssistantIntent } from "@/lib/assistant/parser/deterministic";

export type AssistantStructuredChoice =
  | { kind: "patient"; label: string; reference: string }
  | { kind: "professional"; label: string; reference: string }
  | { kind: "appointment"; label: string; reference: string }
  | { kind: "available_slot"; label: string; professionalReference: string; localDate: string; startTime: string; endTime: string; durationMinutes: number };

export type VerifiedAssistantAppointment = {
  id: string; patient: string; professional: string | null; startsAt: string; endsAt: string; status: string;
};
export type VerifiedAssistantProfessional = { clinicMemberId: string; userId: string; label: string };
export type StructuredSelectionDependencies = {
  patient(reference: string): Promise<boolean>;
  professional(reference: string): Promise<VerifiedAssistantProfessional | null>;
  appointment(reference: string): Promise<VerifiedAssistantAppointment | null>;
  slot(choice: Extract<AssistantStructuredChoice, { kind: "available_slot" }>, pending: AssistantIntent | null): Promise<{ valid: boolean; appointment?: VerifiedAssistantAppointment | null }>;
};
export type StructuredSelectionResult =
  | { state: "continue"; intent: AssistantIntent }
  | { state: "appointment"; appointment: VerifiedAssistantAppointment }
  | { state: "error"; message: string };

const invalidSelection = "La selección no es válida.";
const staleSelection = "La selección ya no está disponible. Actualiza la consulta y vuelve a elegir.";
const incompatibleSelection = "Esa opción no corresponde a la solicitud actual.";

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parseAssistantStructuredChoice(value: unknown): AssistantStructuredChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const choice = value as Record<string, unknown>;
  const label = choice.label;
  if (typeof label !== "string" || !label.trim() || label.length > 180 || /[\u0000-\u001f\u007f]/.test(label)) return null;
  if (choice.kind === "patient" || choice.kind === "professional" || choice.kind === "appointment") {
    if (!exactKeys(choice, ["kind", "label", "reference"]) || typeof choice.reference !== "string" || !isCanonicalAppointmentUuid(choice.reference)) return null;
    return { kind: choice.kind, label: label.trim(), reference: choice.reference };
  }
  if (choice.kind === "available_slot") {
    if (!exactKeys(choice, ["kind", "label", "professionalReference", "localDate", "startTime", "endTime", "durationMinutes"])) return null;
    if (typeof choice.professionalReference !== "string" || !isCanonicalAppointmentUuid(choice.professionalReference)) return null;
    if (typeof choice.localDate !== "string" || !isCanonicalAppointmentDate(choice.localDate)) return null;
    if (typeof choice.startTime !== "string" || !isValidAppointmentTime(choice.startTime) || typeof choice.endTime !== "string" || !isValidAppointmentTime(choice.endTime)) return null;
    if (typeof choice.durationMinutes !== "number" || !isAllowedAppointmentDuration(choice.durationMinutes)) return null;
    return { kind: "available_slot", label: label.trim(), professionalReference: choice.professionalReference, localDate: choice.localDate, startTime: choice.startTime, endTime: choice.endTime, durationMinutes: choice.durationMinutes };
  }
  return null;
}

export async function resolveAssistantStructuredChoice(value: unknown, pendingValue: unknown, dependencies: StructuredSelectionDependencies): Promise<StructuredSelectionResult> {
  const choice = parseAssistantStructuredChoice(value);
  if (!choice) return { state: "error", message: invalidSelection };
  const pending = pendingValue === null || pendingValue === undefined ? null : isAssistantIntent(pendingValue) ? pendingValue : undefined;
  if (pending === undefined) return { state: "error", message: incompatibleSelection };

  if (choice.kind === "patient") {
    if (!await dependencies.patient(choice.reference)) return { state: "error", message: staleSelection };
    if (!pending || pending.type === "search_patients") return { state: "continue", intent: { type: "create_appointment", patientId: choice.reference, durationMinutes: 30 } };
    if (pending.type === "create_appointment") return { state: "continue", intent: { ...pending, patientId: choice.reference, patientQuery: undefined } };
    if (pending.type === "search_appointments") return { state: "continue", intent: { ...pending, patientId: choice.reference, patientQuery: undefined } };
    return { state: "error", message: incompatibleSelection };
  }

  if (choice.kind === "professional") {
    const professional = await dependencies.professional(choice.reference);
    if (!professional) return { state: "error", message: staleSelection };
    if (!pending || pending.type === "get_professionals") return { state: "continue", intent: { type: "check_availability", professionalClinicMemberId: professional.clinicMemberId, durationMinutes: 30 } };
    if (pending.type === "create_appointment" || pending.type === "check_availability") return { state: "continue", intent: { ...pending, professionalClinicMemberId: professional.clinicMemberId, professionalQuery: undefined } };
    if (pending.type === "search_appointments" || pending.type === "get_appointment") return { state: "continue", intent: { ...pending, professionalId: professional.userId, professionalQuery: undefined } };
    return { state: "error", message: incompatibleSelection };
  }

  if (choice.kind === "appointment") {
    const appointment = await dependencies.appointment(choice.reference);
    if (!appointment) return { state: "error", message: staleSelection };
    if (pending?.type === "cancel_appointment" || pending?.type === "confirm_appointment" || pending?.type === "reschedule_appointment") {
      return { state: "continue", intent: { ...pending, appointmentId: appointment.id, appointmentQuery: undefined, expectedStatus: appointment.status } };
    }
    return { state: "appointment", appointment };
  }

  const checked = await dependencies.slot(choice, pending);
  if (!checked.valid) return { state: "error", message: staleSelection };
  if (pending?.type === "create_appointment") {
    return { state: "continue", intent: { ...pending, professionalClinicMemberId: choice.professionalReference, professionalQuery: undefined, localDate: choice.localDate, localTime: choice.startTime, durationMinutes: choice.durationMinutes } };
  }
  if (pending?.type === "reschedule_appointment") {
    if (!checked.appointment || !pending.appointmentId || pending.appointmentId !== checked.appointment.id) return { state: "error", message: staleSelection };
    return { state: "continue", intent: { ...pending, expectedStatus: checked.appointment.status, localDate: choice.localDate, localTime: choice.startTime, durationMinutes: choice.durationMinutes } };
  }
  if (!pending || pending.type === "check_availability") {
    const professionalReference = pending?.type === "check_availability" ? pending.professionalClinicMemberId ?? choice.professionalReference : choice.professionalReference;
    if (professionalReference !== choice.professionalReference) return { state: "error", message: incompatibleSelection };
    return { state: "continue", intent: { type: "create_appointment", professionalClinicMemberId: professionalReference, localDate: choice.localDate, localTime: choice.startTime, durationMinutes: choice.durationMinutes } };
  }
  return { state: "error", message: incompatibleSelection };
}
