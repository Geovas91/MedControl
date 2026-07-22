"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getPatientFormValues, type PatientFormState } from "@/lib/patients/create";
import { updatePatientForActiveTenant } from "@/lib/server/update-patient";

export async function updatePatientAction(
  patientId: string,
  _previousState: PatientFormState,
  formData: FormData
): Promise<PatientFormState> {
  const values = getPatientFormValues(formData);
  const result = await updatePatientForActiveTenant(patientId, values);

  if (result.state === "invalid_id" || result.state === "not_found") {
    notFound();
  }

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    redirect("/onboarding");
  }

  if (result.state === "forbidden") {
    return { error: "Tu rol actual no permite editar pacientes.", values };
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
  revalidatePath(`/dashboard/patients/${result.patientId}`);
  revalidatePath("/dashboard/appointments/new");
  revalidatePath("/dashboard/payments/new");
  redirect(`/dashboard/patients/${result.patientId}?updated=1`);
}
