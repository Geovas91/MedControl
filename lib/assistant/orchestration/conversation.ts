import type { AssistantIntent } from "./intents";
import { parseAssistantText, parseDateExpression, parseTimeExpression, type ParserResult } from "../parser/deterministic";

export function isConversationResetCommand(value: string) {
  return /^(?:cancelar|empezar de nuevo|nueva consulta)$/i.test(value.normalize("NFKC").replace(/\s+/g, " ").trim());
}

export function followUpIntent(intent: AssistantIntent, text: string, today: string): AssistantIntent {
  const date = parseDateExpression(text, today) ?? undefined;
  const time = parseTimeExpression(text) ?? undefined;
  const query = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (intent.type === "create_appointment") {
    if (!intent.patientId && !intent.patientQuery) return { ...intent, patientQuery: query };
    if (!intent.professionalId && !intent.professionalQuery) return { ...intent, professionalQuery: query };
    if (!intent.professionalId && intent.professionalQuery) return { ...intent, professionalQuery: query };
    if (!intent.localDate && date) return { ...intent, localDate: date };
    if (!intent.localTime && time) return { ...intent, localTime: time };
  }
  if (intent.type === "check_availability") {
    if (!intent.professionalId && !intent.professionalQuery) return { ...intent, professionalQuery: query };
    if (!intent.professionalId && intent.professionalQuery) return { ...intent, professionalQuery: query };
    if (!intent.localDate && date) return { ...intent, localDate: date };
  }
  if (intent.type === "reschedule_appointment") {
    if (!intent.appointmentId && !intent.appointmentQuery) return { ...intent, appointmentQuery: query };
    if (!intent.localDate && date) return { ...intent, localDate: date };
    if (!intent.localTime && time) return { ...intent, localTime: time };
  }
  return intent;
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
