import "server-only";

import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";

export async function canAccessClinicalPatientForActiveTenant(patientId: string) {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state as "unauthenticated" | "no_active_membership" | "error", allowed: false };

  const result = await (await createClient()).rpc(
    "has_patient_professional_scope" as never,
    { p_clinic_id: context.tenant.clinic.id, p_patient_id: patientId } as never
  ) as unknown as { data: boolean | null; error: { code?: string } | null };

  if (result.error) return { state: "error" as const, allowed: false };
  return { state: "ready" as const, allowed: result.data === true, context };
}
