"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { validateExceptionInput } from "@/lib/availability/exceptions";
export async function manageExceptionAction(_state: { state: string; error?: string }, formData: FormData) {
  const input = { type: String(formData.get("exception_type") ?? ""), startDate: String(formData.get("start_date") ?? ""), startTime: String(formData.get("start_time") ?? ""), endDate: String(formData.get("end_date") ?? ""), endTime: String(formData.get("end_time") ?? ""), allDay: formData.get("all_day") === "on", reason: String(formData.get("reason") ?? "") };
  if (formData.get("action") !== "deactivate") { const error = validateExceptionInput(input); if (error) return { state: "error", error }; }
  const context = await getActiveTenantContext(); if (context.state !== "ready") return { state: "error", error: "No fue posible validar la clínica activa." };
  const client = await createClient(); const result = await (client as unknown as { rpc: Function }).rpc("manage_professional_availability_exception", { p_action: String(formData.get("action") ?? "create"), p_exception_id: formData.get("exception_id") || null, p_clinic_id: context.tenant.clinic.id, p_clinic_member_id: String(formData.get("professional_id") ?? ""), p_exception_type: input.type, p_start_date: input.startDate || null, p_start_time: input.startTime || null, p_end_date: input.endDate || null, p_end_time: input.endTime || null, p_all_day: input.allDay, p_reason: input.reason || null });
  if (result.error) return { state: "error", error: "No fue posible guardar la excepción." }; revalidatePath("/dashboard/settings/availability"); return { state: "success" };
}

export async function deactivateExceptionAction(formData: FormData): Promise<void> {
  await manageExceptionAction({ state: "idle" }, formData);
}
