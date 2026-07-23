import "server-only";

import { getClinicSubscription } from "@/lib/supabase/subscriptions";
import type { ClinicSubscription, PlanId } from "@/types/subscriptions";

export type ClinicEntitlements = {
  planId: PlanId;
  subscription: ClinicSubscription | null;
  status: ClinicSubscription["status"];
  canUseClinicalWorkspace: boolean;
  canManageMembers: boolean;
  readOnlyReason: string | null;
};

export async function getClinicEntitlements(clinicId: string): Promise<ClinicEntitlements> {
  const { data: subscription } = await getClinicSubscription(clinicId);
  const status = subscription?.status ?? "inactive";
  const hasActiveAccess = status === "active" || status === "trialing";
  const isPastDue = status === "past_due";

  return {
    planId: subscription?.plan_id ?? "basic",
    subscription,
    status,
    canUseClinicalWorkspace: hasActiveAccess || isPastDue,
    canManageMembers: hasActiveAccess,
    readOnlyReason: hasActiveAccess
      ? null
      : isPastDue
        ? "La suscripción tiene un pago pendiente. El acceso clínico temporal continúa, pero la administración de miembros está bloqueada."
        : "La suscripción no está activa. Puedes consultar la información existente y revisar facturación, pero no crear registros nuevos."
  };
}

export function canCreateWithEntitlements(entitlements: ClinicEntitlements) {
  return entitlements.status === "active" || entitlements.status === "trialing";
}
