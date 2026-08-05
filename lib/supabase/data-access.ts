import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];

export type PatientRow = Tables["patients"]["Row"];
export type AppointmentRow = Tables["appointments"]["Row"];
export type PaymentRow = Tables["payments"]["Row"];
export type MedicalNoteRow = Tables["medical_notes"]["Row"];

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: userError };
  }

  return supabase.from("profiles").select("*").eq("id", user.id).single();
}

export async function listPatientsForClinic(clinicId: string) {
  const supabase = await createClient();

  return supabase
    .from("patients")
    .select("id, clinic_id, primary_doctor_id, full_name, first_names, paternal_surname, maternal_surname, date_of_birth, sex, gender_identity, phone, email, address, marital_status, occupation, education_level, internal_identifier, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, status, created_by, created_at, updated_by, updated_at, archived_at")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
}

export async function listAppointmentsForClinic(clinicId: string) {
  const supabase = await createClient();

  return supabase
    .from("appointments")
    .select("*, patients(full_name)")
    .eq("clinic_id", clinicId)
    .order("starts_at", { ascending: true });
}

export async function listPaymentsForClinic(clinicId: string) {
  const supabase = await createClient();

  return supabase
    .from("payments")
    .select("*, patients(full_name)")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
}

export async function listMedicalNotesForPatient(patientId: string) {
  const supabase = await createClient();

  return supabase
    .from("medical_notes")
    .select("*, medical_note_templates(name, specialty)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
}
