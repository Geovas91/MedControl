"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  getAppointmentFormValues,
  type AppointmentFormState
} from "@/lib/appointments/create";
import { updateAppointmentForActiveTenant } from "@/lib/server/update-appointment";
import { deliverAppointmentCalendarEmail } from "@/lib/server/appointment-calendar-email";

export async function updateAppointmentAction(
  appointmentId: string,
  _previousState: AppointmentFormState,
  formData: FormData
): Promise<AppointmentFormState> {
  const values = getAppointmentFormValues(formData);
  const result = await updateAppointmentForActiveTenant(appointmentId, values);

  if (result.state === "invalid_id" || result.state === "not_found") notFound();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");

  if (result.state === "forbidden") {
    return { error: "Tu rol actual no permite editar citas.", values };
  }

  if (result.state !== "success") {
    return {
      error: result.error,
      fieldErrors: result.fieldErrors,
      values: result.values
    };
  }

  const calendarEmail = result.calendarChanged
    ? await deliverAppointmentCalendarEmail({
        appointmentId,
        method: "REQUEST",
        reason: "rescheduled",
        operationKey: result.operationKey,
        appointmentVersion: result.appointmentVersion
      })
    : null;

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath(`/dashboard/appointments?date=${encodeURIComponent(result.oldDate)}`);
  revalidatePath(`/dashboard/appointments?date=${encodeURIComponent(result.date)}`);
  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  revalidatePath(`/dashboard/patients/${result.oldPatientId}`);
  revalidatePath(`/dashboard/patients/${result.patientId}`);
  const query = new URLSearchParams({ updated: "1" });
  if (calendarEmail) query.set("calendar_email", calendarEmail);
  redirect(`/dashboard/appointments/${appointmentId}?${query.toString()}`);
}
