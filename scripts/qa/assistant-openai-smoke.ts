import { pathToFileURL } from 'node:url';
import { planAssistantConversation } from '../../lib/assistant/llm/planner.ts';
import { requestOpenAiPlanner } from '../../lib/assistant/llm/transport.ts';
import { logger } from '../../lib/logger.ts';

export type SmokeOutcome = {
  status: 'PASS' | 'BLOCKED' | 'FAIL';
  reason: 'opt_in_required' | 'api_key_required' | 'provider_success' | 'provider_failure' | 'planner_fallback';
  plannerInvoked: boolean; plannerSuccess: boolean; plannerFallback: boolean; providerFailure: boolean; requests: number;
};

/** Exactly one bounded request, using the same transport and planner as the app.
 * This process-local observation avoids dumping provider content or exceptions. */
export async function runOpenAiSmoke(env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<SmokeOutcome> {
  const outcome: SmokeOutcome = { status: 'BLOCKED', reason: 'opt_in_required', plannerInvoked: false, plannerSuccess: false, plannerFallback: false, providerFailure: false, requests: 0 };
  if (env.ASSISTANT_QA_OPENAI_LIVE !== '1') return outcome;
  if (!env.OPENAI_API_KEY) return { ...outcome, reason: 'api_key_required' };
  const originalInfo = logger.info;
  const observed = new Set<string>();
  logger.info = (event) => { observed.add(event); };
  try {
    await planAssistantConversation({
      message: 'Muéstrame mis citas de mañana', today: '2030-10-21', pending: null,
      role: 'assistant', isProfessional: false, timeZone: 'America/Mexico_City', enabled: true, readToolsEnabled: true,
      provider: async (context) => {
        outcome.requests++;
        try {
          const response = await requestOpenAiPlanner({ context, apiKey: env.OPENAI_API_KEY!, model: env.APPOINTMENT_ASSISTANT_LLM_MODEL?.trim() || 'gpt-6-luna', readToolsEnabled: true, fetcher });
          return response.draft;
        } catch (error) {
          outcome.providerFailure = true;
          throw error;
        }
      }
    });
    outcome.plannerInvoked = observed.has('planner_called');
    outcome.plannerSuccess = observed.has('planner_success') && !outcome.providerFailure;
    outcome.plannerFallback = observed.has('planner_fallback') || observed.has('planner_invalid_output') || observed.has('planner_timeout');
    outcome.status = outcome.plannerSuccess && outcome.requests === 1 ? 'PASS' : 'FAIL';
    outcome.reason = outcome.providerFailure ? 'provider_failure' : outcome.plannerSuccess ? 'provider_success' : 'planner_fallback';
    return outcome;
  } finally {
    logger.info = originalInfo;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const outcome = await runOpenAiSmoke(process.env);
    console.log(JSON.stringify(outcome));
    process.exitCode = outcome.status === 'PASS' ? 0 : outcome.status === 'BLOCKED' ? 2 : 1;
  } catch {
    console.log(JSON.stringify({ status: 'FAIL', reason: 'smoke_execution_error' }));
    process.exitCode = 1;
  }
}
