"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { cancelConsentForActiveTenant, createConsentSigningLink, getConsentFormValues, revokeConsentSigningLink, updatePendingConsentForActiveTenant } from "@/lib/server/clinical-consents";
import { generateConsentDocumentForActiveTenant } from "@/lib/server/consent-documents";
import { deliverConsentSigningEmail } from "@/lib/server/consent-email";
import { getConsentEmailActionOutcome } from "@/lib/consents/email";

export async function generateConsentSigningLinkAction(patientId: string, consentId: string, _state: { error?: string }, _formData: FormData) {
  const result = await createConsentSigningLink(patientId, consentId, String(_formData.get("expected_updated_at") ?? ""));
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "stale") return { error: "El consentimiento cambió. Recarga la página antes de generar el enlace." };
  if (result.state !== "success") return { error: "No fue posible generar el enlace de firma." };
  revalidatePath(`/dashboard/patients/${patientId}/consents/${consentId}`);
  return { url: result.url, expiresAt: result.expiresAt, updatedAt: result.updatedAt };
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

export type UpdateConsentState = {
  status?: "saved";
  error?: string;
  errors?: Record<string, string>;
  values?: { consentType: string; consentVersion: string; consentText: string };
  updatedAt?: string;
};

export async function updateConsentAction(patientId: string, consentId: string, _state: UpdateConsentState, formData: FormData): Promise<UpdateConsentState> {
  const values = getConsentFormValues(formData);
  const editableValues = { consentType: values.consentType, consentVersion: values.consentVersion, consentText: values.consentText };
  const result = await updatePendingConsentForActiveTenant(patientId, consentId, values, String(formData.get("expected_updated_at") ?? ""));
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "validation_error") return { error: result.error, errors: result.errors, values: editableValues };
  if (result.state === "active_link") return { error: "Revoca el enlace vigente antes de editar el consentimiento.", values: editableValues };
  if (result.state === "immutable") return { error: "El consentimiento ya no puede modificarse.", values: editableValues };
  if (result.state === "stale") return { error: "El consentimiento cambió en otra sesión. Recarga la página antes de guardar.", values: editableValues };
  if (result.state !== "success") return { error: "No fue posible guardar los cambios.", values: editableValues };
  revalidatePath(`/dashboard/patients/${patientId}/clinical-record`);
  revalidatePath(`/dashboard/patients/${patientId}/consents`);
  revalidatePath(`/dashboard/patients/${patientId}/consents/${consentId}`);
  return {
    status: "saved",
    values: {
      consentType: result.consent.consent_type,
      consentVersion: result.consent.consent_version,
      consentText: result.consent.consent_text
    },
    updatedAt: result.consent.updated_at
  };
}

export async function sendConsentEmailAction(patientId: string, consentId: string, _state: { error?: string; sentTo?: string }, formData: FormData) {
  const result = await deliverConsentSigningEmail({
    patientId,
    consentId,
    signingUrl: String(formData.get("signing_url") ?? "")
  });
  const outcome = getConsentEmailActionOutcome(result);
  if (outcome.kind === "not_found") notFound();
  if (outcome.kind === "redirect_login") redirect("/login");
  return outcome.state;
}

export async function generateConsentDocumentAction(patientId: string, consentId: string) {
  const result = await generateConsentDocumentForActiveTenant(patientId, consentId);
  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  revalidatePath(`/dashboard/patients/${patientId}/clinical-record`);
  revalidatePath(`/dashboard/patients/${patientId}/consents`);
  revalidatePath(`/dashboard/patients/${patientId}/consents/${consentId}`);
  if (result.state !== "ready") redirect(`/dashboard/patients/${patientId}/consents/${consentId}?pdf_error=1`);
  redirect(`/dashboard/patients/${patientId}/consents/${consentId}?pdf_ready=1`);
}
