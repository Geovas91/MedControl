import { BillingError, billingErrorMessage, validateBillingIntent, validateProviderApproval } from "./billing-policy.ts";
import type { BillingActor, BillingIntent, ProviderSubscription } from "./billing-policy.ts";

type Dependencies = {
  authorize(): Promise<BillingActor>;
  plan(id: string): string | null;
  begin(actor: BillingActor, plan: string, providerPlan: string): Promise<BillingIntent>;
  claim(actor: BillingActor, intent: BillingIntent): Promise<boolean>;
  create(intent: BillingIntent, claim: () => Promise<void>): Promise<ProviderSubscription>;
  bind(intent: BillingIntent, subscriptionId: string): Promise<void>;
  find(id: string): Promise<BillingIntent | null>;
  details(id: string): Promise<ProviderSubscription>;
  complete(actor: BillingActor, intent: BillingIntent, details: ProviderSubscription | null): Promise<void>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const subscriptionIdPattern = /^I-[A-Z0-9]{6,64}$/;

function failure(error: unknown) {
  const code = error instanceof BillingError ? error.message : "billing_unavailable";
  return Response.json({ error: billingErrorMessage(code), code },
    { status: error instanceof BillingError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
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
        // Missing migration/state must fail closed, never fall back to the old creator.
        if (!Object.hasOwn(intent, "creation_dispatched_at")) throw new BillingError(503, "billing_unavailable");
        if (intent.user_id !== actor.userId || intent.clinic_id !== actor.clinicId || intent.plan_id !== plan || intent.provider_plan_id !== providerPlan) throw new BillingError(403, "invalid_billing_intent");
        if (!intent.provider_subscription_id && intent.creation_dispatched_at) throw new BillingError(409, "billing_creation_unknown");
        const requireUnexpired = () => {
          if (!(Date.parse(intent.expires_at) > Date.now())) throw new BillingError(409, "billing_reconciliation_required");
        };
        requireUnexpired();
        if (!intent.provider_subscription_id) {
          const created = await deps.create(intent, async () => {
            if (await deps.claim(actor, intent) !== true) throw new BillingError(409, "billing_creation_unknown");
          });
          if (!subscriptionIdPattern.test(created.id)) {
            throw new BillingError(503, "provider_subscription_mismatch");
          }
          // Persist the ID before a subsequent provider GET can fail.
          await deps.bind(intent, created.id);
          intent.provider_subscription_id = created.id;
        }
        const details = await deps.details(intent.provider_subscription_id);
        if (details.id !== intent.provider_subscription_id || details.plan_id !== intent.provider_plan_id || details.custom_id !== intent.id) throw new BillingError(409, "provider_subscription_mismatch");
        if (["ACTIVE", "APPROVED"].includes(details.status ?? "")) throw new BillingError(409, "billing_subscription_exists");
        if (details.status !== "APPROVAL_PENDING") throw new BillingError(409, "billing_reconciliation_required");
        requireUnexpired();
        return Response.json({ intentId: intent.id, subscriptionId: intent.provider_subscription_id }, { headers: { "Cache-Control": "no-store" } });
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
