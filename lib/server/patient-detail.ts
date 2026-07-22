import "server-only";

import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { canViewClinicalRecord } from "@/lib/clinical-record/permissions";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { logger } from "@/lib/logger";
import { getActiveTenantContext, type ActiveTenant } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type PatientRow = Tables["patients"]["Row"];
type AppointmentRow = Tables["appointments"]["Row"];
type PaymentRow = Tables["payments"]["Row"];
type MedicalNoteRow = Tables["medical_notes"]["Row"];
type ConsentRow = Tables["consents"]["Row"];

export type PatientDetailRecord = Pick<
  PatientRow,
  | "id"
  | "full_name"
  | "status"
  | "email"
  | "phone"
  | "date_of_birth"
  | "sex"
  | "created_at"
  | "relevant_history"
>;

export type PatientDetailAppointment = Pick<
  AppointmentRow,
  "id" | "doctor_id" | "title" | "appointment_type" | "starts_at" | "status"
> & {
  doctorName: string | null;
};

export type PatientDetailPayment = Pick<
  PaymentRow,
  "id" | "amount" | "currency" | "status" | "concept" | "paid_at" | "created_at"
>;

export type PatientDetailMedicalNote = Pick<
  MedicalNoteRow,
  "id" | "status" | "specialty" | "clinical_impression" | "finalized_at" | "created_at"
>;

export type PatientDetailConsent = Pick<
  ConsentRow,
  "id" | "consent_type" | "status" | "signed_at" | "expires_at" | "created_at"
>;

export type PatientDetailData = {
  tenant: ActiveTenant;
  localDate: string;
  patient: PatientDetailRecord;
  upcomingAppointments: PatientDetailAppointment[];
  recentAppointments: PatientDetailAppointment[];
  payments: PatientDetailPayment[];
  medicalNotes: PatientDetailMedicalNote[];
  consents: PatientDetailConsent[];
};

export type PatientDetailResult =
  | { state: "ready"; data: PatientDetailData }
  | { state: "invalid_id"; data: null }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "not_found"; data: null }
  | { state: "error"; data: null };

type DoctorProfile = {
  profile_id: string | null;
  display_name: string;
};

function withDoctorNames(
  appointments: Omit<PatientDetailAppointment, "doctorName">[],
  profiles: DoctorProfile[]
): PatientDetailAppointment[] {
  const names = new Map(
    profiles
      .filter((profile): profile is DoctorProfile & { profile_id: string } => Boolean(profile.profile_id))
      .map((profile) => [profile.profile_id, profile.display_name])
  );

  return appointments.map((appointment) => ({
    ...appointment,
    doctorName: appointment.doctor_id ? names.get(appointment.doctor_id) ?? null : null
  }));
}

export async function getPatientDetailForActiveTenant(id: string): Promise<PatientDetailResult> {
  if (!isValidPatientUuid(id)) {
    return { state: "invalid_id", data: null };
  }

  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const patientResult = await supabase
    .from("patients")
    .select("id, full_name, status, email, phone, date_of_birth, sex, created_at, relevant_history")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (patientResult.error) {
    logger.error("Patient detail query failed", {
      component: "patient_detail",
      status: "patient_query_error",
      code: patientResult.error.code
    });
    return { state: "error", data: null };
  }

  if (!patientResult.data) {
    return { state: "not_found", data: null };
  }

  let localDate: string;

  try {
    localDate = getClinicDayRange(context.tenant.clinic.timezone).localDate;
  } catch {
    logger.error("Patient detail clinic timezone is invalid", {
      component: "patient_detail",
      status: "timezone_error"
    });
    return { state: "error", data: null };
  }

  const now = new Date().toISOString();
  const canViewClinical = canViewClinicalRecord(context.tenant.membership.role);
  const [
    upcomingResult,
    recentResult,
    paymentsResult,
    medicalNotesResult,
    consentsResult,
    doctorProfilesResult
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, doctor_id, title, appointment_type, starts_at, status")
      .eq("clinic_id", clinicId)
      .eq("patient_id", id)
      .gte("starts_at", now)
      .in("status", ["scheduled", "confirmed", "waiting"])
      .order("starts_at", { ascending: true })
      .limit(5),
    supabase
      .from("appointments")
      .select("id, doctor_id, title, appointment_type, starts_at, status")
      .eq("clinic_id", clinicId)
      .eq("patient_id", id)
      .lt("starts_at", now)
      .order("starts_at", { ascending: false })
      .limit(5),
    supabase
      .from("payments")
      .select("id, amount, currency, status, concept, paid_at, created_at")
      .eq("clinic_id", clinicId)
      .eq("patient_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    canViewClinical
      ? supabase
          .from("medical_notes")
          .select("id, status, specialty, clinical_impression, finalized_at, created_at")
          .eq("clinic_id", clinicId)
          .eq("patient_id", id)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    canViewClinical
      ? supabase
          .from("consents")
          .select("id, consent_type, status, signed_at, expires_at, created_at")
          .eq("clinic_id", clinicId)
          .eq("patient_id", id)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("doctor_public_profiles")
      .select("profile_id, display_name")
      .eq("clinic_id", clinicId)
      .limit(100)
  ]);

  const queryErrors = {
    upcomingCode: upcomingResult.error?.code,
    recentCode: recentResult.error?.code,
    paymentsCode: paymentsResult.error?.code,
    medicalNotesCode: medicalNotesResult.error?.code,
    consentsCode: consentsResult.error?.code,
    doctorsCode: doctorProfilesResult.error?.code
  };

  if (Object.values(queryErrors).some(Boolean)) {
    logger.error("Patient related data query failed", {
      component: "patient_detail",
      status: "related_query_error",
      ...queryErrors
    });
    return { state: "error", data: null };
  }

  const doctorProfiles = (doctorProfilesResult.data ?? []) as DoctorProfile[];

  return {
    state: "ready",
    data: {
      tenant: context.tenant,
      localDate,
      patient: patientResult.data as PatientDetailRecord,
      upcomingAppointments: withDoctorNames(
        (upcomingResult.data ?? []) as Omit<PatientDetailAppointment, "doctorName">[],
        doctorProfiles
      ),
      recentAppointments: withDoctorNames(
        (recentResult.data ?? []) as Omit<PatientDetailAppointment, "doctorName">[],
        doctorProfiles
      ),
      payments: (paymentsResult.data ?? []) as PatientDetailPayment[],
      medicalNotes: (medicalNotesResult.data ?? []) as PatientDetailMedicalNote[],
      consents: (consentsResult.data ?? []) as PatientDetailConsent[]
    }
  };
}
