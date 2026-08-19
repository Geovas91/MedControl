import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canViewClinicalRecord } from "@/lib/clinical-record/permissions";
import { CONSENT_PDF_RENDERER_VERSION, renderSignedConsentPdf, type SignedConsentPdfEvidence } from "@/lib/consents/pdf-renderer";
import { logger } from "@/lib/logger";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type EvidenceRow = Database["public"]["Functions"]["get_signed_consent_evidence_for_current_user"]["Returns"][number];
type DocumentRow = Database["public"]["Tables"]["consent_documents"]["Row"];
type MaterializationEvidence = EvidenceRow & Pick<DocumentRow, "storage_bucket" | "storage_path" | "sha256" | "size_bytes" | "last_error_code">;
type EvidenceRpcClient = {
  rpc(
    name: "get_signed_consent_evidence_for_current_user",
    args: Database["public"]["Functions"]["get_signed_consent_evidence_for_current_user"]["Args"]
  ): Promise<{ data: EvidenceRow[] | null; error: { code: string } | null }>;
};
type EvidenceResult =
  | { state: "ready"; data: EvidenceRow & { clinicId: string; patientId: string; consentId: string; actorId: string } }
  | { state: "invalid_id" | "unauthenticated" | "no_active_membership" | "forbidden" | "not_found" | "error"; data: null };

let fontPromise: Promise<Buffer> | null = null;

function loadPdfFont() {
  fontPromise ??= readFile(join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf"));
  return fontPromise;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashesMatch(expected: string, actual: string) {
  if (!/^[0-9a-f]{64}$/.test(expected) || !/^[0-9a-f]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

function toPdfEvidence(row: EvidenceRow, consentId: string): SignedConsentPdfEvidence {
  return {
    snapshotId: row.snapshot_id,
    documentId: row.document_id,
    clinicName: row.clinic_name,
    clinicTimezone: row.clinic_timezone,
    patientDisplayName: row.patient_display_name,
    consentId,
    consentType: row.consent_type,
    consentVersion: row.consent_version,
    consentText: row.consent_text,
    issuedAt: row.issued_at,
    signerFullName: row.signer_full_name,
    acceptedPrivacyNotice: row.accepted_privacy_notice,
    acceptedSensitiveDataProcessing: row.accepted_sensitive_data_processing,
    signedAt: row.signed_at,
    signatureData: row.signature_data,
    rendererVersion: row.renderer_version
  };
}

async function writeAudit({ clinicId, actorId, documentId, action, metadata }: { clinicId: string; actorId: string | null; documentId: string; action: "consent_pdf_generated" | "consent_pdf_generation_failed" | "consent_pdf_downloaded"; metadata?: Record<string, string | boolean> }) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({ clinic_id: clinicId, actor_user_id: actorId, entity_type: "consent_document", entity_id: documentId, action, metadata: metadata ?? {} } as never);
  } catch {
    logger.error("Consent document audit write failed", { component: "consent_documents", operation: "audit", action });
  }
}

async function authorizeEvidence(patientId: string, consentId: string): Promise<EvidenceResult> {
  if (!isValidPatientUuid(patientId) || !isValidPatientUuid(consentId)) return { state: "invalid_id", data: null };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };
  if (!canViewClinicalRecord(context.tenant.membership.role)) return { state: "forbidden", data: null };
  const supabase = await createClient();
  const consent = await supabase.from("consents").select("id, patient_id, status").eq("id", consentId).eq("patient_id", patientId).eq("clinic_id", context.tenant.clinic.id).maybeSingle();
  if (consent.error) {
    logger.error("Consent evidence authorization failed", { component: "consent_documents", operation: "authorize", code: consent.error.code });
    return { state: "error", data: null };
  }
  const consentData = consent.data as { id: string; patient_id: string; status: Database["public"]["Enums"]["consent_status"] } | null;
  if (!consentData || consentData.status !== "signed") return { state: "not_found", data: null };
  const result = await (supabase as unknown as EvidenceRpcClient).rpc("get_signed_consent_evidence_for_current_user", {
    p_clinic_id: context.tenant.clinic.id,
    p_patient_id: patientId,
    p_consent_id: consentId
  });
  if (result.error) {
    logger.error("Signed consent evidence RPC failed", { component: "consent_documents", operation: "evidence", code: result.error.code });
    return { state: "error", data: null };
  }
  const row = result.data?.[0];
  return row
    ? { state: "ready", data: { ...row, clinicId: context.tenant.clinic.id, patientId, consentId, actorId: context.user.id } }
    : { state: "not_found", data: null };
}

export async function getSignedConsentEvidenceForActiveTenant(patientId: string, consentId: string) {
  return authorizeEvidence(patientId, consentId);
}

async function loadEvidenceWithAdmin(clinicId: string, patientId: string, consentId: string): Promise<MaterializationEvidence | null> {
  const admin = createAdminClient();
  const document = await admin.from("consent_documents").select("id, snapshot_id, status, renderer_version, storage_bucket, storage_path, sha256, size_bytes, generated_at, last_error_code").eq("clinic_id", clinicId).eq("patient_id", patientId).eq("consent_id", consentId).maybeSingle();
  const documentData = document.data as Pick<DocumentRow, "id" | "snapshot_id" | "status" | "renderer_version" | "storage_bucket" | "storage_path" | "sha256" | "size_bytes" | "generated_at" | "last_error_code"> | null;
  if (document.error || !documentData) return null;
  const snapshot = await admin.from("consent_signed_snapshots").select("id, clinic_name, clinic_timezone, patient_display_name, consent_type, consent_version, consent_text, issued_at, signer_full_name, accepted_privacy_notice, accepted_sensitive_data_processing, signed_at, snapshot_source, signature_id").eq("id", documentData.snapshot_id).eq("clinic_id", clinicId).eq("patient_id", patientId).eq("consent_id", consentId).maybeSingle();
  const snapshotData = snapshot.data as Pick<Database["public"]["Tables"]["consent_signed_snapshots"]["Row"], "id" | "clinic_name" | "clinic_timezone" | "patient_display_name" | "consent_type" | "consent_version" | "consent_text" | "issued_at" | "signer_full_name" | "accepted_privacy_notice" | "accepted_sensitive_data_processing" | "signed_at" | "snapshot_source" | "signature_id"> | null;
  if (snapshot.error || !snapshotData) return null;
  const signature = await admin.from("consent_signatures").select("signature_data").eq("id", snapshotData.signature_id).eq("clinic_id", clinicId).eq("patient_id", patientId).eq("consent_id", consentId).maybeSingle();
  const signatureData = signature.data as { signature_data: string | null } | null;
  if (signature.error || !signatureData?.signature_data) return null;
  return {
    snapshot_id: snapshotData.id,
    document_id: documentData.id,
    clinic_name: snapshotData.clinic_name,
    clinic_timezone: snapshotData.clinic_timezone,
    patient_display_name: snapshotData.patient_display_name,
    consent_type: snapshotData.consent_type,
    consent_version: snapshotData.consent_version,
    consent_text: snapshotData.consent_text,
    issued_at: snapshotData.issued_at,
    signer_full_name: snapshotData.signer_full_name,
    accepted_privacy_notice: snapshotData.accepted_privacy_notice,
    accepted_sensitive_data_processing: snapshotData.accepted_sensitive_data_processing,
    signed_at: snapshotData.signed_at,
    snapshot_source: snapshotData.snapshot_source,
    signature_data: signatureData.signature_data,
    document_status: documentData.status,
    renderer_version: documentData.renderer_version,
    storage_bucket: documentData.storage_bucket,
    storage_path: documentData.storage_path,
    sha256: documentData.sha256,
    size_bytes: documentData.size_bytes,
    generated_at: documentData.generated_at,
    last_error_code: documentData.last_error_code
  };
}

async function markFailed(row: MaterializationEvidence, clinicId: string, actorId: string | null, errorCode: string) {
  try {
    const admin = createAdminClient();
    await admin.from("consent_documents").update({ status: "failed", sha256: null, size_bytes: null, generated_at: null, last_error_code: errorCode } as never).eq("id", row.document_id).neq("status", "ready");
  } catch {
    logger.error("Consent document failure state could not be persisted", { component: "consent_documents", operation: "mark_failed", documentId: row.document_id });
  } finally {
    await writeAudit({ clinicId, actorId, documentId: row.document_id, action: "consent_pdf_generation_failed", metadata: { error_code: errorCode } });
  }
}

async function materializeEvidence(row: MaterializationEvidence, clinicId: string, patientId: string, consentId: string, actorId: string | null) {
  if (row.document_status === "ready") return { state: "ready" as const, documentId: row.document_id };
  const admin = createAdminClient();
  try {
    if (row.document_status === "failed") {
      const reset = await admin.from("consent_documents").update({ status: "pending", last_error_code: null, sha256: null, size_bytes: null, generated_at: null } as never).eq("id", row.document_id).eq("status", "failed");
      if (reset.error) throw new Error("document_reset_failed");
    }
    const bytes = await renderSignedConsentPdf(toPdfEvidence(row, consentId), await loadPdfFont());
    const digest = sha256(bytes);
    const upload = await admin.storage.from(row.storage_bucket).upload(row.storage_path, bytes, { contentType: "application/pdf", cacheControl: "0", upsert: true });
    if (upload.error) throw new Error("storage_upload_failed");
    const stored = await admin.storage.from(row.storage_bucket).download(row.storage_path);
    if (stored.error || !stored.data) throw new Error("storage_verification_download_failed");
    const storedBytes = Buffer.from(await stored.data.arrayBuffer());
    if (storedBytes.length !== bytes.length || !hashesMatch(digest, sha256(storedBytes))) throw new Error("storage_integrity_mismatch");
    const generatedAt = new Date().toISOString();
    const update = await admin.from("consent_documents").update({ status: "ready", sha256: digest, size_bytes: bytes.length, generated_at: generatedAt, last_error_code: null } as never).eq("id", row.document_id).in("status", ["pending", "failed"]).select("id").maybeSingle();
    if (update.error) throw new Error("document_ready_update_failed");
    if (!update.data) {
      const concurrent = await admin.from("consent_documents").select("id, status, sha256").eq("id", row.document_id).maybeSingle();
      const concurrentData = concurrent.data as Pick<DocumentRow, "id" | "status" | "sha256"> | null;
      if (concurrentData?.status !== "ready" || !concurrentData.sha256 || !hashesMatch(concurrentData.sha256, digest)) throw new Error("document_concurrent_update_failed");
    }
    await writeAudit({ clinicId, actorId, documentId: row.document_id, action: "consent_pdf_generated", metadata: { renderer_version: CONSENT_PDF_RENDERER_VERSION } });
    return { state: "ready" as const, documentId: row.document_id };
  } catch (error) {
    const errorCode = error instanceof Error && /^[a-z0-9][a-z0-9._-]{1,79}$/.test(error.message) ? error.message : "pdf_generation_failed";
    logger.error("Consent PDF generation failed", { component: "consent_documents", operation: "generate", consentId, documentId: row.document_id, errorCode });
    await markFailed(row, clinicId, actorId, errorCode);
    return { state: "failed" as const };
  }
}

export async function generateConsentDocumentForActiveTenant(patientId: string, consentId: string) {
  const evidence = await authorizeEvidence(patientId, consentId);
  if (evidence.state !== "ready") return evidence;
  const { clinicId, actorId } = evidence.data;
  const row = await loadEvidenceWithAdmin(clinicId, patientId, consentId);
  return row ? materializeEvidence(row, clinicId, patientId, consentId, actorId) : { state: "not_found" as const, data: null };
}

export async function generateConsentDocumentAfterPublicSigning(tokenHash: string) {
  try {
    const admin = createAdminClient();
    const consent = await admin.from("consents").select("id, clinic_id, patient_id, status").eq("signing_token_hash", tokenHash).maybeSingle();
    const consentData = consent.data as Pick<Database["public"]["Tables"]["consents"]["Row"], "id" | "clinic_id" | "patient_id" | "status"> | null;
    if (consent.error || !consentData || consentData.status !== "signed") return { state: "unavailable" as const };
    const row = await loadEvidenceWithAdmin(consentData.clinic_id, consentData.patient_id, consentData.id);
    return row ? materializeEvidence(row, consentData.clinic_id, consentData.patient_id, consentData.id, null) : { state: "unavailable" as const };
  } catch {
    logger.error("Post-sign consent PDF attempt failed", { component: "consent_documents", operation: "post_sign" });
    return { state: "failed" as const };
  }
}

export async function getConsentDocumentDownloadForActiveTenant(consentId: string) {
  if (!isValidPatientUuid(consentId)) return { state: "invalid_id" as const };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state } as const;
  if (!canViewClinicalRecord(context.tenant.membership.role)) return { state: "forbidden" as const };
  const supabase = await createClient();
  const consent = await supabase.from("consents").select("id, patient_id, status").eq("id", consentId).eq("clinic_id", context.tenant.clinic.id).maybeSingle();
  if (consent.error) return { state: "error" as const };
  const consentData = consent.data as Pick<Database["public"]["Tables"]["consents"]["Row"], "id" | "patient_id" | "status"> | null;
  if (!consentData || consentData.status !== "signed") return { state: "not_found" as const };
  const admin = createAdminClient();
  const document = await admin.from("consent_documents").select("id, status, storage_bucket, storage_path, sha256, size_bytes").eq("consent_id", consentId).eq("patient_id", consentData.patient_id).eq("clinic_id", context.tenant.clinic.id).maybeSingle();
  if (document.error) return { state: "error" as const };
  const documentData = document.data as Pick<DocumentRow, "id" | "status" | "storage_bucket" | "storage_path" | "sha256" | "size_bytes"> | null;
  if (!documentData || documentData.status !== "ready" || !documentData.sha256 || !documentData.size_bytes) return { state: "not_ready" as const };
  const stored = await admin.storage.from(documentData.storage_bucket).download(documentData.storage_path);
  if (stored.error || !stored.data) return { state: "error" as const };
  const bytes = Buffer.from(await stored.data.arrayBuffer());
  if (bytes.length !== documentData.size_bytes || !hashesMatch(documentData.sha256, sha256(bytes))) {
    logger.error("Consent PDF download integrity check failed", { component: "consent_documents", operation: "download", consentId, documentId: documentData.id, status: "integrity_mismatch" });
    await writeAudit({ clinicId: context.tenant.clinic.id, actorId: context.user.id, documentId: documentData.id, action: "consent_pdf_generation_failed", metadata: { error_code: "download_integrity_mismatch" } });
    return { state: "integrity_error" as const };
  }
  await writeAudit({ clinicId: context.tenant.clinic.id, actorId: context.user.id, documentId: documentData.id, action: "consent_pdf_downloaded" });
  return { state: "ready" as const, bytes, safeId: consentId.slice(0, 8) };
}
