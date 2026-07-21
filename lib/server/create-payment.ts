import "server-only";

import {
  canCreateClinicalPayments,
  getClinicLocalPaymentDefaults,
  resolveClinicalPaymentTimestamp,
  validateClinicalPaymentFormValues,
  type ClinicalPaymentFieldErrors,
  type ClinicalPaymentFormValues
} from "@/lib/payments/create";
import { isCanonicalPaymentUuid } from "@/lib/payments/query";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];

export type ClinicalPaymentPatientOption = Pick<PatientRow, "id" | "status"> & { name: string };

export type ClinicalPaymentCreationOptions = {
  patients: ClinicalPaymentPatientOption[];
  preselectedPatientId: string;
  clinicDate: string;
  clinicTime: string;
  timeZone: string;
};

export type ClinicalPaymentCreationOptionsResult =
  | { state: "ready"; data: ClinicalPaymentCreationOptions }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "forbidden"; data: null }
  | { state: "error"; data: null };

export type CreateClinicalPaymentResult =
  | { state: "success"; patientId: string }
  | { state: "unauthenticated" }
  | { state: "no_active_membership" }
  | { state: "forbidden" }
  | {
      state: "validation_error";
      error: string;
      fieldErrors?: ClinicalPaymentFieldErrors;
      values: ClinicalPaymentFormValues;
    }
  | {
      state: "error";
      error: string;
      fieldErrors?: ClinicalPaymentFieldErrors;
      values: ClinicalPaymentFormValues;
    };

export async function getClinicalPaymentCreationOptions(
  requestedPatientId?: string
): Promise<ClinicalPaymentCreationOptionsResult> {
  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  if (!canCreateClinicalPayments(context.tenant.membership.role)) {
    return { state: "forbidden", data: null };
  }

  let defaults: { date: string; time: string };

  try {
    defaults = getClinicLocalPaymentDefaults(context.tenant.clinic.timezone);
  } catch {
    logger.error("Clinical payment creation timezone is invalid", {
      component: "create_clinical_payment",
      status: "timezone_error"
    });
    return { state: "error", data: null };
  }

  const supabase = await createClient();
  const patientsResult = await supabase
    .from("patients")
    .select("id, full_name, status")
    .eq("clinic_id", context.tenant.clinic.id)
    .order("full_name", { ascending: true });

  if (patientsResult.error) {
    logger.error("Clinical payment patient options query failed", {
      component: "create_clinical_payment",
      status: "patient_options_error",
      code: patientsResult.error.code
    });
    return { state: "error", data: null };
  }

  const patients = ((patientsResult.data ?? []) as Pick<PatientRow, "id" | "full_name" | "status">[]).map(
    (patient) => ({ id: patient.id, name: patient.full_name, status: patient.status })
  );
  const preselectedPatientId =
    requestedPatientId &&
    isCanonicalPaymentUuid(requestedPatientId) &&
    patients.some((patient) => patient.id === requestedPatientId)
      ? requestedPatientId
      : "";

  return {
    state: "ready",
    data: {
      patients,
      preselectedPatientId,
      clinicDate: defaults.date,
      clinicTime: defaults.time,
      timeZone: context.tenant.clinic.timezone
    }
  };
}

export async function createClinicalPaymentForActiveTenant(
  values: ClinicalPaymentFormValues
): Promise<CreateClinicalPaymentResult> {
  const context = await getActiveTenantContext();

  if (context.state === "error") {
    return { state: "error", error: "No fue posible resolver la clínica activa. Intenta nuevamente.", values };
  }

  if (context.state !== "ready") {
    return { state: context.state };
  }

  if (!canCreateClinicalPayments(context.tenant.membership.role)) {
    return { state: "forbidden" };
  }

  const validation = validateClinicalPaymentFormValues(values);

  if (!validation.valid) {
    return {
      state: "validation_error",
      error: "Revisa los campos marcados antes de registrar el pago.",
      fieldErrors: validation.fieldErrors,
      values
    };
  }

  const input = validation.data;
  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const patientResult = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", input.patientId)
    .maybeSingle();

  if (patientResult.error) {
    logger.error("Clinical payment patient validation failed", {
      component: "create_clinical_payment",
      status: "patient_validation_error",
      code: patientResult.error.code
    });
    return { state: "error", error: "No fue posible validar el paciente. Intenta nuevamente.", values };
  }

  if (!patientResult.data) {
    return {
      state: "validation_error",
      error: "Revisa el paciente seleccionado.",
      fieldErrors: { patientId: "El paciente no pertenece a la clínica activa." },
      values
    };
  }

  const timestamp = resolveClinicalPaymentTimestamp(
    input.status,
    input.paidDate,
    input.paidTime,
    context.tenant.clinic.timezone
  );

  if (timestamp.state !== "valid") {
    const message =
      timestamp.state === "future"
        ? "La fecha de un pago recibido no puede estar en el futuro."
        : timestamp.state === "ambiguous"
          ? "La hora ocurre dos veces por el cambio de horario. Selecciona otra hora."
          : timestamp.state === "nonexistent"
            ? "La fecha u hora no existe en la zona horaria de la clínica."
            : "La zona horaria de la clínica no es válida.";

    return {
      state: "validation_error",
      error: "No fue posible interpretar la fecha del pago.",
      fieldErrors: { paidDate: message, paidTime: message },
      values
    };
  }

  const insertValues = {
    clinic_id: clinicId,
    patient_id: input.patientId,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    payment_method: input.paymentMethod,
    concept: input.concept,
    paid_at: timestamp.iso
  } satisfies PaymentInsert;
  const insertResult = await supabase.from("payments").insert(insertValues as never);

  if (insertResult.error) {
    logger.error("Clinical payment insert failed", {
      component: "create_clinical_payment",
      status: "insert_error",
      code: insertResult.error.code
    });
    return { state: "error", error: "No fue posible registrar el pago. Intenta nuevamente.", values };
  }

  return { state: "success", patientId: input.patientId };
}
