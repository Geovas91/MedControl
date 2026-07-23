import "server-only";

import { getConsentFormValues, validateConsentValues, type ConsentFormValues } from "@/lib/clinical-record/consents";
import { canCreateConsent, canViewClinicalRecord } from "@/lib/clinical-record/permissions";
import { getTemplateContent } from "@/lib/clinical-record/templates";
import { createSigningToken, hashSigningToken } from "@/lib/consents/signing";
import { logger } from "@/lib/logger";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canCreateWithEntitlements, getClinicEntitlements } from "@/lib/server/entitlements";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ConsentRow = Database["public"]["Tables"]["consents"]["Row"];
type SignatureRow = Database["public"]["Tables"]["consent_signatures"]["Row"];
type ConsentInsert = Database["public"]["Tables"]["consents"]["Insert"];
type TemplateOption = { id: string; name: string; description: string | null; template_schema: Database["public"]["Tables"]["medical_note_templates"]["Row"]["template_schema"]; is_system_template: boolean };
export type ConsentDetail = Pick<ConsentRow, "id" | "consent_type" | "consent_version" | "consent_text" | "status" | "expires_at" | "signed_at" | "revoked_at" | "created_at" | "template_id" | "signing_token_expires_at" | "signing_token_used_at" | "signing_token_revoked_at"> & { signatures: Pick<SignatureRow, "id" | "signer_full_name" | "signed_at" | "accepted_privacy_notice" | "accepted_sensitive_data_processing">[] };
type Result<T> = { state: "ready"; data: T } | { state: "invalid_id" | "unauthenticated" | "no_active_membership" | "forbidden" | "not_found" | "error"; data: null };

async function resolvePatient(patientId: string, canCreate = false): Promise<Result<{ context: Extract<Awaited<ReturnType<typeof getActiveTenantContext>>, { state: "ready" }>; supabase: Awaited<ReturnType<typeof createClient>>; patient: { id: string; full_name: string } }>> {
  if (!isValidPatientUuid(patientId)) return { state: "invalid_id", data: null };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };
  if (canCreate ? !canCreateConsent(context.tenant.membership.role) : !canViewClinicalRecord(context.tenant.membership.role)) return { state: "forbidden", data: null };
  const supabase = await createClient();
  const patientResult = await supabase.from("patients").select("id, full_name").eq("id", patientId).eq("clinic_id", context.tenant.clinic.id).maybeSingle();
  if (patientResult.error) { logger.error("Consent patient query failed", { component: "clinical_consents", operation: "patient", status: "query_error", code: patientResult.error.code }); return { state: "error", data: null }; }
  if (!patientResult.data) return { state: "not_found", data: null };
  return { state: "ready", data: { context, supabase, patient: patientResult.data } };
}

export async function getConsentForActiveTenant(patientId: string, consentId: string): Promise<Result<ConsentDetail & { timeZone: string }>> {
  if (!isValidPatientUuid(consentId)) return { state: "invalid_id", data: null };
  const resolved = await resolvePatient(patientId);
  if (resolved.state !== "ready") return resolved;
  const { context, supabase, patient } = resolved.data;
  const consentResult = await supabase.from("consents").select("id, consent_type, consent_version, consent_text, status, expires_at, signed_at, revoked_at, created_at, template_id, signing_token_expires_at, signing_token_used_at, signing_token_revoked_at").eq("id", consentId).eq("clinic_id", context.tenant.clinic.id).eq("patient_id", patient.id).maybeSingle();
  if (consentResult.error) { logger.error("Consent detail query failed", { component: "clinical_consents", operation: "detail", status: "query_error", code: consentResult.error.code }); return { state: "error", data: null }; }
  if (!consentResult.data) return { state: "not_found", data: null };
  const signaturesResult = await supabase.from("consent_signatures").select("id, signer_full_name, signed_at, accepted_privacy_notice, accepted_sensitive_data_processing").eq("consent_id", consentId).eq("patient_id", patient.id).order("signed_at", { ascending: false });
  if (signaturesResult.error) { logger.error("Consent signature query failed", { component: "clinical_consents", operation: "signatures", status: "query_error", code: signaturesResult.error.code }); return { state: "error", data: null }; }
  return { state: "ready", data: { ...(consentResult.data as Omit<ConsentDetail, "signatures">), signatures: (signaturesResult.data ?? []) as ConsentDetail["signatures"], timeZone: context.tenant.clinic.timezone } };
}

export async function getConsentTemplateOptions(patientId: string): Promise<Result<{ patient: { id: string; full_name: string }; templates: TemplateOption[] }>> {
  const resolved = await resolvePatient(patientId, true);
  if (resolved.state !== "ready") return resolved;
  if (!canCreateWithEntitlements(await getClinicEntitlements(resolved.data.context.tenant.clinic.id))) return { state: "forbidden", data: null };
  const result = await resolved.data.supabase.from("medical_note_templates").select("id, name, description, template_schema, is_system_template").or(`is_system_template.eq.true,clinic_id.eq.${resolved.data.context.tenant.clinic.id}`).eq("template_kind", "consent").eq("is_active", true).order("is_system_template", { ascending: false }).order("name", { ascending: true });
  if (result.error) { logger.error("Consent templates query failed", { component: "clinical_consents", operation: "template_options", status: "query_error", code: result.error.code }); return { state: "error", data: null }; }
  return { state: "ready", data: { patient: resolved.data.patient, templates: (result.data ?? []) as TemplateOption[] } };
}

export async function createConsentForActiveTenant(patientId: string, values: ConsentFormValues) {
  const resolved = await resolvePatient(patientId, true);
  if (resolved.state !== "ready") return resolved;
  const validation = validateConsentValues(values);
  if (!validation.valid) return { state: "validation_error" as const, error: "Revisa los campos marcados.", errors: validation.errors, values };
  const { context, supabase, patient } = resolved.data;
  if (!canCreateWithEntitlements(await getClinicEntitlements(context.tenant.clinic.id))) {
    return { state: "forbidden" as const, error: "La suscripción actual no permite crear consentimientos." };
  }
  let template: TemplateOption | null = null;
  if (values.templateId) {
    if (!isValidPatientUuid(values.templateId)) return { state: "validation_error" as const, error: "La plantilla seleccionada no es valida.", errors: { templateId: "Selecciona una plantilla disponible." }, values };
    const templateResult = await supabase.from("medical_note_templates").select("id, name, description, template_schema").eq("id", values.templateId).or(`is_system_template.eq.true,clinic_id.eq.${context.tenant.clinic.id}`).eq("template_kind", "consent").eq("is_active", true).maybeSingle();
    if (templateResult.error) { logger.error("Consent template query failed", { component: "clinical_consents", operation: "template", status: "query_error", code: templateResult.error.code }); return { state: "error" as const, error: "No fue posible validar la plantilla.", values }; }
    if (!templateResult.data) return { state: "validation_error" as const, error: "La plantilla ya no esta disponible.", errors: { templateId: "Selecciona una plantilla activa." }, values };
    template = templateResult.data as TemplateOption;
  }
  const consentText = template ? getTemplateContent(template.template_schema) : values.consentText;
  const consentType = template ? template.name : values.consentType;
  if (!consentText) return { state: "validation_error" as const, error: "La plantilla no contiene texto utilizable.", errors: { templateId: "Actualiza la plantilla antes de usarla." }, values };
  const insert: ConsentInsert = { clinic_id: context.tenant.clinic.id, patient_id: patient.id, created_by: context.user.id, consent_type: consentType, consent_version: values.consentVersion, consent_text: consentText, template_id: template?.id ?? null, status: "pending" };
  const insertResult = (await supabase.from("consents").insert(insert as never).select("id").single()) as unknown as { data: { id: string } | null; error: { code: string } | null };
  if (insertResult.error || !insertResult.data) { logger.error("Consent insert failed", { component: "clinical_consents", operation: "create", status: insertResult.error ? "insert_error" : "missing_result", code: insertResult.error?.code }); return { state: "error" as const, error: "No fue posible crear el consentimiento.", values }; }
  return { state: "success" as const, consentId: insertResult.data.id, patientId: patient.id };
}

export async function createConsentSigningLink(patientId: string, consentId: string) {
  const detail = await getConsentForActiveTenant(patientId, consentId);
  if (detail.state !== "ready") return detail;
  if (detail.data.status !== "pending") return { state: "invalid_state" as const };
  const resolved = await resolvePatient(patientId, true);
  if (resolved.state !== "ready") return resolved;
  if (!canCreateWithEntitlements(await getClinicEntitlements(resolved.data.context.tenant.clinic.id))) return { state: "forbidden" as const };
  const rawToken = createSigningToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const update = await resolved.data.supabase.from("consents").update({ signing_token_hash: hashSigningToken(rawToken), signing_token_expires_at: expiresAt, signing_token_used_at: null, signing_token_revoked_at: null } as never).eq("id", consentId).eq("clinic_id", resolved.data.context.tenant.clinic.id).eq("patient_id", resolved.data.patient.id).eq("status", "pending").select("id").maybeSingle();
  if (update.error || !update.data) { logger.error("Consent signing link update failed", { component: "clinical_consents", operation: "create_signing_link", status: update.error ? "query_error" : "stale", code: update.error?.code }); return { state: "error" as const }; }
  return { state: "success" as const, url: new URL(`/consent/sign/${rawToken}`, getAppBaseUrl()).toString(), expiresAt };
}

export async function revokeConsentSigningLink(patientId: string, consentId: string) {
  const detail = await getConsentForActiveTenant(patientId, consentId);
  if (detail.state !== "ready") return detail;
  if (detail.data.status !== "pending") return { state: "invalid_state" as const };
  const resolved = await resolvePatient(patientId, true);
  if (resolved.state !== "ready") return resolved;
  const update = await resolved.data.supabase.from("consents").update({ signing_token_hash: null, signing_token_expires_at: null, signing_token_revoked_at: new Date().toISOString() } as never).eq("id", consentId).eq("clinic_id", resolved.data.context.tenant.clinic.id).eq("patient_id", resolved.data.patient.id).eq("status", "pending").select("id").maybeSingle();
  if (update.error || !update.data) { logger.error("Consent signing link revoke failed", { component: "clinical_consents", operation: "revoke_signing_link", status: update.error ? "query_error" : "stale", code: update.error?.code }); return { state: "error" as const }; }
  return { state: "success" as const };
}

export { getConsentFormValues };
