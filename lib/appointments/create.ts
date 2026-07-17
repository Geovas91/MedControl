import {
  isCanonicalAppointmentDate,
  isCanonicalAppointmentUuid,
  type AppointmentStatus
} from "@/lib/appointments/query";
import type { Database } from "@/types/database";

export const appointmentDurations = [15, 30, 45, 60, 90, 120] as const;
export const newAppointmentStatuses = ["scheduled", "confirmed"] as const satisfies readonly AppointmentStatus[];
export const appointmentCreatorRoles = ["owner", "doctor", "admin"] as const;

export type AppointmentCreatorRole = Database["public"]["Enums"]["clinic_member_role"];
export type AppointmentDuration = (typeof appointmentDurations)[number];
export type NewAppointmentStatus = (typeof newAppointmentStatuses)[number];

export type AppointmentFormValues = {
  patientId: string;
  doctorId: string;
  title: string;
  appointmentType: string;
  date: string;
  startTime: string;
  duration: string;
  status: string;
  location: string;
  meetingUrl: string;
};

export type AppointmentFormField = keyof AppointmentFormValues;
export type AppointmentFieldErrors = Partial<Record<AppointmentFormField, string>>;

export type AppointmentFormState = {
  error?: string;
  fieldErrors?: AppointmentFieldErrors;
  values?: AppointmentFormValues;
};

export type ValidatedAppointmentInput = Omit<
  AppointmentFormValues,
  "duration" | "status" | "appointmentType" | "location" | "meetingUrl"
> & {
  duration: AppointmentDuration;
  status: NewAppointmentStatus;
  appointmentType: string | null;
  location: string | null;
  meetingUrl: string | null;
};

export type LocalDateTimeResult =
  | { state: "valid"; iso: string }
  | { state: "nonexistent"; iso: null }
  | { state: "ambiguous"; iso: null }
  | { state: "invalid_timezone"; iso: null };

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function normalizeText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function nullableText(value: string) {
  const normalized = normalizeText(value);
  return normalized || null;
}

export function getAppointmentFormValues(formData: FormData): AppointmentFormValues {
  return {
    patientId: formString(formData, "patient_id").trim(),
    doctorId: formString(formData, "doctor_id").trim(),
    title: normalizeText(formString(formData, "title")),
    appointmentType: normalizeText(formString(formData, "appointment_type")),
    date: formString(formData, "date").trim(),
    startTime: formString(formData, "start_time").trim(),
    duration: formString(formData, "duration").trim(),
    status: formString(formData, "status").trim(),
    location: normalizeText(formString(formData, "location")),
    meetingUrl: formString(formData, "meeting_url").trim()
  };
}

export function isValidAppointmentTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

export function isAllowedAppointmentDuration(value: number): value is AppointmentDuration {
  return appointmentDurations.includes(value as AppointmentDuration);
}

function normalizeMeetingUrl(value: string) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function canCreateAppointments(role: AppointmentCreatorRole) {
  return appointmentCreatorRoles.includes(role as (typeof appointmentCreatorRoles)[number]);
}

export function validateAppointmentFormValues(
  values: AppointmentFormValues
):
  | { valid: true; data: ValidatedAppointmentInput; fieldErrors: null }
  | { valid: false; data: null; fieldErrors: AppointmentFieldErrors } {
  const fieldErrors: AppointmentFieldErrors = {};

  if (!isCanonicalAppointmentUuid(values.patientId)) {
    fieldErrors.patientId = "Selecciona un paciente válido.";
  }

  if (!isCanonicalAppointmentUuid(values.doctorId)) {
    fieldErrors.doctorId = "Selecciona un médico válido.";
  }

  if (!values.title) {
    fieldErrors.title = "El título es obligatorio.";
  } else if (values.title.length > 120) {
    fieldErrors.title = "El título no puede exceder 120 caracteres.";
  }

  if (values.appointmentType.length > 80) {
    fieldErrors.appointmentType = "El tipo de cita no puede exceder 80 caracteres.";
  }

  if (!isCanonicalAppointmentDate(values.date)) {
    fieldErrors.date = "Selecciona una fecha válida.";
  }

  if (!isValidAppointmentTime(values.startTime)) {
    fieldErrors.startTime = "Selecciona una hora válida.";
  }

  const duration = Number(values.duration);

  if (!isAllowedAppointmentDuration(duration)) {
    fieldErrors.duration = "Selecciona una duración permitida.";
  }

  if (!newAppointmentStatuses.includes(values.status as NewAppointmentStatus)) {
    fieldErrors.status = "Selecciona un estado inicial válido.";
  }

  if (values.location.length > 200) {
    fieldErrors.location = "La ubicación no puede exceder 200 caracteres.";
  }

  if (values.meetingUrl.length > 500) {
    fieldErrors.meetingUrl = "El enlace no puede exceder 500 caracteres.";
  }

  const meetingUrl = normalizeMeetingUrl(values.meetingUrl);

  if (values.meetingUrl && !meetingUrl) {
    fieldErrors.meetingUrl = "Usa un enlace http:// o https:// válido y sin credenciales.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { valid: false, data: null, fieldErrors };
  }

  return {
    valid: true,
    fieldErrors: null,
    data: {
      patientId: values.patientId,
      doctorId: values.doctorId,
      title: values.title,
      appointmentType: nullableText(values.appointmentType),
      date: values.date,
      startTime: values.startTime,
      duration: duration as AppointmentDuration,
      status: values.status as NewAppointmentStatus,
      location: nullableText(values.location),
      meetingUrl
    }
  };
}

function localDateTimeParts(value: Date, formatter: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

export function combineClinicDateTime(date: string, time: string, timeZone: string): LocalDateTimeResult {
  if (!isCanonicalAppointmentDate(date) || !isValidAppointmentTime(time)) {
    return { state: "nonexistent", iso: null };
  }

  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
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
  } catch {
    return { state: "invalid_timezone", iso: null };
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const approximateUtc = Date.UTC(year, month - 1, day, hour, minute);
  const matches: number[] = [];

  for (
    let candidate = approximateUtc - 18 * 60 * 60 * 1000;
    candidate <= approximateUtc + 18 * 60 * 60 * 1000;
    candidate += 60_000
  ) {
    const parts = localDateTimeParts(new Date(candidate), formatter);

    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute
    ) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    return { state: "nonexistent", iso: null };
  }

  if (matches.length > 1) {
    return { state: "ambiguous", iso: null };
  }

  return { state: "valid", iso: new Date(matches[0]).toISOString() };
}

export function calculateAppointmentEnd(startsAt: string, duration: AppointmentDuration) {
  if (!isAllowedAppointmentDuration(duration)) {
    throw new RangeError(`Unsupported appointment duration: ${duration}`);
  }

  return new Date(Date.parse(startsAt) + duration * 60_000).toISOString();
}
