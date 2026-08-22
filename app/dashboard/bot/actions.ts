"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseAppointmentAssistantSettings } from "@/lib/appointment-assistant";
import { saveAppointmentAssistantSettingsForActiveTenant } from "@/lib/server/appointment-assistant";

export async function saveAppointmentAssistantSettingsAction(formData: FormData) {
  const input = parseAppointmentAssistantSettings(formData);
  if (!input) redirect("/dashboard/bot?settings_error=1");

  const result = await saveAppointmentAssistantSettingsForActiveTenant(input);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "success") redirect("/dashboard/bot?settings_error=1");

  revalidatePath("/dashboard/bot");
  redirect("/dashboard/bot?saved=1");
}
