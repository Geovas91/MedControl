import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingRpc, requireBillingOwner } from './billing-server';
import { getPaypalSubscriptionDetails } from './server';
import { verifyObservation } from './reconciliation';
import { createRpcReconciler } from './reconciliation-rpc';

export function reconcileWebhook(event: string, token: string, subscription: string) {
  return run(subscription, { p_event: event, p_token: token });
}
function run(subscription: string, authorization: Record<string, unknown>) {
  return createRpcReconciler(billingRpc, getPaypalSubscriptionDetails, authorization)(subscription);
}

// No HTTP endpoint, scheduler, creation or cancellation transport is installed.
// Read-only inspection never claims a generation or changes a journal.
export async function reconcileCurrentClinicSubscription(mode: 'inspect' | 'apply') {
  try {
    const actor = await requireBillingOwner();
    const client = createAdminClient();
    const { data, error } = await client.from('clinic_subscriptions')
      .select('provider_subscription_id,provider_plan_id,billing_provider,plan_id').eq('clinic_id', actor.clinicId).maybeSingle();
    if (error || !data?.provider_subscription_id || data.billing_provider !== 'paypal') return { state: 'requires_review' };
    if (mode === 'inspect') {
      const { data: intent, error: intentError } = await client.from('paypal_billing_intents').select('id')
        .eq('clinic_id', actor.clinicId).eq('provider_subscription_id', data.provider_subscription_id)
        .eq('provider_plan_id', data.provider_plan_id).eq('plan_id', data.plan_id).eq('status', 'completed')
        .not('completed_at', 'is', null).not('creation_dispatched_at', 'is', null).maybeSingle();
      if (intentError || !intent) return { state: 'requires_review' };
      verifyObservation(data.provider_subscription_id, { id: '', generation: 0, provider_plan: data.provider_plan_id!, custom_id: intent.id, identity_trusted: true },
        await getPaypalSubscriptionDetails(data.provider_subscription_id));
      return { state: 'verified', applied: false };
    }
    if (mode !== 'apply') return { state: 'requires_review' };
    const outcome = await run(data.provider_subscription_id, { p_clinic: actor.clinicId, p_actor: actor.userId });
    return { state: outcome === 'processed' ? 'applied' : 'requires_review' };
  } catch { return { state: 'requires_review' }; }
}
