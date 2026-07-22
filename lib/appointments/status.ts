import { appointmentStatuses, type AppointmentStatus } from "@/lib/appointments/query";
import type { Database } from "@/types/database";

type ClinicMemberRole = Database["public"]["Enums"]["clinic_member_role"];

export type AppointmentStatusOutcome =
  | "confirmed"
  | "waiting"
  | "completed"
  | "cancelled"
  | "restored";

export type AppointmentStatusAction = {
  targetStatus: AppointmentStatus;
  outcome: AppointmentStatusOutcome;
  label: string;
  title: string;
  description: string;
  tone: "default" | "danger";
};

export type AppointmentStatusFormInput = {
  targetStatus: AppointmentStatus;
  expectedCurrentStatus: AppointmentStatus;
};

const statusTransitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ["confirmed", "waiting", "completed", "cancelled"],
  confirmed: ["waiting", "completed", "cancelled"],
  waiting: ["completed", "cancelled"],
  completed: [],
  cancelled: ["scheduled"]
};

const statusManagerRoles = ["owner", "admin", "doctor"] as const;
const statusRestorerRoles = ["owner", "admin"] as const;

function isAppointmentStatus(value: FormDataEntryValue | null): value is AppointmentStatus {
  return typeof value === "string" && appointmentStatuses.includes(value as AppointmentStatus);
}

function clinicDate(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      calendar: "iso8601",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

export function canManageAppointmentStatus(role: ClinicMemberRole) {
  return statusManagerRoles.includes(role as (typeof statusManagerRoles)[number]);
}

export function canRestoreAppointment(role: ClinicMemberRole) {
  return statusRestorerRoles.includes(role as (typeof statusRestorerRoles)[number]);
}

export function isAllowedAppointmentStatusTransition(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
) {
  return statusTransitions[currentStatus].includes(targetStatus);
}

export function validateAppointmentStatusTiming(
  targetStatus: AppointmentStatus,
  startsAt: string,
  timeZone: string,
  now = new Date()
): "allowed" | "too_early" | "invalid_time" {
  const starts = new Date(startsAt);

  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(now.getTime())) return "invalid_time";

  if (targetStatus === "completed" && starts.getTime() > now.getTime()) return "too_early";

  if (targetStatus === "confirmed") {
    const appointmentDate = clinicDate(starts, timeZone);
    const today = clinicDate(now, timeZone);
    if (!appointmentDate || !today) return "invalid_time";
    if (appointmentDate < today) return "too_early";
  }

  if (targetStatus === "waiting") {
    const appointmentDate = clinicDate(starts, timeZone);
    const today = clinicDate(now, timeZone);
    if (!appointmentDate || !today) return "invalid_time";
    if (appointmentDate !== today) return "too_early";
  }

  return "allowed";
}

export function getAppointmentStatusOutcome(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
): AppointmentStatusOutcome | null {
  if (currentStatus === "cancelled" && targetStatus === "scheduled") return "restored";
  if (targetStatus === "confirmed") return "confirmed";
  if (targetStatus === "waiting") return "waiting";
  if (targetStatus === "completed") return "completed";
  if (targetStatus === "cancelled") return "cancelled";
  return null;
}

function actionForTransition(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
): AppointmentStatusAction | null {
  const outcome = getAppointmentStatusOutcome(currentStatus, targetStatus);
  if (!outcome) return null;

  const actions: Record<AppointmentStatusOutcome, Omit<AppointmentStatusAction, "targetStatus" | "outcome">> = {
    confirmed: {
      label: "Confirmar cita",
      title: "Confirmar cita",
      description: "La cita quedará confirmada para el horario registrado.",
      tone: "default"
    },
    waiting: {
      label: "Marcar en espera",
      title: "Marcar cita en espera",
      description: "Confirma que el paciente está en espera para recibir atención.",
      tone: "default"
    },
    completed: {
      label: "Marcar como completada",
      title: "Completar cita",
      description: "Confirma que la atención terminó antes de marcar la cita como completada.",
      tone: "default"
    },
    cancelled: {
      label: "Cancelar cita",
      title: "Cancelar cita",
      description: "Esta acción marcará la cita como cancelada. La cita permanecerá en el historial.",
      tone: "danger"
    },
    restored: {
      label: "Restaurar cita",
      title: "Restaurar cita",
      description: "La cita volverá a estar activa con la misma fecha y horario.",
      tone: "default"
    }
  };

  return { targetStatus, outcome, ...actions[outcome] };
}

export function getAvailableAppointmentStatusActions({
  currentStatus,
  role,
  startsAt,
  timeZone,
  hasAssignedDoctor = true,
  now = new Date()
}: {
  currentStatus: AppointmentStatus;
  role: ClinicMemberRole;
  startsAt: string;
  timeZone: string;
  hasAssignedDoctor?: boolean;
  now?: Date;
}) {
  if (!canManageAppointmentStatus(role)) return [];

  return statusTransitions[currentStatus]
    .filter((targetStatus) => currentStatus !== "cancelled" || canRestoreAppointment(role))
    .filter((targetStatus) => currentStatus !== "cancelled" || targetStatus !== "scheduled" || hasAssignedDoctor)
    .filter((targetStatus) => validateAppointmentStatusTiming(targetStatus, startsAt, timeZone, now) === "allowed")
    .map((targetStatus) => actionForTransition(currentStatus, targetStatus))
    .filter((action): action is AppointmentStatusAction => Boolean(action));
}

export function parseAppointmentStatusFormData(formData: FormData): AppointmentStatusFormInput | null {
  const targetStatus = formData.get("target_status");
  const expectedCurrentStatus = formData.get("expected_current_status");

  if (!isAppointmentStatus(targetStatus) || !isAppointmentStatus(expectedCurrentStatus)) return null;
  return { targetStatus, expectedCurrentStatus };
}

export function getAppointmentStatusSuccessMessage(value: string | string[] | undefined) {
  if (typeof value !== "string") return null;

  const messages: Record<AppointmentStatusOutcome, string> = {
    confirmed: "La cita se confirmó correctamente.",
    waiting: "La cita se marcó como en espera.",
    completed: "La cita se marcó como completada.",
    cancelled: "La cita se canceló correctamente.",
    restored: "La cita se restauró correctamente."
  };

  return Object.hasOwn(messages, value) ? messages[value as AppointmentStatusOutcome] : null;
}
