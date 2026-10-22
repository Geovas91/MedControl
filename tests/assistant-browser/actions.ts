// Actual action source is bundled only in this isolated test process. This is
// not the HTTP/Flight boundary or the deployed server authorization layer.
import * as actual from '../../app/dashboard/bot/actions';
import { state } from './boundaries';

async function record<T>(operation: Promise<T>): Promise<T> {
  const result = await operation;
  if (result && typeof result === 'object' && 'context' in result) state.context = result.context as typeof state.context;
  return result;
}
export const planAssistantConversationWithContextAction = (...args: Parameters<typeof actual.planAssistantConversationWithContextAction>) => record(actual.planAssistantConversationWithContextAction(...args));
export const submitAssistantIntentWithContextAction = (...args: Parameters<typeof actual.submitAssistantIntentWithContextAction>) => record(actual.submitAssistantIntentWithContextAction(...args));
export const selectAssistantResultWithContextAction = (...args: Parameters<typeof actual.selectAssistantResultWithContextAction>) => record(actual.selectAssistantResultWithContextAction(...args));
export const submitAssistantContextualHelperWithContextAction = (...args: Parameters<typeof actual.submitAssistantContextualHelperWithContextAction>) => record(actual.submitAssistantContextualHelperWithContextAction(...args));
export const searchAssistantPatientSuggestionsAction = actual.searchAssistantPatientSuggestionsAction;
export const searchAssistantProfessionalSuggestionsAction = actual.searchAssistantProfessionalSuggestionsAction;
export const confirmAssistantProposalAction = actual.confirmAssistantProposalAction;
export const cancelAssistantProposalAction = actual.cancelAssistantProposalAction;
