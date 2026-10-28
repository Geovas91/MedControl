import "server-only";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanId } from "@/config/plans";
import { authorizeBillingActor, BillingError, billingCreationAvailability } from "./billing-policy";
import type { BillingIntent } from "./billing-policy";
import { createBillingHandlers } from "./billing-handlers";
import { createPaypalSubscription, getPaypalPlanId, getPaypalSubscriptionDetails } from "./server";

export async function requireBillingOwner() {
  const context = await getActiveTenantContext();
  if (context.state === "error") throw new BillingError(503, "billing_unavailable");
  return authorizeBillingActor({
    userId: context.user?.id, clinicId: context.tenant?.clinic.id,
    membershipClinicId: context.tenant?.membership.clinic_id, role: context.tenant?.membership.role,
    membershipStatus: context.tenant?.membership.status
  });
}

export async function billingRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createAdminClient().rpc(name, args);
  if (error) {
    if (error.code === "42501") throw new BillingError(403, "billing_operation_denied");
    if (error.code === "23505") {
      const code = ["billing_subscription_exists", "billing_intent_in_progress", "billing_creation_unknown", "billing_reconciliation_required"].includes(error.message)
        ? error.message : "billing_operation_conflict";
      throw new BillingError(409, code);
    }
    throw new Error("billing_database_failed");
  }
  return data as T;
}

export const billingHandlers = createBillingHandlers({
  authorize: requireBillingOwner,
  plan: (id) => isPlanId(id) ? getPaypalPlanId(id) : null,
  begin: (actor, plan, providerPlan) => billingRpc<BillingIntent>("begin_paypal_billing_intent", {
    p_clinic: actor.clinicId, p_user: actor.userId, p_plan: plan, p_provider_plan: providerPlan
  }),
  claim: (actor, intent) => billingRpc<boolean>("claim_paypal_billing_creation", {
    p_intent: intent.id, p_clinic: actor.clinicId, p_user: actor.userId
  }),
  create: createPaypalSubscription,
  bind: (intent, subscriptionId) => billingRpc("bind_paypal_billing_intent", { p_intent: intent.id, p_subscription: subscriptionId }),
  async find(id) {
    const { data, error } = await createAdminClient().from("paypal_billing_intents").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error("billing_database_failed");
    return data as BillingIntent | null;
  },
  details: getPaypalSubscriptionDetails,
  complete: (actor, intent, details) => billingRpc("complete_paypal_billing_intent", {
    p_intent: intent.id, p_clinic: actor.clinicId, p_user: actor.userId, p_plan: intent.plan_id,
    p_subscription: intent.provider_subscription_id, p_provider_plan: intent.provider_plan_id,
    p_status: details?.status === "ACTIVE" ? "active" : "inactive",
    p_start: details?.start_time ?? null, p_end: details?.billing_info?.next_billing_time ?? null
  })
});

/** No provider call or write; only safe availability metadata reaches the page. */
export async function getPaypalBillingCreationAvailability() {
  try {
    const actor = await requireBillingOwner();
    const client = createAdminClient();
    const [subscription, intents] = await Promise.all([
      client.from("clinic_subscriptions").select("status,provider_subscription_id").eq("clinic_id", actor.clinicId).maybeSingle(),
      client.from("paypal_billing_intents").select("status,plan_id,provider_subscription_id,expires_at,creation_dispatched_at").eq("clinic_id", actor.clinicId)
    ]);
    if (subscription.error || intents.error) throw new Error("billing_database_failed");
    return billingCreationAvailability(subscription.data, intents.data as unknown as BillingIntent[]);
  } catch {
    return { code: "billing_unavailable", resumePlan: null };
  }
}
