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
  const professionalHelper = /^(?:dame la lista de (?:profesionales|medicos|doctores)|lista de (?:profesionales|medicos|doctores)|(?:ver|mostrar|muestrame) (?:los )?(?:profesionales|medicos|doctores)|que (?:profesionales|medicos|doctores) hay|con que (?:profesionales|medicos|doctores) puedo agendar|cambiar profesional|elegir otro medico)$/.test(plain);
  if (professionalHelper && (missing.includes("professional") || intent.type === "create_appointment" || intent.type === "check_availability")) return "professionals";
  return null;
}

export function getMissingFields(intent: AssistantIntent): AssistantMissingField[] {
  if (intent.type === "get_appointment") return intent.appointmentId || intent.localDate ? [] : ["localDate"];
  if (intent.type === "check_availability") return [...(!intent.professionalClinicMemberId ? ["professional" as const] : []), ...(!intent.localDate ? ["localDate" as const] : [])];
  if (intent.type === "create_appointment") return [...(!intent.patientId ? ["patient" as const] : []), ...(!intent.professionalClinicMemberId ? ["professional" as const] : []), ...(!intent.localDate ? ["localDate" as const] : []), ...(!intent.localTime ? ["localTime" as const] : [])];
  if (intent.type === "reschedule_appointment") return [...(!intent.appointmentId ? ["appointment" as const] : []), ...(!intent.localDate ? ["localDate" as const] : []), ...(!intent.localTime ? ["localTime" as const] : [])];
  if (intent.type === "confirm_appointment" || intent.type === "cancel_appointment") return intent.appointmentId ? [] : ["appointment"];
  return [];
}

export type FollowUpResult = { updatedIntent: AssistantIntent; consumed: boolean; missingFields: AssistantMissingField[] };

export type PendingProposalAmendment = {
  field: "patient" | "professional" | "localDate" | "localTime";
  intent: AssistantIntent;
};

/** Applies an explicit correction to a complete scheduling draft without executing it. */
export function amendPendingProposalIntent({ intent, message, clinicLocalDate }: { intent: AssistantIntent; message: string; clinicLocalDate: string }): PendingProposalAmendment | null {
  if (intent.type !== "create_appointment" && intent.type !== "reschedule_appointment") return null;
  const text = message.normalize("NFKC").replace(/\s+/g, " ").trim();
  const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const bareTime = /^a\s+las?\s+(?:[1-8]|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+en\s+punto)?$/.test(plain);
  const explicitAmendment = bareTime || /^(?:mejor\b|cambial[oa]\b|ponl[oa]\b|otro\s+(?:doctor|medico|profesional)\b|para\b)/.test(plain);
  if (!explicitAmendment) return null;

  if (intent.type === "create_appointment") {
    const patient = /^(?:mejor\s+)?para\s+(.{2,100})$/i.exec(text)?.[1]?.trim();
    if (patient) return { field: "patient", intent: { ...intent, patientId: undefined, patientQuery: patient } };

    if (/^otro\s+(?:doctor|medico|profesional)$/i.test(plain)) {
      return { field: "professional", intent: { ...intent, professionalClinicMemberId: undefined, professionalQuery: undefined, localTime: undefined } };
    }
    const professional = /^(?:mejor\s+con|c[aá]mbial[oa]\s+(?:al|a\s+la|con)|mejor\s+(?:al|a\s+la))\s+(.{2,100})$/i.exec(text)?.[1]?.trim();
    if (professional && /\b(?:doctor|doctora|dr\.?|dra\.?|medico|medica|profesional)\b/i.test(professional)) {
      return { field: "professional", intent: { ...intent, professionalClinicMemberId: undefined, professionalQuery: professional, localTime: undefined } };
    }
  }

  const date = parseDateExpression(text, clinicLocalDate);
  if (date && /^(?:mejor|cambial[oa]|ponl[oa])\b/.test(plain) && !parseTimeExpression(text)) {
    return { field: "localDate", intent: { ...intent, localDate: date, localTime: undefined } };
  }
  let time = parseTimeExpression(text);
  if (!time) {
    const spokenHour = /^(?:(?:mejor|c[aá]mbial[oa]|ponl[oa]?)\s+)?a\s+las?\s+(una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+en\s+punto)?$/i.exec(plain)?.[1];
    const hour = spokenHour ? ({ una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 } as const)[spokenHour as "una" | "dos" | "tres" | "cuatro" | "cinco" | "seis" | "siete" | "ocho" | "nueve" | "diez" | "once" | "doce"] : undefined;
    if (hour) time = `${String(hour >= 1 && hour <= 8 ? hour + 12 : hour).padStart(2, "0")}:00`;
  }
  if (time && !/\b(?:am|pm)\b/i.test(text)) {
    const shortHour = /\ba\s+las?\s+([1-8])(?:\s|$)/i.exec(text)?.[1];
    if (shortHour) time = `${String(Number(shortHour) + 12).padStart(2, "0")}:00`;
  }
  if (time && (bareTime || /^(?:mejor|cambial[oa]|ponl[oa])\b/.test(plain))) {
    return { field: "localTime", intent: { ...intent, localTime: time } };
  }
  return null;
}

export function applyFollowUpToIntent({ intent, message, clinicLocalDate }: { intent: AssistantIntent; message: string; clinicLocalDate: string }): FollowUpResult {
  const query = message.normalize("NFKC").replace(/\s+/g, " ").trim();
  const date = parseDateExpression(query, clinicLocalDate);
  const time = parseTimeExpression(query);
  const missing = getMissingFields(intent);
  let updatedIntent = intent;
  // Structural slots are deterministic and take precedence over entity text.
  if (missing.includes("localDate") && date && missing.includes("localTime") && time) updatedIntent = { ...intent, localDate: date, localTime: time } as AssistantIntent;
  else if (missing.includes("localDate") && date) updatedIntent = { ...intent, localDate: date } as AssistantIntent;
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
