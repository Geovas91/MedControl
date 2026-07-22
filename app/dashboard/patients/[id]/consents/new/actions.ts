"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getConsentFormValues } from "@/lib/clinical-record/consents";
import { createConsentForActiveTenant } from "@/lib/server/clinical-consents";

export async function createConsentAction(patientId: string, _state: Record<string, unknown>, formData: FormData) {
  const values = getConsentFormValues(formData);
  const result = await createConsentForActiveTenant(patientId, values);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "success") return { error: "error" in result ? result.error : "No tienes permiso para crear consentimientos.", errors: "errors" in result ? result.errors : undefined, values };
  revalidatePath(`/dashboard/patients/${result.patientId}`); revalidatePath(`/dashboard/patients/${result.patientId}/clinical-record`); revalidatePath(`/dashboard/patients/${result.patientId}/consents`); revalidatePath(`/dashboard/patients/${result.patientId}/consents/${result.consentId}`);
  redirect(`/dashboard/patients/${result.patientId}/consents/${result.consentId}?consent_created=1`);
}
