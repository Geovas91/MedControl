import type { ProviderSubscription } from './billing-policy.ts';

export type ReconciliationTicket = { id: string; generation: number; provider_plan: string; custom_id: string | null; identity_trusted: boolean };
export type Observation = { id: string; plan: string; status: string; custom: string | null; updated: string | null; verified: string; start: string | null; end: string | null };
export const providerStatuses: Record<string, string> = { ACTIVE: 'active', APPROVED: 'inactive', APPROVAL_PENDING: 'inactive', SUSPENDED: 'past_due', CANCELLED: 'cancelled', EXPIRED: 'cancelled' };
// PayPal RFC3339 dates require seconds. Reject normalized invalid calendar dates,
// non-finite values and leap seconds (unsupported by this runtime), without logging input.
function providerTime(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 64) throw new Error('provider_mismatch');
  const parts = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt]([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!parts || Number(parts[1]) === 0 || !Number.isFinite(Date.parse(value))
    || Number(parts[3]) > new Date(Date.UTC(Number(parts[1]), Number(parts[2]), 0)).getUTCDate()) throw new Error('provider_mismatch');
  return value;
}
export function verifyObservation(subscription: string, ticket: ReconciliationTicket, details: ProviderSubscription): Observation {
  if (ticket.identity_trusted !== true || !ticket.custom_id) throw new Error('identity_unverified');
  if (details.id !== subscription || details.plan_id !== ticket.provider_plan || !Object.hasOwn(providerStatuses, details.status ?? '')
    || (details.custom_id != null && details.custom_id !== ticket.custom_id)) throw new Error('provider_mismatch');
  const updated = providerTime(details.status_update_time);
  const start = providerTime(details.start_time);
  const end = providerTime(details.billing_info?.next_billing_time);
  if (start && end && Date.parse(end) <= Date.parse(start)) throw new Error('provider_mismatch');
  return { id: subscription, plan: details.plan_id!, status: details.status!, custom: details.custom_id ?? null,
    updated, start, end, verified: new Date().toISOString() };
}
export function createReconciler(deps: {
  begin(subscription: string): Promise<ReconciliationTicket>;
  details(subscription: string): Promise<ProviderSubscription>;
  finish(ticket: ReconciliationTicket, observation: Observation): Promise<string>;
  fail(ticket: ReconciliationTicket, reason: 'provider_mismatch' | 'provider_unavailable' | 'identity_unverified'): Promise<void>;
}) {
  return async (subscription: string) => {
    const ticket = await deps.begin(subscription);
    try {
      const observed = await deps.details(subscription);
      const verified = verifyObservation(subscription, ticket, observed);
      return await deps.finish(ticket, verified);
    } catch (error) {
      const reason = error instanceof Error && (error.message === 'provider_mismatch' || error.message === 'identity_unverified') ? error.message : 'provider_unavailable';
      await deps.fail(ticket, reason).catch(() => {});
      return reason === 'provider_unavailable' ? 'failed' : 'requires_review';
    }
  };
}
