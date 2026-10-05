import type { ClinicEntitlementsResult } from "@/lib/server/entitlements";

export type ConsentWriteState = "ready" | "subscription_missing" | "subscription_read_only" | "error";

export function getConsentWriteState(result: ClinicEntitlementsResult): ConsentWriteState {
  if (result.state === "missing") return "subscription_missing";
  if (result.state === "error") return "error";
  return result.entitlements.effectiveStatus === "active" || result.entitlements.effectiveStatus === "trialing"
    ? "ready" : "subscription_read_only";
}

export function getConsentAccessMessage(state: string) {
  if (state === "subscription_missing") return "Sin plan configurado. Revisa facturación para habilitar operaciones nuevas.";
  if (state === "subscription_read_only") return "La suscripción está en modo de solo lectura. Puedes consultar, revocar enlaces y cancelar consentimientos pendientes.";
  if (state === "forbidden") return "No tienes permiso clínico para este paciente.";
  return "No fue posible verificar o completar la operación. Intenta nuevamente.";
}
