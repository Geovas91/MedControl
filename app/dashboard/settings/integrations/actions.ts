"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { disconnectOwnGoogleCalendarIntegration } from "@/lib/server/google-calendar-integration";

export async function disconnectGoogleCalendarAction() {
  const result = await disconnectOwnGoogleCalendarIntegration();
  if (result.state === "unauthenticated") redirect("/login");
  revalidatePath("/dashboard/settings/integrations");
  redirect(`/dashboard/settings/integrations?google=${result.state === "success" ? "disconnected" : "error"}`);
}
