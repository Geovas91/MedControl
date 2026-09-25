import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";
import { planAssistantConversation } from "./planner";
import { ASSISTANT_DOMAIN_REPLY, ASSISTANT_RATE_LIMIT_REPLY, DEFAULT_ASSISTANT_LLM_MAX_INPUT_CHARS, evaluateAssistantDomainGate } from "./domain-gate";
import type { ConversationInput } from "@/lib/assistant/orchestration/conversation";
import type { PlannerProvider } from "./types";

export const ASSISTANT_TOO_LONG_REPLY = "El mensaje es demasiado largo. Resume la solicitud de agenda en un mensaje más corto.";
export type AssistantLlmGateEvent = "llm_gate_allowed" | "llm_gate_rejected" | "llm_gate_too_long" | "llm_rate_limited";
export type AssistantLlmGateDetails = { reason_code: string; intent_category: string };

export async function runGatedAssistantPlanner({ message, today, pending, role, isProfessional, timeZone, readToolsEnabled, maxInputChars = DEFAULT_ASSISTANT_LLM_MAX_INPUT_CHARS, consumeRateLimit, provider, observe = () => {} }: {
  message: string; today: string; pending: AssistantIntent | null; role: string; isProfessional: boolean; timeZone: string;
  readToolsEnabled: boolean; maxInputChars?: number; consumeRateLimit: () => boolean; provider: PlannerProvider;
  observe?: (event: AssistantLlmGateEvent, details: AssistantLlmGateDetails) => void;
}): Promise<ConversationInput> {
  const gate = evaluateAssistantDomainGate({ message, today, pending, maxInputChars });
  if (gate.state === "too_long") {
    observe("llm_gate_too_long", { reason_code: gate.reasonCode, intent_category: gate.intentCategory });
    return { state: "parsed", result: { state: "unsupported", message: ASSISTANT_TOO_LONG_REPLY } };
  }
  if (gate.state === "rejected") {
    observe("llm_gate_rejected", { reason_code: gate.reasonCode, intent_category: gate.intentCategory });
    return { state: "parsed", result: { state: "unsupported", message: ASSISTANT_DOMAIN_REPLY } };
  }
  observe("llm_gate_allowed", { reason_code: gate.reasonCode, intent_category: gate.intentCategory });
  if (!consumeRateLimit()) {
    observe("llm_rate_limited", { reason_code: "actor_clinic_window_limit", intent_category: gate.intentCategory });
    return { state: "parsed", result: { state: "unsupported", message: ASSISTANT_RATE_LIMIT_REPLY } };
  }
  return planAssistantConversation({ message: gate.message, today, pending, role, isProfessional, timeZone, enabled: true, readToolsEnabled, maxInputChars, contextualFollowUp: gate.reasonCode === "contextual_follow_up", provider });
}
