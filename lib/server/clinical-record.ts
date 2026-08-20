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
type AppointmentRow = Tables["appointments"]["Row"];

export type ClinicalRecordNote = Pick<
  NoteRow,
  "id" | "doctor_id" | "appointment_id" | "template_id" | "status" | "specialty" | "clinical_impression" | "created_at"
> & { doctorName: string | null; templateName: string | null };
export type ClinicalRecordConsent = Pick<ConsentRow, "id" | "consent_type" | "consent_version" | "status" | "signed_at" | "expires_at" | "created_at"> & {
  signatureCount: number;
  signedBy: string | null;
  documentStatus: Database["public"]["Enums"]["consent_document_status"] | null;
};
export type ClinicalTemplate = Pick<TemplateRow, "id" | "name" | "specialty" | "description" | "template_schema">;
export type ClinicalRecordAppointment = Pick<AppointmentRow, "id" | "doctor_id" | "title" | "appointment_type" | "starts_at" | "status"> & {
  doctorName: string | null;
};

export type ClinicalRecordData = {
  tenant: ActiveTenant;
  patient: { id: string; full_name: string };
  notes: ClinicalRecordNote[];
  totalNotes: number;
  page: number;
  pageCount: number;
  consents: ClinicalRecordConsent[];
  totalDocuments: number;
  documentsPage: number;
  documentsPageCount: number;
  appointments: ClinicalRecordAppointment[];
  totalAppointments: number;
  appointmentsPage: number;
  appointmentsPageCount: number;
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
type SignatureRow = { consent_id: string; signer_full_name: string };
type DocumentRow = { consent_id: string; status: Database["public"]["Enums"]["consent_document_status"] };

function normalizePage(value: string | string[] | undefined) {
  const candidate = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 1;
}

export async function getClinicalRecordForActiveTenant(
  patientId: string,
  searchParams: {
    page?: string | string[];
    appointmentsPage?: string | string[];
    documentsPage?: string | string[];
    paginateAppointments?: boolean;
    paginateDocuments?: boolean;
  }
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
  const appointmentsPageSize = 12;
  const documentsPageSize = 10;
  const requestedPage = normalizePage(searchParams.page);
  const requestedAppointmentsPage = normalizePage(searchParams.appointmentsPage);
  const requestedDocumentsPage = normalizePage(searchParams.documentsPage);
  const [notesCountResult, appointmentsCountResult, documentsCountResult] = await Promise.all([
    supabase.from("medical_notes").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("patient_id", patientId),
    searchParams.paginateAppointments
      ? supabase.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("patient_id", patientId)
      : Promise.resolve({ count: 0, error: null }),
    searchParams.paginateDocuments
      ? supabase.from("consents").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("patient_id", patientId)
      : Promise.resolve({ count: 0, error: null })
  ]);
  if (notesCountResult.error || appointmentsCountResult.error || documentsCountResult.error) {
    logger.error("Clinical record pagination count failed", { component: "clinical_record", operation: "pagination_count", status: "query_error", notesCode: notesCountResult.error?.code, appointmentsCode: appointmentsCountResult.error?.code, documentsCode: documentsCountResult.error?.code });
    return { state: "error", data: null };
  }
  const totalNotes = notesCountResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalNotes / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const from = (page - 1) * pageSize;
  const totalAppointments = appointmentsCountResult.count ?? 0;
  const appointmentsPageCount = Math.max(1, Math.ceil(totalAppointments / appointmentsPageSize));
  const appointmentsPage = Math.min(requestedAppointmentsPage, appointmentsPageCount);
  const appointmentsFrom = (appointmentsPage - 1) * appointmentsPageSize;
  const totalDocuments = documentsCountResult.count ?? 0;
  const documentsPageCount = Math.max(1, Math.ceil(totalDocuments / documentsPageSize));
  const documentsPage = Math.min(requestedDocumentsPage, documentsPageCount);
  const documentsFrom = (documentsPage - 1) * documentsPageSize;

  const consentsQuery = supabase.from("consents").select("id, consent_type, consent_version, status, signed_at, expires_at, created_at").eq("clinic_id", clinicId).eq("patient_id", patientId).order("created_at", { ascending: false }).order("id", { ascending: false });
  const appointmentsQuery = supabase.from("appointments").select("id, doctor_id, title, appointment_type, starts_at, status").eq("clinic_id", clinicId).eq("patient_id", patientId).order("starts_at", { ascending: false }).order("id", { ascending: false });
  const [notesResult, consentsResult, appointmentsResult, templatesResult, doctorsResult, signaturesResult, documentsResult] = await Promise.all([
    supabase.from("medical_notes").select("id, doctor_id, appointment_id, template_id, status, specialty, clinical_impression, created_at").eq("clinic_id", clinicId).eq("patient_id", patientId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + pageSize - 1),
    searchParams.paginateDocuments ? consentsQuery.range(documentsFrom, documentsFrom + documentsPageSize - 1) : consentsQuery,
    searchParams.paginateAppointments ? appointmentsQuery.range(appointmentsFrom, appointmentsFrom + appointmentsPageSize - 1) : Promise.resolve({ data: [], error: null }),
    supabase.from("medical_note_templates").select("id, name, specialty, description, template_schema").or(`is_system_template.eq.true,clinic_id.eq.${clinicId}`).eq("is_active", true).order("name", { ascending: true }),
    supabase.from("doctor_public_profiles").select("profile_id, display_name").eq("clinic_id", clinicId),
    supabase.from("consent_signatures").select("consent_id, signer_full_name").eq("patient_id", patientId),
    supabase.from("consent_documents").select("consent_id, status").eq("clinic_id", clinicId).eq("patient_id", patientId)
  ]);
  if (notesResult.error || consentsResult.error || appointmentsResult.error || templatesResult.error || doctorsResult.error || signaturesResult.error || documentsResult.error) {
    logger.error("Clinical record data query failed", { component: "clinical_record", operation: "data", status: "query_error", notesCode: notesResult.error?.code, consentsCode: consentsResult.error?.code, appointmentsCode: appointmentsResult.error?.code, templatesCode: templatesResult.error?.code, doctorsCode: doctorsResult.error?.code, signaturesCode: signaturesResult.error?.code, documentsCode: documentsResult.error?.code });
    return { state: "error", data: null };
  }
  const doctors = new Map(((doctorsResult.data ?? []) as DoctorProfile[]).filter((row): row is DoctorProfile & { profile_id: string } => Boolean(row.profile_id)).map((row) => [row.profile_id, row.display_name]));
  const templates = (templatesResult.data ?? []) as ClinicalTemplate[];
  const templateNames = new Map(templates.map((template) => [template.id, template.name]));
  const signatures = (signaturesResult.data ?? []) as SignatureRow[];
  const signatureCounts = signatures.reduce<Map<string, number>>((counts, signature) => counts.set(signature.consent_id, (counts.get(signature.consent_id) ?? 0) + 1), new Map());
  const signerNames = new Map(signatures.map((signature) => [signature.consent_id, signature.signer_full_name]));
  const documentStatuses = new Map(((documentsResult.data ?? []) as DocumentRow[]).map((document) => [document.consent_id, document.status]));
  const notes = ((notesResult.data ?? []) as Omit<ClinicalRecordNote, "doctorName" | "templateName">[]).map((note) => ({ ...note, doctorName: note.doctor_id ? doctors.get(note.doctor_id) ?? null : null, templateName: note.template_id ? templateNames.get(note.template_id) ?? null : null }));
  const appointments = ((appointmentsResult.data ?? []) as Omit<ClinicalRecordAppointment, "doctorName">[]).map((appointment) => ({ ...appointment, doctorName: appointment.doctor_id ? doctors.get(appointment.doctor_id) ?? null : null }));
  const consents = ((consentsResult.data ?? []) as Omit<ClinicalRecordConsent, "signatureCount" | "signedBy" | "documentStatus">[]).map((consent) => ({ ...consent, signatureCount: signatureCounts.get(consent.id) ?? 0, signedBy: signerNames.get(consent.id) ?? null, documentStatus: documentStatuses.get(consent.id) ?? null }));
  return { state: "ready", data: {
    tenant: context.tenant, patient: patientResult.data, notes, totalNotes, page, pageCount,
    consents, totalDocuments: searchParams.paginateDocuments ? totalDocuments : consents.length,
    documentsPage, documentsPageCount: searchParams.paginateDocuments ? documentsPageCount : 1,
    appointments, totalAppointments, appointmentsPage, appointmentsPageCount,
    templates, signatureCount: signatures.length
  } };
}
