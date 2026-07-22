import "server-only";

import {
  buildAppointmentUpdate,
  canEditAppointments,
  getAppointmentEditEnd,
  getAppointmentEditInitialValues,
  validateAppointmentEditFormValues,
  type EditableAppointment
} from "@/lib/appointments/edit";
import {
  combineClinicDateTime,
  type AppointmentFieldErrors,
  type AppointmentFormValues
} from "@/lib/appointments/create";
import { isCanonicalAppointmentUuid } from "@/lib/appointments/query";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PatientStatus = Database["public"]["Enums"]["patient_status"];
type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type PatientOptionRow = Pick<PatientRow, "id" | "full_name" | "status">;

export type AppointmentEditPatientOption = {
  id: string;
  name: string;
  status: PatientStatus;
};

export type AppointmentEditDoctorOption = {
  id: string;
  name: string;
};

type DoctorProfileRow = {
  profile_id: string | null;
  display_name: string;
};

export type AppointmentEditData = {
  appointment: EditableAppointment;
  initialValues: AppointmentFormValues;
  patients: AppointmentEditPatientOption[];
  doctors: AppointmentEditDoctorOption[];
  timeZone: string;
};

export type AppointmentEditResult =
  | { state: "ready"; data: AppointmentEditData }
  | { state: "invalid_id"; data: null }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "forbidden"; data: null }
  | { state: "not_found"; data: null }
  | { state: "error"; data: null };

export type UpdateAppointmentResult =
  | { state: "success"; date: string; oldDate: string; patientId: string; oldPatientId: string }
  | { state: "invalid_id" }
  | { state: "unauthenticated" }
  | { state: "no_active_membership" }
  | { state: "forbidden" }
  | { state: "not_found" }
  | {
      state: "validation_error" | "conflict" | "error";
      error: string;
      fieldErrors?: AppointmentFieldErrors;
      values: AppointmentFormValues;
    };

const editableAppointmentColumns =
  "id, patient_id, doctor_id, title, appointment_type, location, starts_at, ends_at, status";

function mapPatients(rows: PatientOptionRow[]) {
  return rows.map((patient) => ({
    id: patient.id,
    name: patient.full_name,
    status: patient.status
  }));
}

function mapDoctors(rows: DoctorProfileRow[]) {
  return rows
    .filter((doctor): doctor is DoctorProfileRow & { profile_id: string } => Boolean(doctor.profile_id))
    .reduce<AppointmentEditDoctorOption[]>((options, doctor) => {
      if (!options.some((option) => option.id === doctor.profile_id)) {
        options.push({ id: doctor.profile_id, name: doctor.display_name });
      }
      return options;
    }, []);
}

export async function getAppointmentEditForActiveTenant(appointmentId: string): Promise<AppointmentEditResult> {
  if (!isCanonicalAppointmentUuid(appointmentId)) {
    return { state: "invalid_id", data: null };
  }

  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  if (!canEditAppointments(context.tenant.membership.role)) {
    return { state: "forbidden", data: null };
  }

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const [appointmentResult, patientsResult, doctorsResult] = await Promise.all([
    supabase
      .from("appointments")
      .select(editableAppointmentColumns)
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
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

  if (appointmentResult.error || patientsResult.error || doctorsResult.error) {
    logger.error("Appointment edit context query failed", {
      component: "edit_appointment",
      status: "context_query_error",
      appointmentCode: appointmentResult.error?.code,
      patientsCode: patientsResult.error?.code,
      doctorsCode: doctorsResult.error?.code
    });
    return { state: "error", data: null };
  }

  if (!appointmentResult.data) {
    return { state: "not_found", data: null };
  }

  const appointment = appointmentResult.data as EditableAppointment;
  const initialValues = getAppointmentEditInitialValues(appointment, context.tenant.clinic.timezone);

  if (!initialValues) {
    logger.error("Appointment edit values could not be converted", {
      component: "edit_appointment",
      status: "initial_values_error"
    });
    return { state: "error", data: null };
  }

  const patients = mapPatients((patientsResult.data ?? []) as PatientOptionRow[]);
  const doctors = mapDoctors((doctorsResult.data ?? []) as DoctorProfileRow[]);

  if (appointment.doctor_id && !doctors.some((doctor) => doctor.id === appointment.doctor_id)) {
    doctors.push({ id: appointment.doctor_id, name: "Profesional actual" });
  }

  return {
    state: "ready",
    data: {
      appointment,
      initialValues,
      patients,
      doctors,
      timeZone: context.tenant.clinic.timezone
    }
  };
}

export async function updateAppointmentForActiveTenant(
  appointmentId: string,
  values: AppointmentFormValues
): Promise<UpdateAppointmentResult> {
  if (!isCanonicalAppointmentUuid(appointmentId)) {
    return { state: "invalid_id" };
  }

  const context = await getActiveTenantContext();

  if (context.state === "error") {
    return { state: "error", error: "No fue posible resolver la clínica activa. Intenta nuevamente.", values };
  }

  if (context.state !== "ready") {
    return { state: context.state };
  }

  if (!canEditAppointments(context.tenant.membership.role)) {
    return { state: "forbidden" };
  }

  const validation = validateAppointmentEditFormValues(values);

  if (!validation.valid) {
    return {
      state: "validation_error",
      error: "Revisa los campos marcados antes de guardar los cambios.",
      fieldErrors: validation.fieldErrors,
      values
    };
  }

  const input = validation.data;
  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const appointmentResult = await supabase
    .from("appointments")
    .select(editableAppointmentColumns)
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (appointmentResult.error) {
    logger.error("Appointment edit ownership query failed", {
      component: "edit_appointment",
      status: "ownership_query_error",
      code: appointmentResult.error.code
    });
    return { state: "error", error: "No fue posible validar la cita. Intenta nuevamente.", values };
  }

  if (!appointmentResult.data) {
    return { state: "not_found" };
  }

  const original = appointmentResult.data as EditableAppointment;
  const [patientResult, doctorResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("id", input.patientId)
      .maybeSingle(),
    input.doctorId === original.doctor_id
      ? Promise.resolve({ data: { profile_id: input.doctorId }, error: null })
      : supabase
          .from("doctor_public_profiles")
          .select("profile_id")
          .eq("clinic_id", clinicId)
          .eq("profile_id", input.doctorId)
          .limit(1)
          .maybeSingle()
  ]);

  if (patientResult.error || doctorResult.error) {
    logger.error("Appointment edit relation validation failed", {
      component: "edit_appointment",
      status: "relation_query_error",
      patientCode: patientResult.error?.code,
      doctorCode: doctorResult.error?.code
    });
    return { state: "error", error: "No fue posible validar los datos seleccionados. Intenta nuevamente.", values };
  }

  const relationErrors: AppointmentFieldErrors = {};
  if (!patientResult.data) relationErrors.patientId = "El paciente no pertenece a la clínica activa.";
  if (!doctorResult.data) relationErrors.doctorId = "El profesional no pertenece a la clínica activa.";

  if (Object.keys(relationErrors).length > 0) {
    return {
      state: "validation_error",
      error: "Revisa el paciente y el profesional seleccionados.",
      fieldErrors: relationErrors,
      values
    };
  }

  const localDateTime = combineClinicDateTime(input.date, input.startTime, context.tenant.clinic.timezone);

  if (localDateTime.state !== "valid") {
    const message =
      localDateTime.state === "ambiguous"
        ? "La hora ocurre dos veces por el cambio de horario. Selecciona otra hora."
        : localDateTime.state === "nonexistent"
          ? "La hora no existe en la zona horaria de la clínica."
          : "La zona horaria de la clínica no es válida.";
    return {
      state: "validation_error",
      error: "No fue posible interpretar el horario.",
      fieldErrors: { startTime: message },
      values
    };
  }

  const startsAt = localDateTime.iso;
  const endsAt = getAppointmentEditEnd(startsAt, input.duration);

  if (!endsAt) {
    return {
      state: "validation_error",
      error: "La duración seleccionada no es válida.",
      fieldErrors: { duration: "Selecciona una duración permitida." },
      values
    };
  }

  if (original.status === "completed" && input.status === "completed" && Date.parse(startsAt) > Date.now()) {
    return {
      state: "validation_error",
      error: "Una cita completada no puede moverse al futuro sin cambiar explícitamente su estado.",
      fieldErrors: { status: "Cambia el estado antes de mover esta cita al futuro." },
      values
    };
  }

  if (input.status !== "cancelled") {
    const conflictResult = await supabase
      .from("appointments")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("doctor_id", input.doctorId)
      .neq("id", appointmentId)
      .neq("status", "cancelled")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .limit(1)
      .maybeSingle();

    if (conflictResult.error) {
      logger.error("Appointment edit conflict query failed", {
        component: "edit_appointment",
        status: "conflict_query_error",
        code: conflictResult.error.code
      });
      return { state: "error", error: "No fue posible verificar la disponibilidad. Intenta nuevamente.", values };
    }

    if (conflictResult.data) {
      return {
        state: "conflict",
        error: "El profesional ya tiene una cita en ese horario.",
        fieldErrors: { startTime: "Horario no disponible para el profesional seleccionado." },
        values
      };
    }
  }

  const oldValues = getAppointmentEditInitialValues(original, context.tenant.clinic.timezone);

  if (!oldValues) {
    logger.error("Appointment edit original date could not be converted", {
      component: "edit_appointment",
      status: "original_date_error"
    });
    return { state: "error", error: "No fue posible actualizar la cita. Intenta nuevamente.", values };
  }

  const updateResult = (await supabase
    .from("appointments")
    .update(buildAppointmentUpdate(input, startsAt, endsAt) as never)
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .select("id, patient_id")
    .maybeSingle()) as unknown as {
    data: { id: string; patient_id: string } | null;
    error: { code: string } | null;
  };

  if (updateResult.error || !updateResult.data) {
    logger.error("Appointment update failed", {
      component: "edit_appointment",
      status: updateResult.error ? "update_error" : "missing_result",
      code: updateResult.error?.code
    });
    return { state: "error", error: "No fue posible actualizar la cita. Intenta nuevamente.", values };
  }

  return {
    state: "success",
    date: input.date,
    oldDate: oldValues.date,
    patientId: updateResult.data.patient_id,
    oldPatientId: original.patient_id
  };
}
