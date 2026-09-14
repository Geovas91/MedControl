"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { combineClinicDateTime, isValidAppointmentTime } from "@/lib/appointments/create";
import { buildAppointmentCalendarOperation } from "@/lib/calendar/invitation";
import { deliverAppointmentCalendarEmail } from "@/lib/server/appointment-calendar-email";
import { mutateAppointmentLifecycleForActiveTenant } from "@/lib/server/appointment-lifecycle";
import { getAppointmentRescheduleForActiveTenant } from "@/lib/server/appointment-reschedule";
import { syncAppointmentGoogleCalendar } from "@/lib/server/appointment-google-calendar";

export type RescheduleActionState = { error?: string };

export async function rescheduleAppointmentAction(
  appointmentId: string,
  _previousState: RescheduleActionState,
  formData: FormData
): Promise<RescheduleActionState> {
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("start_time") ?? "").trim();
  const expectedStatusValue = String(formData.get("expected_status") ?? "");
  if (expectedStatusValue !== "scheduled" && expectedStatusValue !== "confirmed") return { error: "El estado actual de la cita no permite reprogramarla." };
  const expectedStatus = expectedStatusValue as "scheduled" | "confirmed";
  const context = await getAppointmentRescheduleForActiveTenant(appointmentId, date);
  if (context.state === "invalid_id" || context.state === "not_found") notFound();
  if (context.state === "unauthenticated") redirect("/login");
  if (context.state === "no_active_membership") redirect("/onboarding");
  if (context.state === "forbidden") return { error: "Tu rol no permite reprogramar esta cita." };
  if (context.state !== "ready") return { error: "No fue posible preparar la reprogramación. Intenta nuevamente." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidAppointmentTime(time)) return { error: "Selecciona una fecha y hora válidas." };
  const localDateTime = combineClinicDateTime(date, time, context.data.timeZone);
  if (localDateTime.state !== "valid") return { error: "La hora seleccionada no existe en la zona horaria de la clínica." };
  const endsAt = new Date(Date.parse(localDateTime.iso) + context.data.duration * 60_000).toISOString();
  const result = await mutateAppointmentLifecycleForActiveTenant({ appointmentId, operation: "reschedule", expectedStatus, startsAt: localDateTime.iso, endsAt });
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state === "forbidden") return { error: "Tu rol no permite reprogramar esta cita." };
  if (result.state === "conflict") return { error: "El horario seleccionado ya no está disponible." };
  if (result.state === "stale_state") return { error: "La cita cambió mientras la editabas. Recarga e inténtalo de nuevo." };
  if (result.state !== "success") return { error: "No fue posible reprogramar la cita. Intenta nuevamente." };
  const operation = buildAppointmentCalendarOperation(appointmentId, "updated", result.appointment.updated_at);
  const [calendarEmail] = await Promise.all([
    deliverAppointmentCalendarEmail({ appointmentId, method: "REQUEST", reason: "rescheduled", operationKey: operation.operationKey, appointmentVersion: operation.appointmentVersion }),
    syncAppointmentGoogleCalendar({ appointmentId, appointmentVersion: operation.appointmentVersion, operation: "upsert" })
  ]);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  revalidatePath(`/dashboard/appointments/${appointmentId}/reschedule`);
  const query = new URLSearchParams({ rescheduled: "1" });
  if (calendarEmail) query.set("calendar_email", calendarEmail);
  redirect(`/dashboard/appointments/${appointmentId}?${query.toString()}`);
}
