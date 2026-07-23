import "server-only";

import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { mergeClinicalNoteContent, validateClinicalNoteValues, type ClinicalNoteFormValues } from "@/lib/clinical-record/notes";
import { canCreateClinicalNote, canEditClinicalNote, canUseClinicalTemplate, canViewClinicalRecord } from "@/lib/clinical-record/permissions";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type NoteRow = Tables["medical_notes"]["Row"];
type TemplateRow = Tables["medical_note_templates"]["Row"];
type NoteInsert = Tables["medical_notes"]["Insert"];

export type NoteTemplateOption = Pick<TemplateRow, "id" | "name" | "specialty" | "template_schema">;
export type NoteAppointmentOption = { id: string; title: string; starts_at: string };
export type ClinicalNoteFormOptions = { patient: { id: string; full_name: string }; templates: NoteTemplateOption[]; appointments: NoteAppointmentOption[]; timeZone: string };
export type ClinicalNoteDetail = Pick<NoteRow, "id" | "doctor_id" | "appointment_id" | "template_id" | "status" | "specialty" | "clinical_impression" | "diagnosis" | "icd10_code" | "note_data" | "created_at" | "updated_at"> & { doctorName: string | null; templateName: string | null; appointmentTitle: string | null };
type BaseResult<T> = { state: "ready"; data: T } | { state: "invalid_id" | "unauthenticated" | "no_active_membership" | "forbidden" | "not_found" | "error"; data: null };

async function resolvePatient(patientId: string, requireCreate = false): Promise<BaseResult<{ context: Awaited<ReturnType<typeof getActiveTenantContext>> & { state: "ready" }; supabase: Awaited<ReturnType<typeof createClient>>; patient: { id: string; full_name: string } }>> {
  if (!isValidPatientUuid(patientId)) return { state: "invalid_id", data: null };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };
  if (requireCreate ? !canCreateClinicalNote(context.tenant.membership.role) : !canViewClinicalRecord(context.tenant.membership.role)) return { state: "forbidden", data: null };
  const supabase = await createClient();
  const patientResult = await supabase.from("patients").select("id, full_name").eq("id", patientId).eq("clinic_id", context.tenant.clinic.id).maybeSingle();
  if (patientResult.error) {
    logger.error("Clinical note patient query failed", { component: "clinical_notes", operation: "patient", status: "query_error", code: patientResult.error.code });
    return { state: "error", data: null };
  }
  if (!patientResult.data) return { state: "not_found", data: null };
  return { state: "ready", data: { context, supabase, patient: patientResult.data } };
}

export async function getClinicalNoteFormOptions(patientId: string): Promise<BaseResult<ClinicalNoteFormOptions>> {
  const resolved = await resolvePatient(patientId, true);
  if (resolved.state !== "ready") return resolved;
  const { context, supabase, patient } = resolved.data;
  const [templatesResult, appointmentsResult] = await Promise.all([
    supabase.from("medical_note_templates").select("id, name, specialty, template_schema").eq("clinic_id", context.tenant.clinic.id).eq("template_kind", "note").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("appointments").select("id, title, starts_at").eq("clinic_id", context.tenant.clinic.id).eq("patient_id", patient.id).order("starts_at", { ascending: false }).limit(30)
  ]);
  if (templatesResult.error || appointmentsResult.error) {
    logger.error("Clinical note form options failed", { component: "clinical_notes", operation: "form_options", status: "query_error", templatesCode: templatesResult.error?.code, appointmentsCode: appointmentsResult.error?.code });
    return { state: "error", data: null };
  }
  return { state: "ready", data: { patient, templates: (templatesResult.data ?? []) as NoteTemplateOption[], appointments: (appointmentsResult.data ?? []) as NoteAppointmentOption[], timeZone: context.tenant.clinic.timezone } };
}

export async function getClinicalNoteForActiveTenant(patientId: string, noteId: string): Promise<BaseResult<{ note: ClinicalNoteDetail; canEdit: boolean; timeZone: string }>> {
  if (!isCanonicalAppointmentUuid(noteId)) return { state: "invalid_id", data: null };
  const resolved = await resolvePatient(patientId);
  if (resolved.state !== "ready") return resolved;
  const { context, supabase, patient } = resolved.data;
  const noteResult = await supabase.from("medical_notes").select("id, doctor_id, appointment_id, template_id, status, specialty, clinical_impression, diagnosis, icd10_code, note_data, created_at, updated_at").eq("id", noteId).eq("clinic_id", context.tenant.clinic.id).eq("patient_id", patient.id).maybeSingle();
  if (noteResult.error) { logger.error("Clinical note query failed", { component: "clinical_notes", operation: "detail", status: "query_error", code: noteResult.error.code }); return { state: "error", data: null }; }
  if (!noteResult.data) return { state: "not_found", data: null };
  const note = noteResult.data as Omit<ClinicalNoteDetail, "doctorName" | "templateName" | "appointmentTitle">;
  const [doctorResult, templateResult, appointmentResult] = await Promise.all([
    note.doctor_id ? supabase.from("doctor_public_profiles").select("display_name").eq("clinic_id", context.tenant.clinic.id).eq("profile_id", note.doctor_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    note.template_id ? supabase.from("medical_note_templates").select("name").eq("clinic_id", context.tenant.clinic.id).eq("id", note.template_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    note.appointment_id ? supabase.from("appointments").select("title").eq("clinic_id", context.tenant.clinic.id).eq("patient_id", patient.id).eq("id", note.appointment_id).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);
  if (doctorResult.error || templateResult.error || appointmentResult.error) { logger.error("Clinical note relations failed", { component: "clinical_notes", operation: "relations", status: "query_error", doctorCode: doctorResult.error?.code, templateCode: templateResult.error?.code, appointmentCode: appointmentResult.error?.code }); return { state: "error", data: null }; }
  const doctor = doctorResult.data as { display_name: string } | null;
  const template = templateResult.data as { name: string } | null;
  const appointment = appointmentResult.data as { title: string } | null;
  return { state: "ready", data: { note: { ...note, doctorName: doctor?.display_name ?? null, templateName: template?.name ?? null, appointmentTitle: appointment?.title ?? null }, canEdit: canEditClinicalNote({ role: context.tenant.membership.role, authorId: note.doctor_id, currentUserId: context.user.id, status: note.status }), timeZone: context.tenant.clinic.timezone } };
}

export async function createClinicalNoteForActiveTenant(patientId: string, values: ClinicalNoteFormValues) {
  const resolved = await resolvePatient(patientId, true);
  if (resolved.state !== "ready") return resolved;
  const validation = validateClinicalNoteValues(values);
  if (!validation.valid) return { state: "validation_error" as const, error: "Revisa los campos marcados.", errors: validation.errors, values };
  const { context, supabase, patient } = resolved.data;
  const input = validation.data;
  if (input.templateId && (!isCanonicalAppointmentUuid(input.templateId) || !canUseClinicalTemplate(context.tenant.membership.role))) return { state: "validation_error" as const, error: "La plantilla seleccionada no es válida.", errors: { templateId: "Selecciona una plantilla disponible." }, values };
  if (input.appointmentId && !isCanonicalAppointmentUuid(input.appointmentId)) return { state: "validation_error" as const, error: "La cita seleccionada no es válida.", errors: { appointmentId: "Selecciona una cita válida." }, values };
  const [templateResult, appointmentResult] = await Promise.all([
    input.templateId ? supabase.from("medical_note_templates").select("id").eq("id", input.templateId).eq("clinic_id", context.tenant.clinic.id).eq("template_kind", "note").eq("is_active", true).maybeSingle() : Promise.resolve({ data: null, error: null }),
    input.appointmentId ? supabase.from("appointments").select("id").eq("id", input.appointmentId).eq("clinic_id", context.tenant.clinic.id).eq("patient_id", patient.id).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);
  if (templateResult.error || appointmentResult.error) { logger.error("Clinical note relation validation failed", { component: "clinical_notes", operation: "create_relations", status: "query_error", templateCode: templateResult.error?.code, appointmentCode: appointmentResult.error?.code }); return { state: "error" as const, error: "No fue posible validar las relaciones.", values }; }
  if (input.templateId && !templateResult.data) return { state: "validation_error" as const, error: "La plantilla no está disponible.", errors: { templateId: "Selecciona una plantilla disponible." }, values };
  if (input.appointmentId && !appointmentResult.data) return { state: "validation_error" as const, error: "La cita no corresponde a este paciente.", errors: { appointmentId: "Selecciona una cita válida." }, values };
  const insert: NoteInsert = { clinic_id: context.tenant.clinic.id, patient_id: patient.id, doctor_id: context.user.id, appointment_id: input.appointmentId, template_id: input.templateId, status: "draft", specialty: input.specialty, clinical_impression: input.clinicalImpression, note_data: { content: input.content } };
  // The hand-maintained Database type lacks generated relationship metadata, so this table infers insert as never.
  const insertResult = (await supabase.from("medical_notes").insert(insert as never).select("id").single()) as unknown as {
    data: { id: string } | null;
    error: { code: string } | null;
  };
  if (insertResult.error || !insertResult.data) { logger.error("Clinical note insert failed", { component: "clinical_notes", operation: "create", status: insertResult.error ? "insert_error" : "missing_result", code: insertResult.error?.code }); return { state: "error" as const, error: "No fue posible crear la nota clínica.", values }; }
  return { state: "success" as const, noteId: insertResult.data.id, patientId: patient.id };
}

export async function updateClinicalNoteForActiveTenant(patientId: string, noteId: string, values: ClinicalNoteFormValues) {
  if (!isCanonicalAppointmentUuid(noteId)) return { state: "invalid_id" as const };
  const resolved = await resolvePatient(patientId);
  if (resolved.state !== "ready") return resolved;
  const validation = validateClinicalNoteValues(values);
  if (!validation.valid || !values.expectedUpdatedAt) return { state: "validation_error" as const, error: "Revisa los campos marcados.", errors: validation.valid ? { expectedUpdatedAt: "Actualiza la página e intenta nuevamente." } : validation.errors, values };
  const { context, supabase, patient } = resolved.data;
  const noteResult = await supabase.from("medical_notes").select("id, doctor_id, status, note_data").eq("id", noteId).eq("clinic_id", context.tenant.clinic.id).eq("patient_id", patient.id).maybeSingle();
  if (noteResult.error) { logger.error("Clinical note update query failed", { component: "clinical_notes", operation: "update_lookup", status: "query_error", code: noteResult.error.code }); return { state: "error" as const, error: "No fue posible validar la nota.", values }; }
  if (!noteResult.data) return { state: "not_found" as const };
  const note = noteResult.data as Pick<NoteRow, "id" | "doctor_id" | "status" | "note_data">;
  if (!canEditClinicalNote({ role: context.tenant.membership.role, authorId: note.doctor_id, currentUserId: context.user.id, status: note.status })) return { state: "forbidden" as const };
  const input = validation.data;
  const updateResult = await supabase.from("medical_notes").update({ specialty: input.specialty, clinical_impression: input.clinicalImpression, note_data: mergeClinicalNoteContent(note.note_data, input.content) } as never).eq("id", noteId).eq("clinic_id", context.tenant.clinic.id).eq("patient_id", patient.id).eq("updated_at", values.expectedUpdatedAt).select("id").maybeSingle();
  if (updateResult.error) { logger.error("Clinical note update failed", { component: "clinical_notes", operation: "update", status: "query_error", code: updateResult.error.code }); return { state: "error" as const, error: "No fue posible actualizar la nota clínica.", values }; }
  if (!updateResult.data) return { state: "stale_update" as const, error: "La nota cambió en otra sesión. Actualiza la página e intenta nuevamente.", values };
  return { state: "success" as const, noteId, patientId: patient.id };
}
