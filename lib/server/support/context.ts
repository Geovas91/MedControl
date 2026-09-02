import "server-only";

import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getClinicEntitlements } from "@/lib/server/entitlements";
import type { SupportContext } from "@/lib/support/types";

export type SupportContextResult =
  | { state: "ready"; context: SupportContext }
  | { state: "unauthenticated" | "no_active_membership" | "forbidden" | "error"; context: null };

export async function getSupportContext(): Promise<SupportContextResult> {
  const active = await getActiveTenantContext();
  if (active.state !== "ready") return { state: active.state, context: null };
  const entitlementResult = await getClinicEntitlements(active.tenant.clinic.id);
  if (entitlementResult.state !== "ready") return { state: "error", context: null };
  if (!entitlementResult.entitlements.plan.features.service_bot_tier1) return { state: "forbidden", context: null };
  return {
    state: "ready",
    context: {
      userId: active.user.id,
      clinicId: active.tenant.clinic.id,
      role: active.tenant.membership.role,
      planId: entitlementResult.entitlements.planId,
      effectiveSubscriptionStatus: entitlementResult.entitlements.effectiveStatus,
      entitlements: {
        service_bot_tier1: entitlementResult.entitlements.plan.features.service_bot_tier1,
        google_calendar: entitlementResult.entitlements.plan.features.google_calendar,
        whatsapp_notifications: entitlementResult.entitlements.plan.features.whatsapp_notifications
      }
    }
  };
}
