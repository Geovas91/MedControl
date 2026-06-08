import "server-only";

import { paypalPlanEnvKeysByPlan, type CommercialPlan } from "@/config/plans";
import type { PlanId, SubscriptionStatus } from "@/types/subscriptions";

type PaypalEnvironment = "sandbox" | "live";

type PaypalAccessTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type PaypalVerifyWebhookResponse = {
  verification_status?: "SUCCESS" | "FAILURE";
};

type PaypalSubscriptionDetails = {
  id: string;
  status?: string;
  plan_id?: string;
  start_time?: string;
  billing_info?: {
    next_billing_time?: string;
  };
};

export type PaypalWebhookHeaders = {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
};

export type PaypalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    plan_id?: string;
    billing_agreement_id?: string;
    subscription_id?: string;
    start_time?: string;
    billing_info?: {
      next_billing_time?: string;
    };
  };
};

export function getPaypalEnvironment(): PaypalEnvironment {
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

export function getPaypalBaseUrl() {
  return getPaypalEnvironment() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function getPaypalPlanId(planId: PlanId) {
  return process.env[paypalPlanEnvKeysByPlan[planId]]?.trim() || null;
}

export function getPaypalPlanIdForPlan(plan: CommercialPlan) {
  return process.env[plan.billing.paypalPlanEnvKey]?.trim() || null;
}

export function hasPaypalPublicConfig() {
  return Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim());
}

function getPaypalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing server-only PayPal credentials: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }

  return { clientId, clientSecret };
}

export async function getPaypalAccessToken() {
  const { clientId, clientSecret } = getPaypalCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("No se pudo obtener un token seguro de PayPal.");
  }

  const data = (await response.json()) as PaypalAccessTokenResponse;

  if (!data.access_token) {
    throw new Error("PayPal no devolvió un access token válido.");
  }

  return data.access_token;
}

export async function getPaypalSubscriptionDetails(subscriptionId: string) {
  const accessToken = await getPaypalAccessToken();
  const response = await fetch(`${getPaypalBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("No se pudo validar la suscripción con PayPal.");
  }

  return (await response.json()) as PaypalSubscriptionDetails;
}

export async function verifyPaypalWebhookSignature(headers: PaypalWebhookHeaders, webhookEvent: PaypalWebhookEvent) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();

  if (!webhookId) {
    throw new Error("Missing server-only PayPal environment variable: PAYPAL_WEBHOOK_ID.");
  }

  if (
    !headers.authAlgo ||
    !headers.certUrl ||
    !headers.transmissionId ||
    !headers.transmissionSig ||
    !headers.transmissionTime
  ) {
    return false;
  }

  const accessToken = await getPaypalAccessToken();
  const response = await fetch(`${getPaypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as PaypalVerifyWebhookResponse;

  return data.verification_status === "SUCCESS";
}

export function mapPaypalSubscriptionStatus(status: string | undefined): SubscriptionStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "APPROVAL_PENDING":
      return "trialing";
    case "SUSPENDED":
      return "past_due";
    case "CANCELLED":
    case "EXPIRED":
      return "cancelled";
    default:
      return "inactive";
  }
}

export function mapPaypalWebhookEventStatus(eventType: string, resourceStatus?: string): SubscriptionStatus | null {
  switch (eventType) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
      return "active";
    case "BILLING.SUBSCRIPTION.CANCELLED":
    case "BILLING.SUBSCRIPTION.EXPIRED":
      return "cancelled";
    case "BILLING.SUBSCRIPTION.SUSPENDED":
      return "past_due";
    case "PAYMENT.SALE.COMPLETED":
      return "active";
    case "PAYMENT.SALE.DENIED":
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      return "past_due";
    default:
      return resourceStatus ? mapPaypalSubscriptionStatus(resourceStatus) : null;
  }
}

export function getPaypalSubscriptionIdFromWebhook(event: PaypalWebhookEvent) {
  if (event.event_type?.startsWith("PAYMENT.")) {
    return event.resource?.subscription_id ?? event.resource?.billing_agreement_id ?? null;
  }

  return event.resource?.id ?? event.resource?.subscription_id ?? event.resource?.billing_agreement_id ?? null;
}
