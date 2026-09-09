import { billingRpc } from "@/lib/paypal/billing-server";
import { getPaypalSubscriptionDetails, verifyPaypalWebhookSignature } from "@/lib/paypal/server";
import { createPaypalWebhookHandler } from "@/lib/paypal/webhook-handler";

export const POST = createPaypalWebhookHandler({
  verify: (request, event) => verifyPaypalWebhookSignature({
    authAlgo: request.headers.get("paypal-auth-algo"), certUrl: request.headers.get("paypal-cert-url"),
    transmissionId: request.headers.get("paypal-transmission-id"), transmissionSig: request.headers.get("paypal-transmission-sig"),
    transmissionTime: request.headers.get("paypal-transmission-time")
  }, event),
  claim: (event, type, subscription) => billingRpc("claim_paypal_webhook", { p_event: event, p_type: type, p_subscription: subscription }),
  details: getPaypalSubscriptionDetails,
  finish: (event, token, status, details) => billingRpc("finish_paypal_webhook", {
    p_event: event, p_token: token, p_status: status, p_provider_plan: details?.plan_id ?? null,
    p_start: details?.start_time ?? null, p_end: details?.billing_info?.next_billing_time ?? null
  }),
  fail: (event, token) => billingRpc("fail_paypal_webhook", { p_event: event, p_token: token })
});
