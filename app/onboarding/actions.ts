"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { completeClinicOnboardingForCurrentUser } from "@/lib/onboarding";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function encodedParam(name: "error", value: string) {
  return `${name}=${encodeURIComponent(value)}`;
}

export async function completeOnboardingAction(formData: FormData) {
  const clinicName = asString(formData.get("clinic_name"));
  const ownerFullName = asString(formData.get("owner_full_name"));
  const planId = asString(formData.get("plan_id"));

  if (!clinicName || !ownerFullName || !["basic", "plus", "pro"].includes(planId)) {
    redirect(`/onboarding?${encodedParam("error", "Completa los campos requeridos del onboarding.")}`);
  }

  const { error } = await completeClinicOnboardingForCurrentUser({
    clinicName,
    legalName: asString(formData.get("legal_name")) || null,
    phone: asString(formData.get("phone")) || null,
    email: asString(formData.get("email")) || null,
    timezone: asString(formData.get("timezone")) || "America/Mexico_City",
    country: asString(formData.get("country")) || null,
    region: asString(formData.get("region")) || null,
    address: asString(formData.get("address")) || null,
    ownerFullName,
    planId: planId as "basic" | "plus" | "pro",
    acceptedTerms: formData.get("accepted_terms") === "on",
    acceptedPrivacy: formData.get("accepted_privacy") === "on",
    acceptedClinicalResponsibility: formData.get("accepted_clinical_responsibility") === "on"
  });

  if (error) {
    redirect(`/onboarding?${encodedParam("error", error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
