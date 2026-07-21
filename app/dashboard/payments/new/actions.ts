"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getClinicalPaymentFormValues,
  type ClinicalPaymentFormState
} from "@/lib/payments/create";
import { createClinicalPaymentForActiveTenant } from "@/lib/server/create-payment";

export async function createClinicalPaymentAction(
  _previousState: ClinicalPaymentFormState,
  formData: FormData
): Promise<ClinicalPaymentFormState> {
  const values = getClinicalPaymentFormValues(formData);
  const result = await createClinicalPaymentForActiveTenant(values);

  if (result.state === "unauthenticated") {
    redirect("/login");
  }

  if (result.state === "no_active_membership") {
    redirect("/onboarding");
  }

  if (result.state === "forbidden") {
    return { error: "Tu rol actual no permite registrar pagos clínicos.", values };
  }

  if (result.state === "validation_error" || result.state === "error") {
    return {
      error: result.error,
      fieldErrors: result.fieldErrors,
      values: result.values
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/payments");
  revalidatePath(`/dashboard/patients/${result.patientId}`);
  redirect(`/dashboard/payments?created=1&patient=${encodeURIComponent(result.patientId)}`);
}
