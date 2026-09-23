import "server-only";
import { requestOpenAiPlanner } from "./transport";
import { PlannerProviderError, type PlannerContext, type PlannerProvider } from "./types";

/** One bounded HTTP call. No tools, response chaining, or persisted provider response. */
export const openAiPlannerProvider: PlannerProvider = async (context) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.APPOINTMENT_ASSISTANT_LLM_MODEL?.trim() || "gpt-6-luna";
  if (!apiKey) throw new PlannerProviderError("not_configured");
  const result = await requestOpenAiPlanner({ context, apiKey, model });
  return result.draft;
};
