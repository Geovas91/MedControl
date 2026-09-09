import "server-only";
import { cookies } from "next/headers";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanId } from "@/config/plans";
import { authorizeBillingActor, BillingError } from "./billing-policy";
import type { BillingIntent } from "./billing-policy";
import { createBillingHandlers } from "./billing-handlers";
import { createPaypalSubscription, getPaypalPlanId, getPaypalSubscriptionDetails } from "./server";

export async function requireBillingOwner() {
  const context = await getActiveTenantContext();
  if (context.state === "error") throw new BillingError(503, "billing_unavailable");
  const selected = (await cookies()).get("clinicontrol_active_clinic")?.value;
  return authorizeBillingActor({
    userId: context.user?.id, clinicId: context.tenant?.clinic.id,
    membershipClinicId: context.tenant?.membership.clinic_id, role: context.tenant?.membership.role,
    membershipStatus: context.tenant?.membership.status, multiple: context.tenant?.hasMultipleActiveMemberships,
    selectedClinicId: selected
  });
}

export async function billingRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createAdminClient().rpc(name, args);
  if (error) {
    if (error.code === "42501") throw new BillingError(403, "billing_operation_denied");
    if (error.code === "23505") throw new BillingError(409, "billing_operation_conflict");
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
