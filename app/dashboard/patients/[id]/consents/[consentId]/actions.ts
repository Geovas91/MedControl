"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { cancelConsentForActiveTenant, createConsentSigningLink, revokeConsentSigningLink } from "@/lib/server/clinical-consents";

export async function generateConsentSigningLinkAction(patientId: string, consentId: string, _state: { error?: string }, _formData: FormData) {
  const result = await createConsentSigningLink(patientId, consentId);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "success") return { error: "No fue posible generar el enlace de firma." };
  revalidatePath(`/dashboard/patients/${patientId}/consents/${consentId}`);
  return { url: result.url, expiresAt: result.expiresAt };
}

export async function revokeConsentSigningLinkAction(patientId: string, consentId: string) {
  const result = await revokeConsentSigningLink(patientId, consentId);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "success") return;
  revalidatePath(`/dashboard/patients/${patientId}/consents/${consentId}`);
  redirect(`/dashboard/patients/${patientId}/consents/${consentId}?signing_link_revoked=1`);
}

export async function cancelConsentAction(patientId: string, consentId: string, formData: FormData) {
  const result = await cancelConsentForActiveTenant(patientId, consentId, String(formData.get("cancellation_reason") ?? ""));
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state !== "success") redirect(`/dashboard/patients/${patientId}/consents/${consentId}?cancellation_error=1`);
  revalidatePath(`/dashboard/patients/${patientId}/clinical-record`);
  revalidatePath(`/dashboard/patients/${patientId}/consents`);
  revalidatePath(`/dashboard/patients/${patientId}/consents/${consentId}`);
  redirect(`/dashboard/patients/${patientId}/consents/${consentId}?consent_cancelled=1`);
}
