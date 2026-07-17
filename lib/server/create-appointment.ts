import "server-only";

import {
  calculateAppointmentEnd,
  canCreateAppointments,
  combineClinicDateTime,
  validateAppointmentFormValues,
  type AppointmentFieldErrors,
  type AppointmentFormValues
} from "@/lib/appointments/create";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PatientStatus = Database["public"]["Enums"]["patient_status"];
type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type PatientOptionRow = Pick<PatientRow, "id" | "full_name" | "status">;
type AppointmentInsert = Database["public"]["Tables"]["appointments"]["Insert"];

export type AppointmentPatientOption = {
  id: string;
  name: string;
  status: PatientStatus;
};

export type AppointmentDoctorOption = {
  id: string;
  name: string;
};

export type AppointmentCreationOptions = {
  patients: AppointmentPatientOption[];
  doctors: AppointmentDoctorOption[];
  preselectedPatientId: string;
  clinicToday: string;
  timeZone: string;
};

export type AppointmentCreationOptionsResult =
  | { state: "ready"; data: AppointmentCreationOptions }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "forbidden"; data: null }
  | { state: "error"; data: null };

export type CreateAppointmentResult =
  | { state: "success"; date: string; patientId: string }
  | { state: "unauthenticated" }
  | { state: "no_active_membership" }
  | { state: "forbidden" }
  | {
      state: "validation_error";
      error: string;
      fieldErrors?: AppointmentFieldErrors;
      values: AppointmentFormValues;
    }
  | {
      state: "conflict";
      error: string;
      fieldErrors?: AppointmentFieldErrors;
      values: AppointmentFormValues;
    }
  | {
      state: "error";
      error: string;
      fieldErrors?: AppointmentFieldErrors;
      values: AppointmentFormValues;
    };

type DoctorProfileRow = {
  profile_id: string | null;
  display_name: string;
};

export async function getAppointmentCreationOptions(
  requestedPatientId?: string
): Promise<AppointmentCreationOptionsResult> {
  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  if (!canCreateAppointments(context.tenant.membership.role)) {
    return { state: "forbidden", data: null };
  }

  let clinicToday: string;

  try {
    clinicToday = getClinicDayRange(context.tenant.clinic.timezone).localDate;
  } catch {
    logger.error("Appointment creation clinic timezone is invalid", {
      component: "create_appointment",
      status: "timezone_error"
    });
    return { state: "error", data: null };
  }

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const [patientsResult, doctorsResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, status")
      .eq("clinic_id", clinicId)
      .order("full_name", { ascending: true }),
    supabase
      .from("doctor_public_profiles")
      .select("profile_id, display_name")
      .eq("clinic_id", clinicId)
      .not("profile_id", "is", null)
      .order("display_name", { ascending: true })
      .limit(100)
  ]);

  if (patientsResult.error || doctorsResult.error) {
    logger.error("Appointment creation options query failed", {
      component: "create_appointment",
      status: "options_query_error",
      patientsCode: patientsResult.error?.code,
      doctorsCode: doctorsResult.error?.code
    });
    return { state: "error", data: null };
  }

  const patients = ((patientsResult.data ?? []) as PatientOptionRow[]).map((patient) => ({
    id: patient.id,
    name: patient.full_name,
    status: patient.status as PatientStatus
  }));
  const doctors = ((doctorsResult.data ?? []) as DoctorProfileRow[])
    .filter((doctor): doctor is DoctorProfileRow & { profile_id: string } => Boolean(doctor.profile_id))
    .reduce<AppointmentDoctorOption[]>((options, doctor) => {
      if (!options.some((option) => option.id === doctor.profile_id)) {
        options.push({ id: doctor.profile_id, name: doctor.display_name });
      }

      return options;
    }, []);
  const preselectedPatientId =
    requestedPatientId &&
    isCanonicalAppointmentUuid(requestedPatientId) &&
    patients.some((patient) => patient.id === requestedPatientId)
      ? requestedPatientId
      : "";

  return {
    state: "ready",
    data: {
      patients,
      doctors,
      preselectedPatientId,
      clinicToday,
      timeZone: context.tenant.clinic.timezone
    }
  };
}

export async function createAppointmentForActiveTenant(
  values: AppointmentFormValues
): Promise<CreateAppointmentResult> {
  const context = await getActiveTenantContext();

  if (context.state === "error") {
    return {
      state: "error",
      error: "No fue posible resolver la clínica activa. Intenta nuevamente.",
      values
    };
  }

  if (context.state !== "ready") {
    return { state: context.state };
  }

  if (!canCreateAppointments(context.tenant.membership.role)) {
    return { state: "forbidden" };
  }

  const validation = validateAppointmentFormValues(values);

  if (!validation.valid) {
    return {
      state: "validation_error",
      error: "Revisa los campos marcados antes de crear la cita.",
      fieldErrors: validation.fieldErrors,
      values
    };
  }

  const input = validation.data;
  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const [patientResult, doctorResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("id", input.patientId)
      .maybeSingle(),
    supabase
      .from("doctor_public_profiles")
      .select("profile_id")
      .eq("clinic_id", clinicId)
      .eq("profile_id", input.doctorId)
      .limit(1)
      .maybeSingle()
  ]);

  if (patientResult.error || doctorResult.error) {
    logger.error("Appointment creation relation validation failed", {
      component: "create_appointment",
      status: "relation_query_error",
      patientCode: patientResult.error?.code,
      doctorCode: doctorResult.error?.code
    });
    return {
      state: "error",
      error: "No fue posible validar los datos seleccionados. Intenta nuevamente.",
      values
    };
  }

  const relationErrors: AppointmentFieldErrors = {};

  if (!patientResult.data) {
    relationErrors.patientId = "El paciente seleccionado no pertenece a la clínica activa.";
  }

  if (!doctorResult.data) {
    relationErrors.doctorId = "El médico seleccionado no pertenece a la clínica activa.";
  }

  if (Object.keys(relationErrors).length > 0) {
    return {
      state: "validation_error",
      error: "Revisa el paciente y el médico seleccionados.",
      fieldErrors: relationErrors,
      values
    };
  }

  const localDateTime = combineClinicDateTime(input.date, input.startTime, context.tenant.clinic.timezone);

  if (localDateTime.state !== "valid") {
    const error =
      localDateTime.state === "ambiguous"
        ? "La hora elegida ocurre dos veces por el cambio de horario. Selecciona otra hora."
        : localDateTime.state === "nonexistent"
          ? "La hora elegida no existe en la zona horaria de la clínica."
          : "La zona horaria de la clínica no es válida.";

    return {
      state: "validation_error",
      error: "No fue posible interpretar el horario.",
      fieldErrors: { startTime: error },
      values
    };
  }

  const startsAt = localDateTime.iso;
  const endsAt = calculateAppointmentEnd(startsAt, input.duration);
  const conflictResult = await supabase
    .from("appointments")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("doctor_id", input.doctorId)
    .neq("status", "cancelled")
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .limit(1)
    .maybeSingle();

  if (conflictResult.error) {
    logger.error("Appointment conflict query failed", {
      component: "create_appointment",
      status: "conflict_query_error",
      code: conflictResult.error.code
    });
    return {
      state: "error",
      error: "No fue posible verificar la disponibilidad. Intenta nuevamente.",
      values
    };
  }

  if (conflictResult.data) {
    return {
      state: "conflict",
      error: "El médico ya tiene una cita que se cruza con ese horario. Elige otro horario.",
      fieldErrors: { startTime: "Horario no disponible para el médico seleccionado." },
      values
    };
  }

  const insertValues = {
    clinic_id: clinicId,
    patient_id: input.patientId,
    doctor_id: input.doctorId,
    title: input.title,
    appointment_type: input.appointmentType,
    location: input.location,
    meeting_url: input.meetingUrl,
    starts_at: startsAt,
    ends_at: endsAt,
    status: input.status
  } satisfies AppointmentInsert;
  // The hand-maintained Database type lacks generated relationship metadata, so this table infers insert as never.
  const insertResult = await supabase.from("appointments").insert(insertValues as never);

  if (insertResult.error) {
    logger.error("Appointment insert failed", {
      component: "create_appointment",
      status: "insert_error",
      code: insertResult.error.code
    });
    return {
      state: "error",
      error: "No fue posible crear la cita. Intenta nuevamente.",
      values
    };
  }

  return { state: "success", date: input.date, patientId: input.patientId };
}
