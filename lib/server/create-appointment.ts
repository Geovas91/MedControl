import "server-only";

import {
  calculateAppointmentEnd,
  canCreateAppointments,
  classifyAppointmentPersistenceError,
  combineClinicDateTime,
  validateAppointmentFormValues,
  type AppointmentFieldErrors,
  type AppointmentFormValues
} from "@/lib/appointments/create";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { buildAppointmentCalendarOperation } from "@/lib/calendar/invitation";
import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canCreateWithEntitlements, getClinicEntitlements } from "@/lib/server/entitlements";
import { listClinicMembersForClinic } from "@/lib/supabase/clinic-members";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PatientStatus = Database["public"]["Enums"]["patient_status"];
type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type PatientOptionRow = Pick<PatientRow, "id" | "full_name" | "status">;

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
  | { state: "success"; appointmentId: string; date: string; patientId: string; operationKey: string; appointmentVersion: string }
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

type ProfessionalMemberRow = {
  user_id: string;
};

type AppointmentCreationRpcRow = {
  appointment_id: string;
  appointment_updated_at: string;
};

type AppointmentCreationRpcClient = {
  rpc(
    fn: "create_appointment_for_current_user",
    args: {
      p_clinic_id: string;
      p_patient_id: string;
      p_doctor_id: string;
      p_title: string;
      p_appointment_type: string | null;
      p_location: string | null;
      p_meeting_url: string | null;
      p_starts_at: string;
      p_ends_at: string;
    }
  ): Promise<{ data: AppointmentCreationRpcRow[] | null; error: { code: string } | null }>;
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

  if (!canCreateWithEntitlements(await getClinicEntitlements(context.tenant.clinic.id))) {
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
  const [patientsResult, professionalsResult, doctorProfilesResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, status")
      .eq("clinic_id", clinicId)
      .order("full_name", { ascending: true }),
    supabase
      .from("clinic_members")
      .select("user_id")
      .eq("clinic_id", clinicId)
      .eq("status", "active")
      .eq("is_professional", true),
    supabase
      .from("doctor_public_profiles")
      .select("profile_id, display_name")
      .eq("clinic_id", clinicId)
  ]);

  if (patientsResult.error || professionalsResult.error || doctorProfilesResult.error) {
    logger.error("Appointment creation options query failed", {
      component: "create_appointment",
      status: "options_query_error",
      patientsCode: patientsResult.error?.code,
      professionalsCode: professionalsResult.error?.code,
      doctorProfilesCode: doctorProfilesResult.error?.code
    });
    return { state: "error", data: null };
  }

  const patients = ((patientsResult.data ?? []) as PatientOptionRow[]).map((patient) => ({
    id: patient.id,
    name: patient.full_name,
    status: patient.status as PatientStatus
  }));
  const profileNames = new Map(
    ((doctorProfilesResult.data ?? []) as DoctorProfileRow[])
      .filter((profile): profile is DoctorProfileRow & { profile_id: string } => Boolean(profile.profile_id))
      .map((profile) => [profile.profile_id, profile.display_name])
  );
  const doctors = ((professionalsResult.data ?? []) as ProfessionalMemberRow[])
    .map((professional) => ({ id: professional.user_id, name: profileNames.get(professional.user_id) ?? "Profesional" }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
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

  const entitlements = await getClinicEntitlements(context.tenant.clinic.id);
  if (!canCreateWithEntitlements(entitlements)) {
    return { state: "forbidden", values } as CreateAppointmentResult;
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
  const [patientResult, professionalsResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("id", input.patientId)
      .maybeSingle(),
    listClinicMembersForClinic(clinicId)
  ]);

  if (patientResult.error || professionalsResult.error) {
    logger.error("Appointment creation relation validation failed", {
      component: "create_appointment",
      status: "relation_query_error",
      patientCode: patientResult.error?.code,
      doctorCode: professionalsResult.error?.code
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

  const doctor = (professionalsResult.data ?? []).find((member) =>
    member.clinic_id === clinicId && member.user_id === input.doctorId && member.status === "active" && member.is_professional
  );
  if (!doctor) {
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
    .select("id, updated_at")
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

  const insertResult = await (supabase as unknown as AppointmentCreationRpcClient).rpc(
    "create_appointment_for_current_user",
    {
      p_clinic_id: clinicId,
      p_patient_id: input.patientId,
      p_doctor_id: input.doctorId,
      p_title: input.title,
      p_appointment_type: input.appointmentType,
      p_location: input.location,
      p_meeting_url: input.meetingUrl,
      p_starts_at: startsAt,
      p_ends_at: endsAt
    }
  );
  const persistenceError = classifyAppointmentPersistenceError(insertResult.error?.code);

  if (insertResult.error && persistenceError === "conflict") {
    return {
      state: "conflict",
      error: "El médico ya tiene una cita que se cruza con ese horario. Elige otro horario.",
      fieldErrors: { startTime: "Horario no disponible para el médico seleccionado." },
      values
    };
  }

  if (insertResult.error && persistenceError === "forbidden") {
    return { state: "forbidden" };
  }

  if (insertResult.error && persistenceError === "relation_invalid") {
    return {
      state: "validation_error",
      error: "El paciente o el médico ya no están disponibles para esta clínica.",
      values
    };
  }

  const createdAppointment = insertResult.data?.[0] ?? null;

  if (insertResult.error || !createdAppointment) {
    logger.error("Appointment insert failed", {
      component: "create_appointment",
      status: insertResult.error ? "insert_error" : "missing_result",
      code: insertResult.error?.code
    });
    return {
      state: "error",
      error: "No fue posible crear la cita. Intenta nuevamente.",
      values
    };
  }

  const calendarOperation = buildAppointmentCalendarOperation(
    createdAppointment.appointment_id,
    "created",
    createdAppointment.appointment_updated_at
  );

  return {
    state: "success",
    appointmentId: createdAppointment.appointment_id,
    date: input.date,
    patientId: input.patientId,
    ...calendarOperation
  };
}
