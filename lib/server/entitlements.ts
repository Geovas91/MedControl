import "server-only";

import { logger } from "@/lib/logger";
import { getClinicSubscription } from "@/lib/supabase/subscriptions";
import type { ClinicSubscription, PlanId } from "@/types/subscriptions";

export type ClinicEntitlements = {
  planId: PlanId;
  subscription: ClinicSubscription;
  status: ClinicSubscription["status"];
  canUseClinicalWorkspace: boolean;
  canManageMembers: boolean;
  readOnlyReason: string | null;
};

export type ClinicEntitlementsResult =
  | { state: "ready"; entitlements: ClinicEntitlements }
  | { state: "missing"; message: string }
  | { state: "error"; message: string };

export async function getClinicEntitlements(clinicId: string): Promise<ClinicEntitlementsResult> {
  const { data: subscription, error } = await getClinicSubscription(clinicId);

  if (error) {
    logger.error("Clinic entitlement subscription query failed", {
      component: "entitlements",
      status: "subscription_query_error",
      code: error.code
    });
    return { state: "error", message: "No fue posible verificar el acceso de la suscripción. Intenta nuevamente." };
  }

  if (!subscription) {
    return { state: "missing", message: "Esta clínica todavía no tiene una suscripción configurada. Revisa facturación." };
  }

  const hasActiveAccess = subscription.status === "active" || subscription.status === "trialing";
  const isPastDue = subscription.status === "past_due";
  return {
    state: "ready",
    entitlements: {
      planId: subscription.plan_id,
      subscription,
      status: subscription.status,
      canUseClinicalWorkspace: hasActiveAccess || isPastDue,
      canManageMembers: hasActiveAccess,
      readOnlyReason: hasActiveAccess
        ? null
        : isPastDue
          ? "La suscripción tiene un pago pendiente. El acceso clínico temporal continúa, pero las operaciones nuevas están bloqueadas."
          : "La suscripción no está activa. Puedes consultar la información existente y revisar facturación, pero no crear registros nuevos."
    }
  };
}

export function canCreateWithEntitlements(result: ClinicEntitlementsResult) {
  return result.state === "ready" && (result.entitlements.status === "active" || result.entitlements.status === "trialing");
}

export function getEntitlementNotice(result: ClinicEntitlementsResult) {
  return result.state === "ready" ? result.entitlements.readOnlyReason : result.message;
}
