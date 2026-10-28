import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingRpc, requireBillingOwner } from './billing-server';
import { getPaypalSubscriptionDetails } from './server';
import { createReconciler, verifyObservation, type ReconciliationTicket } from './reconciliation';

export function reconcileWebhook(event: string, token: string, subscription: string) {
  return run(subscription, { p_event: event, p_token: token });
}
function run(subscription: string, authorization: Record<string, unknown>) {
  return createReconciler({
    async begin(id) {
      const ticket = await billingRpc<ReconciliationTicket & { state: string }>('begin_paypal_reconciliation', { p_subscription: id, ...authorization });
      if (ticket.state !== 'claimed') throw new Error('reconciliation_review_required');
      return ticket;
    },
    details: getPaypalSubscriptionDetails,
    finish: (ticket, observed) => billingRpc<string>('finish_paypal_reconciliation', {
      p_id: ticket.id, p_generation: ticket.generation, p_subscription: observed.id, p_plan: observed.plan,
      p_status: observed.status, p_custom: observed.custom, p_updated: observed.updated, p_verified: observed.verified
    }),
    fail: (ticket, reason) => billingRpc('fail_paypal_reconciliation', { p_id: ticket.id, p_generation: ticket.generation, p_reason: reason })
  })(subscription);
}

// No HTTP endpoint, scheduler, creation or cancellation transport is installed.
// Read-only inspection never claims a generation or changes a journal.
export async function reconcileCurrentClinicSubscription(mode: 'inspect' | 'apply') {
  try {
    const actor = await requireBillingOwner();
    const client = createAdminClient();
    const { data, error } = await client.from('clinic_subscriptions')
      .select('provider_subscription_id,provider_plan_id,billing_provider').eq('clinic_id', actor.clinicId).maybeSingle();
    if (error || !data?.provider_subscription_id || data.billing_provider !== 'paypal') return { state: 'requires_review' };
    if (mode === 'inspect') {
      const { data: intent, error: intentError } = await client.from('paypal_billing_intents').select('id')
        .eq('clinic_id', actor.clinicId).eq('provider_subscription_id', data.provider_subscription_id).maybeSingle();
      if (intentError) return { state: 'requires_review' };
      verifyObservation(data.provider_subscription_id, { id: '', generation: 0, provider_plan: data.provider_plan_id!, custom_id: intent?.id ?? null },
        await getPaypalSubscriptionDetails(data.provider_subscription_id));
      return { state: 'verified', applied: false };
    }
    if (mode !== 'apply') return { state: 'requires_review' };
    const outcome = await run(data.provider_subscription_id, { p_clinic: actor.clinicId, p_actor: actor.userId });
    return { state: outcome === 'processed' ? 'applied' : 'requires_review' };
  } catch { return { state: 'requires_review' }; }
}
