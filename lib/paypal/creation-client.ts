import { BillingError, billingErrorMessage } from "./billing-policy.ts";

/** One browser document only. SQL is the cross-tab/process authority. */
export function createBillingSubmissionClient(request: typeof fetch) {
  let pending: { plan: string; promise: Promise<{ intentId: string; subscriptionId: string }> } | null = null;
  return (plan: string) => {
    if (pending) return pending.plan === plan ? pending.promise : Promise.reject(new BillingError(409, "billing_intent_in_progress"));
    const promise = (async () => {
      const response = await request("/api/paypal/subscription/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan })
      });
      const result = await response.json() as { intentId?: string; subscriptionId?: string; code?: string };
      if (!response.ok) throw new BillingError(response.status, result.code ?? "billing_unavailable");
      if (!result.intentId || !result.subscriptionId) throw new Error(billingErrorMessage("billing_unavailable"));
      return { intentId: result.intentId, subscriptionId: result.subscriptionId };
    })();
    const tracked = promise.finally(() => { pending = null; });
    pending = { plan, promise: tracked };
    return tracked;
  };
}
