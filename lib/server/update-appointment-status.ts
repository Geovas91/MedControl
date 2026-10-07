import "server-only";

import { formatAppointmentDetailDateTime } from "@/lib/appointments/detail";
import { isCanonicalAppointmentUuid, type AppointmentStatus } from "@/lib/appointments/query";
import {
  canManageAppointmentStatusTarget,
  canRestoreAppointment,
  getAppointmentStatusOutcome,
  isAllowedAppointmentStatusTransition,
  validateAppointmentStatusTiming,
  type AppointmentStatusFormInput,
  type AppointmentStatusOutcome
} from "@/lib/appointments/status";
import { buildAppointmentCalendarOperation } from "@/lib/calendar/invitation";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { mutateAppointmentLifecycleForActiveTenant } from "@/lib/server/appointment-lifecycle";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type StatusAppointment = Pick<
  AppointmentRow,
  "id" | "patient_id" | "doctor_id" | "starts_at" | "ends_at" | "status"
>;

export type UpdateAppointmentStatusResult =
  | {
      state: "success";
      outcome: AppointmentStatusOutcome;
      patientId: string;
      localDate: string | null;
      operationKey: string;
      appointmentVersion: string;
    }
  | { state: "invalid_id" }
  | { state: "unauthenticated" }
  | { state: "no_active_membership" }
  | { state: "forbidden" }
  | { state: "not_found" }
  | { state: "invalid_status"; error: string }
  | { state: "invalid_transition"; error: string }
  | { state: "terminal_state"; error: string }
  | { state: "too_early"; error: string }
  | { state: "conflict"; error: string }
  | { state: "stale_state"; error: string }
  | { state: "error"; error: string };

const statusAppointmentColumns = "id, patient_id, doctor_id, starts_at, ends_at, status";

function temporalError(targetStatus: AppointmentStatus) {
  if (targetStatus === "completed") return "No puedes completar una cita antes de su hora de inicio.";
  if (targetStatus === "waiting") return "Una cita solo puede ponerse en espera durante su fecha local.";
  if (targetStatus === "confirmed") return "No puedes confirmar una cita de una fecha local anterior.";
  return "La acción no está disponible para el horario actual de la cita.";
}

export async function updateAppointmentStatusForActiveTenant(
  appointmentId: string,
  input: AppointmentStatusFormInput
): Promise<UpdateAppointmentStatusResult> {
  if (!isCanonicalAppointmentUuid(appointmentId)) return { state: "invalid_id" };

  const context = await getActiveTenantContext();

  if (context.state === "error") {
    return { state: "error", error: "No fue posible resolver la clínica activa." };
  }

  if (context.state !== "ready") return { state: context.state };
  if (!canManageAppointmentStatusTarget(context.tenant.membership.role, input.targetStatus)) return { state: "forbidden" };

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const appointmentResult = await supabase
    .from("appointments")
    .select(statusAppointmentColumns)
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (appointmentResult.error) {
    logger.error("Appointment status query failed", {
      component: "appointment_status",
      status: "appointment_query_error",
      code: appointmentResult.error.code
    });
    return { state: "error", error: "No fue posible validar la cita. Intenta nuevamente." };
  }

  if (!appointmentResult.data) return { state: "not_found" };

  const appointment = appointmentResult.data as StatusAppointment;
  if (context.tenant.membership.role === "doctor" && appointment.doctor_id !== context.user.id) return { state: "forbidden" };

  if (appointment.status !== input.expectedCurrentStatus) {
    return {
      state: "stale_state",
      error: "La cita cambió en otra sesión. Actualiza la página e intenta nuevamente."
    };
  }

  if (appointment.status === "completed") {
    return { state: "terminal_state", error: "Una cita completada ya no admite cambios de estado." };
  }

  if (!isAllowedAppointmentStatusTransition(appointment.status, input.targetStatus)) {
    return { state: "invalid_transition", error: "El cambio de estado solicitado no está permitido." };
  }

  if (appointment.status === "cancelled" && !canRestoreAppointment(context.tenant.membership.role)) {
    return { state: "forbidden" };
  }

  const timing = validateAppointmentStatusTiming(
    input.targetStatus,
    appointment.starts_at,
    context.tenant.clinic.timezone
  );

  if (timing === "too_early") {
    return { state: "too_early", error: temporalError(input.targetStatus) };
  }

  if (timing === "invalid_time") {
    logger.error("Appointment status timing is invalid", {
      component: "appointment_status",
      status: "timing_error"
    });
    return { state: "error", error: "No fue posible validar el horario de la cita." };
  }

  const outcome = getAppointmentStatusOutcome(appointment.status, input.targetStatus);

  if (!outcome) {
    return { state: "invalid_status", error: "El estado solicitado no es válido." };
  }

  const operation = input.targetStatus === "confirmed" ? "confirm"
    : input.targetStatus === "cancelled" ? "cancel"
    : input.targetStatus === "scheduled" ? "restore"
    : input.targetStatus === "waiting" ? "waiting" : "completed";
  const lifecycle = await mutateAppointmentLifecycleForActiveTenant({
    appointmentId, operation, expectedStatus: input.expectedCurrentStatus
  });
  if (lifecycle.state !== "success") {
    if (lifecycle.state === "forbidden") return { state: "forbidden" };
    if (lifecycle.state === "conflict") return { state: "conflict", error: "El profesional ya tiene una cita en ese horario." };
    if (lifecycle.state === "stale_state") return { state: "stale_state", error: "La cita cambió en otra sesión. Actualiza la página e intenta nuevamente." };
    if (lifecycle.state === "too_early") return { state: "too_early", error: temporalError(input.targetStatus) };
    if (lifecycle.state === "terminal_state") return { state: "terminal_state", error: "Una cita completada ya no admite cambios de estado." };
    if (lifecycle.state === "invalid_transition") return { state: "invalid_transition", error: "El cambio de estado solicitado no está permitido." };
    if (lifecycle.state === "not_found") return { state: "not_found" };
    return { state: "error", error: "No fue posible actualizar el estado de la cita." };
  }
  const localDate = formatAppointmentDetailDateTime(
    lifecycle.appointment.starts_at, lifecycle.appointment.ends_at, context.tenant.clinic.timezone
  ).localDate;
  const calendarOperation = buildAppointmentCalendarOperation(appointmentId, "status", lifecycle.appointment.updated_at);
  return { state: "success", outcome, patientId: appointment.patient_id, localDate, ...calendarOperation };
}
