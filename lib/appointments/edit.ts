import {
  appointmentDurations,
  calculateAppointmentEnd,
  canCreateAppointments,
  validateAppointmentFormValues,
  type AppointmentFormValues,
  type ValidatedAppointmentInput
} from "@/lib/appointments/create";
import {
  appointmentStatuses,
  type AppointmentStatus,
  type AppointmentSearchParams
} from "@/lib/appointments/query";
import { calculateAppointmentDuration } from "@/lib/appointments/format";
import type { Database } from "@/types/database";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

export type EditableAppointment = Pick<
  AppointmentRow,
  | "id"
  | "patient_id"
  | "doctor_id"
  | "title"
  | "appointment_type"
  | "location"
  | "starts_at"
  | "ends_at"
  | "status"
>;

export type ValidatedAppointmentEditInput = Omit<ValidatedAppointmentInput, "status"> & {
  status: AppointmentStatus;
};

export const canEditAppointments = canCreateAppointments;

export function appointmentTimestampToLocalParts(value: string, timeZone: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return null;

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      calendar: "iso8601",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}`
    };
  } catch {
    return null;
  }
}

export function getAppointmentEditInitialValues(
  appointment: EditableAppointment,
  timeZone: string
): AppointmentFormValues | null {
  const starts = appointmentTimestampToLocalParts(appointment.starts_at, timeZone);
  const duration = calculateAppointmentDuration(appointment.starts_at, appointment.ends_at);

  if (!starts || !duration || !appointmentDurations.includes(duration as (typeof appointmentDurations)[number])) {
    return null;
  }

  return {
    patientId: appointment.patient_id,
    doctorId: appointment.doctor_id ?? "",
    title: appointment.title,
    appointmentType: appointment.appointment_type ?? "",
    date: starts.date,
    startTime: starts.time,
    duration: String(duration),
    status: appointment.status,
    location: appointment.location ?? "",
    meetingUrl: ""
  };
}

export function validateAppointmentEditFormValues(
  values: AppointmentFormValues
):
  | { valid: true; data: ValidatedAppointmentEditInput; fieldErrors: null }
  | { valid: false; data: null; fieldErrors: Record<string, string> } {
  const baseValidation = validateAppointmentFormValues({
    ...values,
    status: "scheduled",
    meetingUrl: ""
  });
  const fieldErrors = baseValidation.valid ? {} : { ...baseValidation.fieldErrors };

  if (!appointmentStatuses.includes(values.status as AppointmentStatus)) {
    fieldErrors.status = "Selecciona un estado válido.";
  }

  if (!baseValidation.valid || Object.keys(fieldErrors).length > 0) {
    return { valid: false, data: null, fieldErrors };
  }

  return {
    valid: true,
    fieldErrors: null,
    data: {
      ...baseValidation.data,
      status: values.status as AppointmentStatus,
      meetingUrl: null
    }
  };
}

export function buildAppointmentUpdate(
  input: ValidatedAppointmentEditInput,
  startsAt: string,
  endsAt: string
): AppointmentUpdate {
  return {
    patient_id: input.patientId,
    doctor_id: input.doctorId,
    title: input.title,
    appointment_type: input.appointmentType,
    location: input.location,
    starts_at: startsAt,
    ends_at: endsAt,
    status: input.status
  };
}

export function hasAppointmentUpdatedMessage(searchParams: AppointmentSearchParams) {
  return searchParams.updated === "1";
}

export function getAppointmentEditReturnHref(date: string) {
  return `/dashboard/appointments?date=${encodeURIComponent(date)}`;
}

export function getAppointmentEditEnd(startsAt: string, duration: number) {
  if (!appointmentDurations.includes(duration as (typeof appointmentDurations)[number])) return null;
  return calculateAppointmentEnd(startsAt, duration as (typeof appointmentDurations)[number]);
}
