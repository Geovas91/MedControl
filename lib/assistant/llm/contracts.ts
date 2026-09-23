import { isAllowedAppointmentDuration } from "@/lib/appointments/create";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { parseDateExpression, parseTimeExpression } from "@/lib/assistant/parser/deterministic";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";

export const plannerIntents = ["search_patients", "search_appointments", "check_availability", "create_appointment", "confirm_appointment", "reschedule_appointment", "cancel_appointment", "unknown"] as const;
export type AssistantIntentDraft = {
  intent: (typeof plannerIntents)[number];
  patientQuery: string | null;
  professionalQuery: string | null;
  appointmentQuery: string | null;
  date: string | null;
  time: string | null;
  duration: number | null;
};

export const plannerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "patientQuery", "professionalQuery", "appointmentQuery", "date", "time", "duration"],
  properties: {
    intent: { type: "string", enum: plannerIntents },
    patientQuery: { type: ["string", "null"] },
    professionalQuery: { type: ["string", "null"] },
    appointmentQuery: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    time: { type: ["string", "null"] },
    duration: { type: ["integer", "null"] }
  }
} as const;

const keys = Object.keys(plannerSchema.properties);
function safeQuery(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.trim().length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value) && !isCanonicalAppointmentUuid(value.trim()));
}

export function parseAssistantIntentDraft(value: unknown): AssistantIntentDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (Object.keys(draft).length !== keys.length || keys.some((key) => !(key in draft))) return null;
  if (!plannerIntents.includes(draft.intent as AssistantIntentDraft["intent"])) return null;
  if (!["patientQuery", "professionalQuery", "appointmentQuery"].every((key) => safeQuery(draft[key]))) return null;
  if (draft.date !== null && (typeof draft.date !== "string" || draft.date.length > 40)) return null;
  if (draft.time !== null && (typeof draft.time !== "string" || draft.time.length > 20)) return null;
  if (draft.duration !== null && (typeof draft.duration !== "number" || !isAllowedAppointmentDuration(draft.duration))) return null;
  return draft as AssistantIntentDraft;
}

export function intentFromDraft(draft: AssistantIntentDraft, today: string, pending: AssistantIntent | null): AssistantIntent | null {
  if (draft.intent === "unknown") return null;
  const same = pending?.type === draft.intent ? pending : null;
  const date = draft.date ? parseDateExpression(draft.date, today) : undefined;
  const time = draft.time ? parseTimeExpression(`a las ${draft.time}`) : undefined;
  if ((draft.date && !date) || (draft.time && !time)) return null;
  const durationMinutes = draft.duration ?? (same && "durationMinutes" in same ? same.durationMinutes : 30);
  const patientQuery = draft.patientQuery?.trim() || undefined;
  const professionalQuery = draft.professionalQuery?.trim() || undefined;
  const appointmentQuery = draft.appointmentQuery?.trim() || undefined;
  switch (draft.intent) {
    case "search_patients": return { type: "search_patients", query: patientQuery ?? "" };
    case "search_appointments": return { type: "search_appointments", query: appointmentQuery, localDate: date ?? undefined };
    case "check_availability": return { type: "check_availability", professionalQuery: professionalQuery ?? (same?.type === "check_availability" ? same.professionalQuery : undefined), professionalClinicMemberId: professionalQuery ? undefined : (same?.type === "check_availability" ? same.professionalClinicMemberId : undefined), localDate: date ?? (same?.type === "check_availability" ? same.localDate : undefined), durationMinutes };
    case "create_appointment": return { type: "create_appointment", patientQuery: patientQuery ?? (same?.type === "create_appointment" ? same.patientQuery : undefined), patientId: patientQuery ? undefined : (same?.type === "create_appointment" ? same.patientId : undefined), professionalQuery: professionalQuery ?? (same?.type === "create_appointment" ? same.professionalQuery : undefined), professionalClinicMemberId: professionalQuery ? undefined : (same?.type === "create_appointment" ? same.professionalClinicMemberId : undefined), localDate: date ?? (same?.type === "create_appointment" ? same.localDate : undefined), localTime: time ?? (same?.type === "create_appointment" ? same.localTime : undefined), durationMinutes };
    case "confirm_appointment":
    case "cancel_appointment": return { type: draft.intent, appointmentQuery: appointmentQuery ?? (same && "appointmentQuery" in same ? same.appointmentQuery : undefined), appointmentId: appointmentQuery ? undefined : (same && "appointmentId" in same ? same.appointmentId : undefined) };
    case "reschedule_appointment": return { type: "reschedule_appointment", appointmentQuery: appointmentQuery ?? (same?.type === "reschedule_appointment" ? same.appointmentQuery : undefined), appointmentId: appointmentQuery ? undefined : (same?.type === "reschedule_appointment" ? same.appointmentId : undefined), localDate: date ?? (same?.type === "reschedule_appointment" ? same.localDate : undefined), localTime: time ?? (same?.type === "reschedule_appointment" ? same.localTime : undefined), durationMinutes };
  }
}
