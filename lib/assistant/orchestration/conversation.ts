import type { AssistantIntent } from "./intents";
import { parseAssistantText, parseDateExpression, parseTimeExpression, type ParserResult } from "../parser/deterministic";

export type AssistantMissingField = "patient" | "professional" | "appointment" | "localDate" | "localTime" | "duration";

export type ContextualHelper = "patients" | "professionals";

export type SchedulingProfessionalContext = {
  role: "owner" | "admin" | "assistant" | "doctor";
  isProfessional: boolean;
  clinicMemberId: string;
};

/** Resolve the authenticated professional for self-scheduling without trusting client input. */
export function getDefaultSchedulingProfessional(context: SchedulingProfessionalContext): string | null {
  if (!context.isProfessional) return null;
  if (context.role === "doctor" || context.role === "owner" || context.role === "admin") return context.clinicMemberId;
  return null;
}

export function classifyContextualHelper(intent: AssistantIntent, value: string): ContextualHelper | null {
  const text = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const missing = getMissingFields(intent);
  if (missing.includes("patient") && /^(?:dame la lista de pacientes|ver pacientes|que pacientes hay|muestrame pacientes)$/.test(plain)) return "patients";
  const professionalHelper = /^(?:dame la lista de profesionales|dame la lista de medicos|ver profesionales|ver medicos|que profesionales hay|que doctores hay|muestrame profesionales|muestrame medicos|cambiar profesional|elegir otro medico)$/.test(plain);
  if (professionalHelper && (missing.includes("professional") || intent.type === "create_appointment" || intent.type === "check_availability")) return "professionals";
  return null;
}

export function getMissingFields(intent: AssistantIntent): AssistantMissingField[] {
  if (intent.type === "check_availability") return [...(!intent.professionalClinicMemberId ? ["professional" as const] : []), ...(!intent.localDate ? ["localDate" as const] : [])];
  if (intent.type === "create_appointment") return [...(!intent.patientId ? ["patient" as const] : []), ...(!intent.professionalClinicMemberId ? ["professional" as const] : []), ...(!intent.localDate ? ["localDate" as const] : []), ...(!intent.localTime ? ["localTime" as const] : [])];
  if (intent.type === "reschedule_appointment") return [...(!intent.appointmentId ? ["appointment" as const] : []), ...(!intent.localDate ? ["localDate" as const] : []), ...(!intent.localTime ? ["localTime" as const] : [])];
  if (intent.type === "confirm_appointment" || intent.type === "cancel_appointment") return intent.appointmentId ? [] : ["appointment"];
  return [];
}

export type FollowUpResult = { updatedIntent: AssistantIntent; consumed: boolean; missingFields: AssistantMissingField[] };

export function applyFollowUpToIntent({ intent, message, clinicLocalDate }: { intent: AssistantIntent; message: string; clinicLocalDate: string }): FollowUpResult {
  const query = message.normalize("NFKC").replace(/\s+/g, " ").trim();
  const date = parseDateExpression(query, clinicLocalDate);
  const time = parseTimeExpression(query);
  const missing = getMissingFields(intent);
  let updatedIntent = intent;
  // Structural slots are deterministic and take precedence over entity text.
  if (missing.includes("localDate") && date) updatedIntent = { ...intent, localDate: date } as AssistantIntent;
  else if (missing.includes("localTime") && time) updatedIntent = { ...intent, localTime: time } as AssistantIntent;
  else if (missing.includes("patient") && intent.type === "create_appointment") updatedIntent = { ...intent, patientQuery: query };
  else if (missing.includes("professional") && (intent.type === "create_appointment" || intent.type === "check_availability")) updatedIntent = { ...intent, professionalQuery: query };
  else if (missing.includes("appointment") && (intent.type === "confirm_appointment" || intent.type === "cancel_appointment" || intent.type === "reschedule_appointment")) updatedIntent = { ...intent, appointmentQuery: query };
  return { updatedIntent, consumed: updatedIntent !== intent, missingFields: getMissingFields(updatedIntent) };
}

export function isConversationResetCommand(value: string) {
  return /^(?:cancelar|empezar de nuevo|nueva consulta)$/i.test(value.normalize("NFKC").replace(/\s+/g, " ").trim());
}

export function followUpIntent(intent: AssistantIntent, text: string, today: string): AssistantIntent {
  return applyFollowUpToIntent({ intent, message: text, clinicLocalDate: today }).updatedIntent;
}

export type ConversationInput =
  | { state: "reset" }
  | { state: "parsed"; result: ParserResult };

export function resolveConversationInput(pending: AssistantIntent | null, text: string, today: string): ConversationInput {
  if (pending && isConversationResetCommand(text)) return { state: "reset" };
  const parsed = parseAssistantText(text, today);
  // Any recognized intent is explicit and replaces a pending follow-up flow.
  if (!pending || parsed.state === "intent" || (parsed.state === "needs_input" && parsed.intent)) return { state: "parsed", result: parsed };
  return { state: "parsed", result: { state: "intent", intent: followUpIntent(pending, text, today) } };
}
