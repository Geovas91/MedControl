import { getMissingFields, resolveConversationInput, type ConversationInput } from "@/lib/assistant/orchestration/conversation";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";
import { normalizeAssistantQuery, parseAssistantText } from "@/lib/assistant/parser/deterministic";
import { logger } from "@/lib/logger";
import { intentFromDraft, parseAssistantIntentDraft } from "./contracts";
import { PlannerProviderError, type PlannerContext, type PlannerProvider } from "./types";
import { ASSISTANT_DOMAIN_REPLY } from "./domain-gate";

function minimizeMessageForProvider(message: string) {
  return message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[correo omitido]")
    .replace(/\+?\d(?:[\s().-]*\d){9,14}/g, "[teléfono omitido]");
}

export async function planAssistantConversation({ message, today, pending, role, isProfessional, timeZone, enabled, readToolsEnabled = false, maxInputChars = 500, contextualFollowUp = false, provider }: {
  message: string; today: string; pending: AssistantIntent | null; role: string; isProfessional: boolean; timeZone: string;
  enabled: boolean; readToolsEnabled?: boolean; maxInputChars?: number; contextualFollowUp?: boolean; provider: PlannerProvider;
}): Promise<ConversationInput> {
  const fallback = () => resolveConversationInput(pending, message, today);
  if (!enabled || !message.trim() || message.length > maxInputChars) return fallback();
  const deterministic = fallback();
  if (deterministic.state === "reset") return deterministic;
  // Explicit intent changes retain the existing deterministic precedence.
  const explicit = parseAssistantText(message, today);
  const active = pending && (contextualFollowUp || explicit.state !== "intent" || explicit.intent.type === pending.type) ? pending : null;
  const missing = active ? getMissingFields(active) : [];
  const resolvedSlots = active ? [
    ...(active.type === "create_appointment" && active.patientId ? ["patient"] : []),
    ...((active.type === "create_appointment" || active.type === "check_availability") && active.professionalClinicMemberId ? ["professional"] : []),
    ...((active.type === "confirm_appointment" || active.type === "cancel_appointment" || active.type === "reschedule_appointment") && active.appointmentId ? ["appointment"] : []),
    ...("localDate" in active && active.localDate ? ["localDate"] : []),
    ...("localTime" in active && active.localTime ? ["localTime"] : [])
  ] : [];
  const context: PlannerContext = {
    message: minimizeMessageForProvider(message), today, activeIntent: active?.type ?? null,
    resolvedSlots,
    missingSlots: missing, role, isProfessional, timeZone
  };
  const startedAt = Date.now();
  const intentCategory = explicit.state === "intent" ? explicit.intent.type : "unknown";
  logger.info("planner_called", { intent_category: intentCategory });
  try {
    const raw = await provider(context);
    const draft = parseAssistantIntentDraft(raw, readToolsEnabled);
    if (!draft) {
      logger.info("planner_invalid_output", { intent_category: intentCategory, latency_ms: Date.now() - startedAt });
      return deterministic;
    }
    if (draft.intent === "unknown") {
      logger.info("planner_success", { intent_category: "unknown", reason_code: "non_action", latency_ms: Date.now() - startedAt });
      return { state: "parsed", result: { state: "unsupported", message: ASSISTANT_DOMAIN_REPLY } };
    }
    const normalizedMessage = normalizeAssistantQuery(message);
    if ([draft.patientQuery, draft.professionalQuery, draft.appointmentQuery].some((query) => query && !normalizedMessage.includes(normalizeAssistantQuery(query)))) {
      logger.info("planner_invalid_output", { intent_category: intentCategory, reason_code: "ungrounded_query", latency_ms: Date.now() - startedAt });
      return deterministic;
    }
    if (!contextualFollowUp && pending && explicit.state === "intent" && explicit.intent.type !== pending.type && draft.intent !== explicit.intent.type) {
      logger.info("planner_fallback", { intent_category: intentCategory, reason_code: "explicit_intent_precedence", latency_ms: Date.now() - startedAt });
      return deterministic;
    }
    const intent = intentFromDraft(draft, today, active);
    if (!intent) {
      logger.info("planner_invalid_output", { intent_category: intentCategory, reason_code: "invalid_slot_value", latency_ms: Date.now() - startedAt });
      return deterministic;
    }
    logger.info("planner_success", { intent_category: intent.type, latency_ms: Date.now() - startedAt });
    return { state: "parsed", result: { state: "intent", intent } };
  } catch (error) {
    const failureCode = error instanceof PlannerProviderError ? error.code : "provider_error";
    const event = failureCode === "timeout" ? "planner_timeout" : failureCode === "invalid_response" ? "planner_invalid_output" : "planner_fallback";
    logger.info(event, { intent_category: intentCategory, reason_code: failureCode, provider_status: error instanceof PlannerProviderError ? error.providerStatus : undefined, latency_ms: Date.now() - startedAt });
    return deterministic;
  }
}
