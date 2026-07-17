"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getAppointmentFormValues,
  type AppointmentFormState
} from "@/lib/appointments/create";
import { createAppointmentForActiveTenant } from "@/lib/server/create-appointment";

export async function createAppointmentAction(
  _previousState: AppointmentFormState,
  formData: FormData
): Promise<AppointmentFormState> {
  const values = getAppointmentFormValues(formData);
  const result = await createAppointmentForActiveTenant(values);

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    redirect("/onboarding");
  }

  if (result.state === "forbidden") {
    return {
      error: "Tu rol actual no permite crear citas.",
      values
    };
  }

  if (
    result.state === "validation_error" ||
    result.state === "conflict" ||
    result.state === "error"
  ) {
    return {
      error: result.error,
      fieldErrors: result.fieldErrors,
      values: result.values
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath(`/dashboard/patients/${result.patientId}`);
  redirect(`/dashboard/appointments?date=${encodeURIComponent(result.date)}&created=1`);
}
