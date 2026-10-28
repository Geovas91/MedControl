import type { ProviderSubscription } from './billing-policy.ts';

export type ReconciliationTicket = { id: string; generation: number; provider_plan: string; custom_id: string | null };
export type Observation = { id: string; plan: string; status: string; custom: string | null; updated: string | null; verified: string };
export const providerStatuses: Record<string, string> = { ACTIVE: 'active', APPROVED: 'inactive', APPROVAL_PENDING: 'inactive', SUSPENDED: 'past_due', CANCELLED: 'cancelled', EXPIRED: 'cancelled' };
export function verifyObservation(subscription: string, ticket: ReconciliationTicket, details: ProviderSubscription): Observation {
  if (details.id !== subscription || details.plan_id !== ticket.provider_plan || !Object.hasOwn(providerStatuses, details.status ?? '')
    || (details.custom_id != null && details.custom_id !== ticket.custom_id)
    || (details.status_update_time != null && !Number.isFinite(Date.parse(details.status_update_time)))) throw new Error('provider_mismatch');
  return { id: subscription, plan: details.plan_id!, status: details.status!, custom: details.custom_id ?? null,
    updated: details.status_update_time ?? null, verified: new Date().toISOString() };
}
export function createReconciler(deps: {
  begin(subscription: string): Promise<ReconciliationTicket>;
  details(subscription: string): Promise<ProviderSubscription>;
  finish(ticket: ReconciliationTicket, observation: Observation): Promise<string>;
  fail(ticket: ReconciliationTicket, reason: 'provider_mismatch' | 'provider_unavailable'): Promise<void>;
}) {
  return async (subscription: string) => {
    const ticket = await deps.begin(subscription);
    try {
      const observed = await deps.details(subscription);
      const verified = verifyObservation(subscription, ticket, observed);
      return await deps.finish(ticket, verified);
    } catch (error) {
      await deps.fail(ticket, error instanceof Error && error.message === 'provider_mismatch' ? 'provider_mismatch' : 'provider_unavailable').catch(() => {});
      return 'failed';
    }
  };
}
