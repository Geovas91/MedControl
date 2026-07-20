"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPatientFormValues, type PatientFormState } from "@/lib/patients/create";
import { createPatientForActiveTenant } from "@/lib/server/create-patient";

export async function createPatientAction(
  _previousState: PatientFormState,
  formData: FormData
): Promise<PatientFormState> {
  const values = getPatientFormValues(formData);
  const result = await createPatientForActiveTenant(values);

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    redirect("/onboarding");
  }

  if (result.state === "forbidden") {
    return { error: "Tu rol actual no permite crear pacientes.", values };
  }

  if (result.state !== "success") {
    return {
      error: result.error,
      fieldErrors: result.fieldErrors,
      values: result.values
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/patients");
  revalidatePath("/dashboard/appointments/new");
  redirect(`/dashboard/patients/${result.patientId}?created=1`);
}
