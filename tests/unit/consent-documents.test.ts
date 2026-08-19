import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { CONSENT_PDF_RENDERER_VERSION, getSignedConsentPdfText, renderSignedConsentPdf, type SignedConsentPdfEvidence } from "../../lib/consents/pdf-renderer.ts";

const migration = readFileSync(new URL("../../supabase/migrations/0023_consent_signed_documents.sql", import.meta.url), "utf8");
const documentService = readFileSync(new URL("../../lib/server/consent-documents.ts", import.meta.url), "utf8");
const publicSigning = readFileSync(new URL("../../lib/server/public-consent-signing.ts", import.meta.url), "utf8");
const consentList = readFileSync(new URL("../../app/dashboard/patients/[id]/consents/page.tsx", import.meta.url), "utf8");
const consentDetail = readFileSync(new URL("../../app/dashboard/patients/[id]/consents/[consentId]/page.tsx", import.meta.url), "utf8");
const patientPage = readFileSync(new URL("../../app/dashboard/patients/[id]/page.tsx", import.meta.url), "utf8");
const clinicalRecord = readFileSync(new URL("../../app/dashboard/patients/[id]/clinical-record/page.tsx", import.meta.url), "utf8");
const logger = readFileSync(new URL("../../lib/logger.ts", import.meta.url), "utf8");

const evidence: SignedConsentPdfEvidence = {
  snapshotId: "81000000-0000-4000-8000-000000000001",
  documentId: "82000000-0000-4000-8000-000000000001",
  clinicName: "Clínica Ñandú",
  clinicTimezone: "America/Mexico_City",
  patientDisplayName: "María Álvarez",
  consentId: "83000000-0000-4000-8000-000000000001",
  consentType: "Consentimiento quirúrgico",
  consentVersion: "v1.0",
  consentText: "Autorizo el procedimiento descrito. Información íntegra con acentos y ñ.",
  issuedAt: "2026-08-18T10:00:00.000Z",
  signerFullName: "José Pérez",
  acceptedPrivacyNotice: true,
  acceptedSensitiveDataProcessing: true,
  signedAt: "2026-08-19T12:30:00.000Z",
  signatureData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  rendererVersion: CONSENT_PDF_RENDERER_VERSION
};

test("0023 creates immutable snapshots, retryable documents and a private bucket", () => {
  assert.match(migration, /create table public\.consent_signed_snapshots/);
  assert.match(migration, /before update or delete on public\.consent_signed_snapshots/);
  assert.match(migration, /after insert on public\.consent_signatures/);
  assert.match(migration, /snapshot_source[\s\S]+legacy_backfill/);
  assert.match(migration, /status public\.consent_document_status not null default 'pending'/);
  assert.match(migration, /Ready consent document evidence is immutable/);
  assert.match(migration, /values \('consent-pdfs', 'consent-pdfs', false/);
  assert.doesNotMatch(migration, /create policy[\s\S]{0,300}storage\.objects/i);
  assert.doesNotMatch(migration, /disable\s+trigger|session_replication_role/i);
});

test("evidence RPC is tenant and role constrained without generic signature access", () => {
  assert.match(migration, /get_signed_consent_evidence_for_current_user/);
  assert.match(migration, /security definer[\s\S]+set search_path = public, pg_temp/);
  assert.match(migration, /auth\.uid\(\) is null[\s\S]+has_clinic_role\(p_clinic_id, array\['owner', 'admin', 'doctor'\]\)/);
  assert.match(migration, /snapshot\.clinic_id = p_clinic_id[\s\S]+snapshot\.patient_id = p_patient_id[\s\S]+snapshot\.consent_id = p_consent_id/);
  assert.match(migration, /revoke all on function public\.get_signed_consent_evidence_for_current_user[\s\S]+from public, anon/);
  assert.doesNotMatch(migration, /grant select on table public\.consent_signed_snapshots/);
  assert.doesNotMatch(migration, /returns table[\s\S]{0,1200}storage_path text/);
});

test("PDF model contains exact signed evidence and no token material", () => {
  const text = getSignedConsentPdfText(evidence);
  assert.equal(text.consentText, evidence.consentText);
  assert.equal(text.patient, `Paciente: ${evidence.patientDisplayName}`);
  assert.equal(text.signer, `Firmante: ${evidence.signerFullName}`);
  assert.equal(text.status, "Estado: Firmado");
  assert.equal(text.privacy, "Aviso de privacidad: Aceptado");
  assert.equal(text.sensitiveData, "Tratamiento de datos sensibles: Aceptado");
  assert.equal(Object.values(text).join(" ").includes("signing_token"), false);
  assert.equal(Object.values(text).join(" ").includes("token_hash"), false);
});

test("renderer embeds the visible PNG signature and produces a valid PDF", async () => {
  const font = readFileSync(join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf"));
  const bytes = await renderSignedConsentPdf(evidence, font);
  assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(bytes.toString("latin1"), /\/Subtype \/Image/);
  assert.equal(bytes.includes(Buffer.from("signing_token")), false);
  assert.equal(bytes.includes(Buffer.from("token_hash")), false);
  const parsed = await PDFDocument.load(bytes);
  assert.ok(parsed.getPageCount() >= 1);
});

test("Storage upload is server-side, verified and persisted only after SHA-256 comparison", () => {
  assert.match(documentService, /createAdminClient\(\)/);
  assert.match(documentService, /createHash\("sha256"\)/);
  assert.match(documentService, /storage[\s\S]+\.upload\(row\.storage_path/);
  assert.match(documentService, /\.download\(row\.storage_path\)/);
  assert.match(documentService, /hashesMatch\(digest, sha256\(storedBytes\)\)/);
  assert.match(documentService, /status: "ready", sha256: digest, size_bytes: bytes\.length/);
  assert.match(documentService, /status: "failed"/);
  assert.match(documentService, /row\.document_status === "failed"[\s\S]+status: "pending"/);
  assert.match(logger, /hash\|signature\|pdfBytes\|consentText\|storagePath/);
});

test("download authorizes the active tenant and blocks altered bytes", () => {
  assert.match(documentService, /getActiveTenantContext\(\)/);
  assert.match(documentService, /canViewClinicalRecord\(context\.tenant\.membership\.role\)/);
  assert.match(documentService, /\.eq\("clinic_id", context\.tenant\.clinic\.id\)/);
  assert.match(documentService, /bytes\.length !== documentData\.size_bytes \|\| !hashesMatch/);
  assert.match(documentService, /state: "integrity_error"/);
  assert.match(documentService, /consent_pdf_downloaded/);
});

test("a Storage failure cannot reverse a completed public signature", () => {
  const signedBranch = publicSigning.slice(publicSigning.indexOf("if (result.data !== \"signed\")"));
  assert.match(signedBranch, /await generateConsentDocumentAfterPublicSigning\(tokenHash\)/);
  assert.match(signedBranch, /return \{ state: "success" as const \}/);
  assert.match(documentService, /generateConsentDocumentAfterPublicSigning[\s\S]+catch[\s\S]+state: "failed"/);
  assert.doesNotMatch(documentService, /from\("consents"\)\.update\(/);
});

test("history, signed detail, patient navigation and universal record expose the real document flow", () => {
  assert.match(consentList, /Histórico documental/);
  assert.match(consentList, /consent\.status === "signed"/);
  assert.match(consentList, /consent\.status === "signed" && consent\.documentStatus === "ready"/);
  assert.match(consentList, /Reintentar PDF/);
  assert.match(consentDetail, /Evidencia firmada/);
  assert.match(consentDetail, /\/api\/consents\/\$\{consentId\}\/signature/);
  assert.doesNotMatch(consentDetail, /src=\{evidence\.signature_data\}/);
  assert.match(patientPage, /tab==='consentimientos'[\s\S]+Ver consentimientos/);
  assert.doesNotMatch(patientPage, /\['consultas','documentos','consentimientos','auditoria'\]/);
  assert.match(clinicalRecord, /Documentos de consentimiento/);
  assert.match(clinicalRecord, /no son notas editables/);
  assert.match(clinicalRecord, /Firmado por/);
});
