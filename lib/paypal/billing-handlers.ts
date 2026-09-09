import { BillingError, validateBillingIntent, validateProviderApproval } from "./billing-policy.ts";
import type { BillingActor, BillingIntent, ProviderSubscription } from "./billing-policy.ts";

type Dependencies = {
  authorize(): Promise<BillingActor>;
  plan(id: string): string | null;
  begin(actor: BillingActor, plan: string, providerPlan: string): Promise<BillingIntent>;
  create(intent: BillingIntent): Promise<ProviderSubscription>;
  bind(intent: BillingIntent, subscriptionId: string): Promise<void>;
  find(id: string): Promise<BillingIntent | null>;
  details(id: string): Promise<ProviderSubscription>;
  complete(actor: BillingActor, intent: BillingIntent, details: ProviderSubscription | null): Promise<void>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const subscriptionIdPattern = /^I-[A-Z0-9]{6,64}$/;

function failure(error: unknown) {
  return Response.json({ error: "No se pudo completar la operación de facturación.", code: error instanceof BillingError ? error.message : "billing_unavailable" },
    { status: error instanceof BillingError ? error.status : 503 });
}
async function payload(request: Request): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new BillingError(400, "invalid_request"); }
}

export function createBillingHandlers(deps: Dependencies) {
  return {
    async initiate(request: Request) {
      try {
        const actor = await deps.authorize();
        const input = await payload(request);
        const plan = typeof input.planId === "string" ? input.planId : "";
        const providerPlan = deps.plan(plan);
        if (!providerPlan) throw new BillingError(400, "invalid_plan");
        const intent = await deps.begin(actor, plan, providerPlan);
        if (!intent.provider_subscription_id) {
          const details = await deps.create(intent);
          if (!subscriptionIdPattern.test(details.id) || details.plan_id !== intent.provider_plan_id || details.custom_id !== intent.id) {
            throw new BillingError(503, "provider_subscription_mismatch");
          }
          await deps.bind(intent, details.id);
          intent.provider_subscription_id = details.id;
        }
        return Response.json({ intentId: intent.id, subscriptionId: intent.provider_subscription_id });
      } catch (error) { return failure(error); }
    },
    async approve(request: Request) {
      try {
        const actor = await deps.authorize();
        const input = await payload(request);
        if (typeof input.intentId !== "string" || !uuid.test(input.intentId)
          || typeof input.subscriptionId !== "string" || !subscriptionIdPattern.test(input.subscriptionId)
          || typeof input.planId !== "string") throw new BillingError(400, "invalid_request");
        const intent = validateBillingIntent(await deps.find(input.intentId), actor, {
          intentId: input.intentId, planId: input.planId, subscriptionId: input.subscriptionId
        });
        // A consumed intent must never reapply a stale status after a webhook cancellation.
        const details = intent.status === "completed" ? null : await deps.details(input.subscriptionId);
        if (details) validateProviderApproval(intent, details);
        await deps.complete(actor, intent, details);
        return Response.json({ message: "Suscripción registrada correctamente." });
      } catch (error) { return failure(error); }
    }
  };
}
