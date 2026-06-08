import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPaypalSubscriptionIdFromWebhook,
  mapPaypalWebhookEventStatus,
  type PaypalWebhookEvent,
  verifyPaypalWebhookSignature
} from "@/lib/paypal/server";
import { updatePaypalSubscriptionStatusFromProviderId } from "@/lib/supabase/subscriptions";
import type { Database } from "@/types/database";

type PaypalWebhookEventInsert = Database["public"]["Tables"]["paypal_webhook_events"]["Insert"];
type PaypalWebhookEventUpdate = Database["public"]["Tables"]["paypal_webhook_events"]["Update"];
type PaypalWebhookEventsAdminClient = {
  from(table: "paypal_webhook_events"): {
    insert(values: PaypalWebhookEventInsert): Promise<{ error: PostgrestError | null }>;
    update(values: PaypalWebhookEventUpdate): {
      eq(column: "event_id", value: string): Promise<{ error: PostgrestError | null }>;
    };
  };
};

function jsonResponse(message: string, status = 200) {
  return NextResponse.json({ message }, { status });
}

async function markWebhookEvent(
  eventId: string,
  processingStatus: "processed" | "ignored" | "failed",
  providerSubscriptionId?: string | null
) {
  const supabase = createAdminClient() as unknown as PaypalWebhookEventsAdminClient;

  await supabase
    .from("paypal_webhook_events")
    .update({
      processing_status: processingStatus,
      provider_subscription_id: providerSubscriptionId ?? null,
      processed_at: new Date().toISOString()
    })
    .eq("event_id", eventId);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: PaypalWebhookEvent;

  try {
    event = JSON.parse(rawBody) as PaypalWebhookEvent;
  } catch {
    return jsonResponse("Invalid webhook payload.", 400);
  }

  const verified = await verifyPaypalWebhookSignature(
    {
      authAlgo: request.headers.get("paypal-auth-algo"),
      certUrl: request.headers.get("paypal-cert-url"),
      transmissionId: request.headers.get("paypal-transmission-id"),
      transmissionSig: request.headers.get("paypal-transmission-sig"),
      transmissionTime: request.headers.get("paypal-transmission-time")
    },
    event
  );

  if (!verified) {
    return jsonResponse("Webhook signature verification failed.", 400);
  }

  if (!event.id || !event.event_type) {
    return jsonResponse("Verified webhook missing event metadata.", 400);
  }

  const supabase = createAdminClient() as unknown as PaypalWebhookEventsAdminClient;
  const providerSubscriptionId = getPaypalSubscriptionIdFromWebhook(event);
  const { error: insertError } = await supabase.from("paypal_webhook_events").insert({
    event_id: event.id,
    event_type: event.event_type,
    provider_subscription_id: providerSubscriptionId,
    processing_status: "processed"
  });

  if (insertError?.code === "23505") {
    return jsonResponse("Duplicate webhook ignored.");
  }

  if (insertError) {
    return jsonResponse("Webhook could not be tracked.", 500);
  }

  const status = mapPaypalWebhookEventStatus(event.event_type, event.resource?.status);

  if (!providerSubscriptionId || !status) {
    await markWebhookEvent(event.id, "ignored", providerSubscriptionId);
    return jsonResponse("Verified webhook ignored.");
  }

  const { data: updatedSubscription, error } = await updatePaypalSubscriptionStatusFromProviderId({
    providerSubscriptionId,
    status,
    providerPlanId: event.resource?.plan_id ?? null,
    currentPeriodStart: event.resource?.start_time,
    currentPeriodEnd: event.resource?.billing_info?.next_billing_time,
    cancelAtPeriodEnd: status === "cancelled"
  });

  if (error) {
    await markWebhookEvent(event.id, "failed", providerSubscriptionId);
    return jsonResponse("Webhook could not update subscription.", 500);
  }

  if (!updatedSubscription) {
    await markWebhookEvent(event.id, "ignored", providerSubscriptionId);
    return jsonResponse("Verified webhook ignored because no local subscription matched.");
  }

  await markWebhookEvent(event.id, "processed", providerSubscriptionId);

  return jsonResponse("Webhook processed.");
}
