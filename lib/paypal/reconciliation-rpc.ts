import type { ProviderSubscription } from './billing-policy.ts';
import { createReconciler, type ReconciliationTicket } from './reconciliation.ts';

// Shared by the server adapter and runtime tests; no credentials or transport here.
export function createRpcReconciler(
  rpc: <T>(name: string, args: Record<string, unknown>) => Promise<T>,
  details: (subscription: string) => Promise<ProviderSubscription>,
  authorization: Record<string, unknown>
) {
  return createReconciler({
    async begin(id) {
      const ticket = await rpc<ReconciliationTicket & { state: string }>('begin_paypal_reconciliation', { p_subscription: id, ...authorization });
      if (ticket.state !== 'claimed') throw new Error('reconciliation_review_required');
      return ticket;
    },
    details,
    finish: (ticket, observed) => rpc<string>('finish_paypal_reconciliation', {
      p_id: ticket.id, p_generation: ticket.generation, p_subscription: observed.id, p_plan: observed.plan,
      p_status: observed.status, p_custom: observed.custom, p_updated: observed.updated, p_verified: observed.verified,
      p_start: observed.start, p_end: observed.end
    }),
    fail: (ticket, reason) => rpc('fail_paypal_reconciliation', { p_id: ticket.id, p_generation: ticket.generation, p_reason: reason })
  });
}
