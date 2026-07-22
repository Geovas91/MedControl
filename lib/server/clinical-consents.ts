import "server-only";

import { getConsentFormValues, validateConsentValues, type ConsentFormValues } from "@/lib/clinical-record/consents";
import { canCreateConsent, canViewClinicalRecord } from "@/lib/clinical-record/permissions";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ConsentRow = Database["public"]["Tables"]["consents"]["Row"];
type SignatureRow = Database["public"]["Tables"]["consent_signatures"]["Row"];
type ConsentInsert = Database["public"]["Tables"]["consents"]["Insert"];
export type ConsentDetail = Pick<ConsentRow, "id" | "consent_type" | "consent_version" | "consent_text" | "status" | "expires_at" | "signed_at" | "revoked_at" | "created_at"> & { signatures: Pick<SignatureRow, "id" | "signer_full_name" | "signed_at" | "accepted_privacy_notice" | "accepted_sensitive_data_processing">[] };
type Result<T> = { state: "ready"; data: T } | { state: "invalid_id" | "unauthenticated" | "no_active_membership" | "forbidden" | "not_found" | "error"; data: null };

async function resolvePatient(patientId: string, canCreate = false): Promise<Result<{ context: Awaited<ReturnType<typeof getActiveTenantContext>> & { state: "ready" }; supabase: Awaited<ReturnType<typeof createClient>>; patient: { id: string; full_name: string } }>> {
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
  const consentResult = await supabase.from("consents").select("id, consent_type, consent_version, consent_text, status, expires_at, signed_at, revoked_at, created_at").eq("id", consentId).eq("clinic_id", context.tenant.clinic.id).eq("patient_id", patient.id).maybeSingle();
  if (consentResult.error) { logger.error("Consent detail query failed", { component: "clinical_consents", operation: "detail", status: "query_error", code: consentResult.error.code }); return { state: "error", data: null }; }
  if (!consentResult.data) return { state: "not_found", data: null };
  const signaturesResult = await supabase.from("consent_signatures").select("id, signer_full_name, signed_at, accepted_privacy_notice, accepted_sensitive_data_processing").eq("consent_id", consentId).eq("patient_id", patient.id).order("signed_at", { ascending: false });
  if (signaturesResult.error) { logger.error("Consent signature query failed", { component: "clinical_consents", operation: "signatures", status: "query_error", code: signaturesResult.error.code }); return { state: "error", data: null }; }
  return { state: "ready", data: { ...(consentResult.data as Omit<ConsentDetail, "signatures">), signatures: (signaturesResult.data ?? []) as ConsentDetail["signatures"], timeZone: context.tenant.clinic.timezone } };
}

export async function createConsentForActiveTenant(patientId: string, values: ConsentFormValues) {
  const resolved = await resolvePatient(patientId, true);
  if (resolved.state !== "ready") return resolved;
  const validation = validateConsentValues(values);
  if (!validation.valid) return { state: "validation_error" as const, error: "Revisa los campos marcados.", errors: validation.errors, values };
  const { context, supabase, patient } = resolved.data;
  const insert: ConsentInsert = { clinic_id: context.tenant.clinic.id, patient_id: patient.id, created_by: context.user.id, consent_type: values.consentType, consent_version: values.consentVersion, consent_text: values.consentText, signing_token: crypto.randomUUID(), status: "pending" };
  // The hand-maintained Database type lacks generated relationship metadata, so this table infers insert as never.
  const insertResult = (await supabase.from("consents").insert(insert as never).select("id").single()) as unknown as {
    data: { id: string } | null;
    error: { code: string } | null;
  };
  if (insertResult.error || !insertResult.data) { logger.error("Consent insert failed", { component: "clinical_consents", operation: "create", status: insertResult.error ? "insert_error" : "missing_result", code: insertResult.error?.code }); return { state: "error" as const, error: "No fue posible crear el consentimiento.", values }; }
  return { state: "success" as const, consentId: insertResult.data.id, patientId: patient.id };
}

export { getConsentFormValues };
