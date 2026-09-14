import "server-only";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
export type ProfessionalSlot = { start_at: string; end_at: string; local_start: string; local_end: string };
export async function getProfessionalAvailableSlots(input: { clinicMemberId: string; localDate: string; durationMinutes: number; slotIntervalMinutes: number; bufferBeforeMinutes?: number; bufferAfterMinutes?: number }) {
  const context = await getActiveTenantContext(); if (context.state !== "ready") return { state: context.state };
  const client = await createClient(); const result = await (client as unknown as { rpc: Function }).rpc("get_professional_available_slots", { p_clinic_id: context.tenant.clinic.id, p_clinic_member_id: input.clinicMemberId, p_local_date: input.localDate, p_duration_minutes: input.durationMinutes, p_slot_interval_minutes: input.slotIntervalMinutes, p_buffer_before_minutes: input.bufferBeforeMinutes ?? 0, p_buffer_after_minutes: input.bufferAfterMinutes ?? 0 });
  if (result.error) { logger.error("Professional slot lookup failed", { component: "professional_slots", operation: "get_available_slots", clinic_id: context.tenant.clinic.id, role: context.tenant.membership.role, error_code: result.error.code ?? "rpc_error" }); return { state: "error" as const }; }
  return { state: "ready" as const, data: (result.data ?? []) as ProfessionalSlot[] };
}
