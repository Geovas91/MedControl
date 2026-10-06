import "server-only";

import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canUseFeature, getClinicEntitlements, planIncludesFeature, type ClinicEntitlementsResult } from "@/lib/server/entitlements";

export type AssistantAccessState = "ready" | "upgrade_required" | "subscription_missing" | "subscription_read_only" | "forbidden" | "error";

export function resolveAssistantCommercialAccess(entitlements: ClinicEntitlementsResult): AssistantAccessState {
  if (entitlements.state === "missing") return "subscription_missing";
  if (entitlements.state === "error") return "error";
  if (!planIncludesFeature(entitlements, "appointment_assistant")) return "upgrade_required";
  return canUseFeature(entitlements, "appointment_assistant") ? "ready" : "subscription_read_only";
}

export function getAssistantAccessMessage(state: AssistantAccessState) {
  const messages: Record<AssistantAccessState, string> = {
    ready: "Appointment Assistant disponible.",
    upgrade_required: "Disponible en Plus y Pro. Revisa los planes para usar Appointment Assistant.",
    subscription_missing: "Sin plan configurado. Revisa facturación para configurar una suscripción.",
    subscription_read_only: "La suscripción permite sólo consulta histórica. Reactívala en facturación para usar Appointment Assistant.",
    forbidden: "No tienes permiso para usar Appointment Assistant en esta clínica.",
    error: "No fue posible verificar el acceso al asistente. Intenta nuevamente."
  };
  return messages[state];
}

/** New commercial work requires ready. History alone also permits subscription_read_only. */
export async function getAppointmentAssistantAccess() {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state === "error" ? "error" as const : "forbidden" as const, context, entitlements: null };
  if (!["owner", "admin", "doctor", "assistant"].includes(context.tenant.membership.role)) {
    return { state: "forbidden" as const, context, entitlements: null };
  }
  const entitlements = await getClinicEntitlements(context.tenant.clinic.id);
  return { state: resolveAssistantCommercialAccess(entitlements), context, entitlements };
}
