"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { parseAppointmentStatusFormData } from "@/lib/appointments/status";
import { updateAppointmentStatusForActiveTenant } from "@/lib/server/update-appointment-status";
import { deliverAppointmentCalendarEmail } from "@/lib/server/appointment-calendar-email";
import { getStatusCalendarOperation } from "@/lib/calendar/invitation";

export type AppointmentStatusActionState = {
  error?: string;
};

export async function updateAppointmentStatusAction(
  appointmentId: string,
  _previousState: AppointmentStatusActionState,
  formData: FormData
): Promise<AppointmentStatusActionState> {
  const input = parseAppointmentStatusFormData(formData);

  if (!input) return { error: "El estado solicitado no es válido." };

  const result = await updateAppointmentStatusForActiveTenant(appointmentId, input);

  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state === "forbidden") return { error: "Tu rol actual no permite gestionar estados de citas." };

  if (result.state !== "success") return { error: result.error };

  const calendarOperation = getStatusCalendarOperation(result.outcome);
  const calendarEmail = calendarOperation
    ? await deliverAppointmentCalendarEmail({
        appointmentId,
        ...calendarOperation,
        operationKey: result.operationKey,
        appointmentVersion: result.appointmentVersion
      })
    : null;

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  revalidatePath(`/dashboard/patients/${result.patientId}`);

  if (result.localDate) {
    revalidatePath(`/dashboard/appointments?date=${encodeURIComponent(result.localDate)}`);
  }

  const query = new URLSearchParams({ status_updated: result.outcome });
  if (calendarEmail) query.set("calendar_email", calendarEmail);
  redirect(`/dashboard/appointments/${appointmentId}?${query.toString()}`);
}
