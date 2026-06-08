import { NextResponse } from "next/server";
import { getPlanById, isPlanId } from "@/config/plans";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getPaypalPlanId, getPaypalSubscriptionDetails, mapPaypalSubscriptionStatus } from "@/lib/paypal/server";
import { upsertClinicPaypalSubscription } from "@/lib/supabase/subscriptions";

type ApprovePayload = {
  subscriptionId?: unknown;
  planId?: unknown;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function asCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let payload: ApprovePayload;

  try {
    payload = (await request.json()) as ApprovePayload;
  } catch {
    return jsonError("La solicitud de suscripción no tiene un formato válido.");
  }

  const subscriptionId = asCleanString(payload.subscriptionId);
  const planId = asCleanString(payload.planId);

  if (!subscriptionId || !planId) {
    return jsonError("Faltan datos para registrar la suscripción.");
  }

  if (!isPlanId(planId)) {
    return jsonError("El plan seleccionado no existe.");
  }

  const onboardingStatus = await getOnboardingStatus();

  if (onboardingStatus.state === "unauthenticated") {
    return jsonError("Inicia sesión para registrar una suscripción.", 401);
  }

  if (onboardingStatus.state !== "complete") {
    return jsonError("Completa el onboarding de tu clínica antes de suscribirte.", 403);
  }

  const plan = getPlanById(planId);
  const expectedPaypalPlanId = getPaypalPlanId(planId);

  if (!plan || !expectedPaypalPlanId) {
    return jsonError("PayPal sandbox no está configurado para este plan.", 500);
  }

  try {
    const subscriptionDetails = await getPaypalSubscriptionDetails(subscriptionId);

    if (subscriptionDetails.id !== subscriptionId) {
      return jsonError("La suscripción aprobada no coincide con PayPal.");
    }

    if (subscriptionDetails.plan_id !== expectedPaypalPlanId) {
      return jsonError("El plan de PayPal no coincide con el plan seleccionado.");
    }

    const status = mapPaypalSubscriptionStatus(subscriptionDetails.status);
    const { error } = await upsertClinicPaypalSubscription({
      clinicId: onboardingStatus.membership.clinic_id,
      planId,
      status,
      providerSubscriptionId: subscriptionId,
      providerPlanId: expectedPaypalPlanId,
      currentPeriodStart: subscriptionDetails.start_time ?? null,
      currentPeriodEnd: subscriptionDetails.billing_info?.next_billing_time ?? null,
      cancelAtPeriodEnd: false
    });

    if (error) {
      return jsonError("No se pudo actualizar la suscripción de la clínica.", 500);
    }

    return NextResponse.json({
      message:
        status === "active"
          ? `Suscripción a ${plan.name} registrada correctamente.`
          : `Suscripción a ${plan.name} registrada y pendiente de confirmación por webhook.`
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "No se pudo validar la suscripción con PayPal.", 500);
  }
}
