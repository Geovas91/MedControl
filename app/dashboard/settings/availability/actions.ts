"use server";
import { revalidatePath } from "next/cache";
import { saveProfessionalAvailability } from "@/lib/server/professional-availability";
import { validateAvailabilityWeek, type AvailabilityWeek } from "@/lib/availability/form";
export async function saveAvailabilityAction(_state: { state: string; error?: string }, formData: FormData) {
  let week: AvailabilityWeek; try { week = JSON.parse(String(formData.get("intervals") ?? "{}")); } catch { return { state: "error", error: "El horario no tiene un formato válido." }; }
  const validation = validateAvailabilityWeek(week); if (validation) return { state: "error", error: validation };
  const result = await saveProfessionalAvailability({ professionalId: String(formData.get("professional_id") ?? ""), effectiveFrom: String(formData.get("effective_from") ?? ""), week });
  if (result.state !== "success") return { state: "error", error: "No fue posible guardar el horario." };
  revalidatePath("/dashboard/settings/availability"); return { state: "success" };
}
