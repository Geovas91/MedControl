"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensurePersonalClinicForCurrentUser } from "@/lib/onboarding";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function encodedParam(name: "error", value: string) {
  return `${name}=${encodeURIComponent(value)}`;
}

export async function completeOnboardingAction(formData: FormData) {
  const clinicName = asString(formData.get("clinic_name"));

  if (!clinicName) {
    redirect(`/onboarding?${encodedParam("error", "Escribe el nombre de tu clínica o consultorio.")}`);
  }

  const { error } = await ensurePersonalClinicForCurrentUser(clinicName);

  if (error) {
    redirect(`/onboarding?${encodedParam("error", error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
