import type { ProviderSubscription } from "./billing-policy.ts";
import { subscriptionIdPattern } from "./billing-handlers.ts";

export type WebhookEvent = { id?: string; event_type?: string; resource?: {
  id?: string; subscription_id?: string; billing_agreement_id?: string;
} };
type Claim = { state: "processed" | "busy" | "claimed"; token?: string };
type Dependencies = {
  verify(request: Request, event: WebhookEvent): Promise<boolean>;
  claim(event: string, type: string, subscription: string | null): Promise<Claim>;
  details(subscription: string): Promise<ProviderSubscription>;
  finish(event: string, token: string, status: string | null, details: ProviderSubscription | null): Promise<string>;
  fail(event: string, token: string): Promise<void>;
};
const supportedEvents = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.COMPLETED", "PAYMENT.SALE.DENIED"
]);
const statuses: Record<string, string> = { ACTIVE: "active", APPROVED: "inactive", APPROVAL_PENDING: "inactive", SUSPENDED: "past_due", CANCELLED: "cancelled", EXPIRED: "cancelled" };
const reply = (status: number, message: string) => Response.json({ message }, { status });

export function createPaypalWebhookHandler(deps: Dependencies) {
  return async (request: Request) => {
    let event: WebhookEvent;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply(400, "Invalid webhook.");
      event = parsed as WebhookEvent;
    } catch { return reply(400, "Invalid webhook."); }
    try {
      if (!await deps.verify(request, event)) return reply(400, "Invalid signature.");
    } catch { return reply(503, "Signature verification unavailable."); }
    if (typeof event.id !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(event.id)
      || typeof event.event_type !== "string" || !/^[A-Z0-9_.]{1,128}$/.test(event.event_type)) return reply(400, "Invalid event metadata.");
    const rawId = event.event_type.startsWith("PAYMENT.")
      ? event.resource?.subscription_id ?? event.resource?.billing_agreement_id
      : event.resource?.id ?? event.resource?.subscription_id ?? event.resource?.billing_agreement_id;
    const subscription = typeof rawId === "string" && subscriptionIdPattern.test(rawId) ? rawId : null;
    let token: string | undefined;
    try {
      const claim = await deps.claim(event.id, event.event_type, subscription);
      if (claim.state === "processed") return reply(200, "Webhook already processed.");
      if (claim.state === "busy") return reply(503, "Webhook processing in progress.");
      token = claim.token;
      if (!token) throw new Error("lease_missing");
      let details: ProviderSubscription | null = null;
      let status: string | null = null;
      if (supportedEvents.has(event.event_type)) {
        if (!subscription) throw new Error("subscription_missing");
        // Use authoritative current state instead of replaying a stale activation/cancellation.
        details = await deps.details(subscription);
        status = statuses[details.status ?? ""] ?? null;
        if (details.id !== subscription || !details.plan_id || !status) throw new Error("provider_mismatch");
        if (status === "active" && ["PAYMENT.SALE.DENIED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED"].includes(event.event_type)) status = "past_due";
      }
      const result = await deps.finish(event.id, token, status, details);
      return result === "processed" ? reply(200, "Webhook processed.") : reply(503, "Webhook processing failed.");
    } catch {
      if (token) {
        try { await deps.fail(event.id, token); } catch { /* Expired leases remain recoverable during database outages. */ }
      }
      return reply(503, "Webhook processing failed.");
    }
  };
}
