import "server-only";

import { canViewClinicalRecord } from "@/lib/clinical-record/permissions";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { logger } from "@/lib/logger";
import { getActiveTenantContext, type ActiveTenant } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type NoteRow = Tables["medical_notes"]["Row"];
type ConsentRow = Tables["consents"]["Row"];
type TemplateRow = Tables["medical_note_templates"]["Row"];

export type ClinicalRecordNote = Pick<
  NoteRow,
  "id" | "doctor_id" | "appointment_id" | "template_id" | "status" | "specialty" | "clinical_impression" | "created_at"
> & { doctorName: string | null; templateName: string | null };
export type ClinicalRecordConsent = Pick<ConsentRow, "id" | "consent_type" | "status" | "signed_at" | "expires_at" | "created_at"> & {
  signatureCount: number;
};
export type ClinicalTemplate = Pick<TemplateRow, "id" | "name" | "specialty" | "description" | "template_schema">;

export type ClinicalRecordData = {
  tenant: ActiveTenant;
  patient: { id: string; full_name: string };
  notes: ClinicalRecordNote[];
  totalNotes: number;
  page: number;
  pageCount: number;
  consents: ClinicalRecordConsent[];
  templates: ClinicalTemplate[];
  signatureCount: number;
};

export type ClinicalRecordResult =
  | { state: "ready"; data: ClinicalRecordData }
  | { state: "invalid_id"; data: null }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "forbidden"; data: null }
  | { state: "not_found"; data: null }
  | { state: "error"; data: null };

type DoctorProfile = { profile_id: string | null; display_name: string };
type SignatureRow = { consent_id: string };

function normalizePage(value: string | string[] | undefined) {
  const candidate = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 1;
}

export async function getClinicalRecordForActiveTenant(
  patientId: string,
  searchParams: { page?: string | string[] }
): Promise<ClinicalRecordResult> {
  if (!isValidPatientUuid(patientId)) return { state: "invalid_id", data: null };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };
  if (!canViewClinicalRecord(context.tenant.membership.role)) return { state: "forbidden", data: null };

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const patientResult = await supabase
    .from("patients")
    .select("id, full_name")
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (patientResult.error) {
    logger.error("Clinical record patient query failed", { component: "clinical_record", operation: "patient", status: "query_error", code: patientResult.error.code });
    return { state: "error", data: null };
  }
  if (!patientResult.data) return { state: "not_found", data: null };

  const pageSize = 10;
  const requestedPage = normalizePage(searchParams.page);
  const notesCountResult = await supabase
    .from("medical_notes")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId);
  if (notesCountResult.error) {
    logger.error("Clinical record notes count failed", { component: "clinical_record", operation: "notes_count", status: "query_error", code: notesCountResult.error.code });
    return { state: "error", data: null };
  }
  const totalNotes = notesCountResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalNotes / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const from = (page - 1) * pageSize;
  const [notesResult, consentsResult, templatesResult, doctorsResult, signaturesResult] = await Promise.all([
    supabase.from("medical_notes").select("id, doctor_id, appointment_id, template_id, status, specialty, clinical_impression, created_at").eq("clinic_id", clinicId).eq("patient_id", patientId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + pageSize - 1),
    supabase.from("consents").select("id, consent_type, status, signed_at, expires_at, created_at").eq("clinic_id", clinicId).eq("patient_id", patientId).order("created_at", { ascending: false }),
    supabase.from("medical_note_templates").select("id, name, specialty, description, template_schema").or(`is_system_template.eq.true,clinic_id.eq.${clinicId}`).eq("is_active", true).order("name", { ascending: true }),
    supabase.from("doctor_public_profiles").select("profile_id, display_name").eq("clinic_id", clinicId).limit(100),
    supabase.from("consent_signatures").select("consent_id").eq("patient_id", patientId)
  ]);
  if (notesResult.error || consentsResult.error || templatesResult.error || doctorsResult.error || signaturesResult.error) {
    logger.error("Clinical record data query failed", { component: "clinical_record", operation: "data", status: "query_error", notesCode: notesResult.error?.code, consentsCode: consentsResult.error?.code, templatesCode: templatesResult.error?.code, doctorsCode: doctorsResult.error?.code, signaturesCode: signaturesResult.error?.code });
    return { state: "error", data: null };
  }
  const doctors = new Map(((doctorsResult.data ?? []) as DoctorProfile[]).filter((row): row is DoctorProfile & { profile_id: string } => Boolean(row.profile_id)).map((row) => [row.profile_id, row.display_name]));
  const templates = (templatesResult.data ?? []) as ClinicalTemplate[];
  const templateNames = new Map(templates.map((template) => [template.id, template.name]));
  const signatures = (signaturesResult.data ?? []) as SignatureRow[];
  const signatureCounts = signatures.reduce<Map<string, number>>((counts, signature) => counts.set(signature.consent_id, (counts.get(signature.consent_id) ?? 0) + 1), new Map());
  const notes = ((notesResult.data ?? []) as Omit<ClinicalRecordNote, "doctorName" | "templateName">[]).map((note) => ({ ...note, doctorName: note.doctor_id ? doctors.get(note.doctor_id) ?? null : null, templateName: note.template_id ? templateNames.get(note.template_id) ?? null : null }));
  const consents = ((consentsResult.data ?? []) as Omit<ClinicalRecordConsent, "signatureCount">[]).map((consent) => ({ ...consent, signatureCount: signatureCounts.get(consent.id) ?? 0 }));
  return { state: "ready", data: { tenant: context.tenant, patient: patientResult.data, notes, totalNotes, page, pageCount, consents, templates, signatureCount: signatures.length } };
}
