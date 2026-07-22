import "server-only";

import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { logger } from "@/lib/logger";
import { getActiveTenantContext, type ActiveTenant } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type AppointmentDetailRow = Pick<
  AppointmentRow,
  | "id"
  | "patient_id"
  | "doctor_id"
  | "title"
  | "appointment_type"
  | "location"
  | "meeting_url"
  | "starts_at"
  | "ends_at"
  | "status"
  | "created_at"
>;

type PatientRelation = { id: string; full_name: string };
type DoctorRelation = { display_name: string };

export type AppointmentDetailData = {
  tenant: ActiveTenant;
  appointment: AppointmentDetailRow;
  patient: PatientRelation | null;
  doctor: DoctorRelation | null;
};

export type AppointmentDetailResult =
  | { state: "ready"; data: AppointmentDetailData }
  | { state: "invalid_id"; data: null }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "not_found"; data: null }
  | { state: "error"; data: null };

const appointmentDetailColumns =
  "id, patient_id, doctor_id, title, appointment_type, location, meeting_url, starts_at, ends_at, status, created_at";

export async function getAppointmentDetailForActiveTenant(
  appointmentId: string
): Promise<AppointmentDetailResult> {
  if (!isCanonicalAppointmentUuid(appointmentId)) {
    return { state: "invalid_id", data: null };
  }

  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const appointmentResult = await supabase
    .from("appointments")
    .select(appointmentDetailColumns)
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (appointmentResult.error) {
    logger.error("Appointment detail query failed", {
      component: "appointment_detail",
      status: "appointment_query_error",
      code: appointmentResult.error.code
    });
    return { state: "error", data: null };
  }

  if (!appointmentResult.data) {
    return { state: "not_found", data: null };
  }

  const appointment = appointmentResult.data as AppointmentDetailRow;
  const [patientResult, doctorResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name")
      .eq("id", appointment.patient_id)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    appointment.doctor_id
      ? supabase
          .from("doctor_public_profiles")
          .select("display_name")
          .eq("profile_id", appointment.doctor_id)
          .eq("clinic_id", clinicId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (patientResult.error || doctorResult.error) {
    logger.error("Appointment detail relation query failed", {
      component: "appointment_detail",
      status: "relation_query_error",
      patientCode: patientResult.error?.code,
      doctorCode: doctorResult.error?.code
    });
    return { state: "error", data: null };
  }

  return {
    state: "ready",
    data: {
      tenant: context.tenant,
      appointment,
      patient: (patientResult.data as PatientRelation | null) ?? null,
      doctor: (doctorResult.data as DoctorRelation | null) ?? null
    }
  };
}
