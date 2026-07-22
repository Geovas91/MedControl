import "server-only";

import { logger } from "@/lib/logger";
import {
  getPatientEditInitialValues,
  buildPatientUpdate,
  canEditPatients,
  type EditablePatient
} from "@/lib/patients/edit";
import {
  validatePatientFormValues,
  type PatientFieldErrors,
  type PatientFormValues
} from "@/lib/patients/create";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import {
  getPatientClinicToday,
  getPatientFormOptions,
  type PatientDoctorOption
} from "@/lib/server/patient-form-options";
import { createClient } from "@/lib/supabase/server";

export type PatientEditData = {
  patient: EditablePatient;
  initialValues: PatientFormValues;
  doctors: PatientDoctorOption[];
  clinicToday: string;
};

export type PatientEditResult =
  | { state: "ready"; data: PatientEditData }
  | { state: "invalid_id"; data: null }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "forbidden"; data: null }
  | { state: "not_found"; data: null }
  | { state: "error"; data: null };

export type UpdatePatientResult =
  | { state: "success"; patientId: string }
  | { state: "invalid_id" }
  | { state: "unauthenticated" }
  | { state: "no_active_membership" }
  | { state: "forbidden" }
  | { state: "not_found" }
  | {
      state: "validation_error" | "duplicate" | "error";
      error: string;
      fieldErrors?: PatientFieldErrors;
      values: PatientFormValues;
    };

const editablePatientColumns =
  "id, full_name, status, email, phone, date_of_birth, sex, relevant_history, primary_doctor_id";

export async function getPatientEditForActiveTenant(patientId: string): Promise<PatientEditResult> {
  if (!isValidPatientUuid(patientId)) {
    return { state: "invalid_id", data: null };
  }

  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  if (!canEditPatients(context.tenant.membership.role)) {
    return { state: "forbidden", data: null };
  }

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const [patientResult, optionsResult] = await Promise.all([
    supabase
      .from("patients")
      .select(editablePatientColumns)
      .eq("id", patientId)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    getPatientFormOptions(supabase, clinicId, context.tenant.clinic.timezone)
  ]);

  if (patientResult.error || optionsResult.state !== "ready") {
    logger.error("Patient edit context query failed", {
      component: "edit_patient",
      status: "context_query_error",
      patientCode: patientResult.error?.code,
      optionsCode: optionsResult.code ?? undefined
    });
    return { state: "error", data: null };
  }

  if (!patientResult.data) {
    return { state: "not_found", data: null };
  }

  const patient = patientResult.data as EditablePatient;

  return {
    state: "ready",
    data: {
      patient,
      initialValues: getPatientEditInitialValues(patient),
      doctors: optionsResult.doctors,
      clinicToday: optionsResult.clinicToday
    }
  };
}

export async function updatePatientForActiveTenant(
  patientId: string,
  values: PatientFormValues
): Promise<UpdatePatientResult> {
  if (!isValidPatientUuid(patientId)) {
    return { state: "invalid_id" };
  }

  const context = await getActiveTenantContext();

  if (context.state === "error") {
    return { state: "error", error: "No fue posible resolver la clínica activa. Intenta nuevamente.", values };
  }

  if (context.state !== "ready") {
    return { state: context.state };
  }

  if (!canEditPatients(context.tenant.membership.role)) {
    return { state: "forbidden" };
  }

  const clinicId = context.tenant.clinic.id;
  const clinicToday = getPatientClinicToday(context.tenant.clinic.timezone);

  if (!clinicToday) {
    logger.error("Patient edit validation context failed", {
      component: "edit_patient",
      status: "timezone_error"
    });
    return { state: "error", error: "No fue posible validar los datos. Intenta nuevamente.", values };
  }

  const validation = validatePatientFormValues(values, clinicToday);

  if (!validation.valid) {
    return {
      state: "validation_error",
      error: "Revisa los campos marcados antes de guardar los cambios.",
      fieldErrors: validation.fieldErrors,
      values
    };
  }

  const input = validation.data;
  const supabase = await createClient();
  const patientResult = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (patientResult.error) {
    logger.error("Patient edit ownership query failed", {
      component: "edit_patient",
      status: "ownership_query_error",
      code: patientResult.error.code
    });
    return { state: "error", error: "No fue posible validar el paciente. Intenta nuevamente.", values };
  }

  if (!patientResult.data) {
    return { state: "not_found" };
  }

  if (input.primaryDoctorId) {
    const doctorResult = await supabase
      .from("doctor_public_profiles")
      .select("profile_id")
      .eq("clinic_id", clinicId)
      .eq("profile_id", input.primaryDoctorId)
      .limit(1)
      .maybeSingle();

    if (doctorResult.error) {
      logger.error("Patient edit doctor validation failed", {
        component: "edit_patient",
        status: "doctor_validation_error",
        code: doctorResult.error.code
      });
      return { state: "error", error: "No fue posible validar el médico. Intenta nuevamente.", values };
    }

    if (!doctorResult.data) {
      return {
        state: "validation_error",
        error: "Revisa el médico principal seleccionado.",
        fieldErrors: { primaryDoctorId: "El médico no pertenece a la clínica activa." },
        values
      };
    }
  }

  for (const [column, value] of [
    ["email", input.email],
    ["phone", input.phone]
  ] as const) {
    if (!value) continue;

    const duplicateResult = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .neq("id", patientId)
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    if (duplicateResult.error) {
      logger.error("Patient edit duplicate query failed", {
        component: "edit_patient",
        status: "duplicate_query_error",
        code: duplicateResult.error.code
      });
      return { state: "error", error: "No fue posible verificar posibles duplicados. Intenta nuevamente.", values };
    }

    if (duplicateResult.data) {
      return {
        state: "duplicate",
        error: "Ya existe un paciente con datos de contacto similares.",
        fieldErrors: { [column === "email" ? "email" : "phone"]: "Revisa este dato de contacto." },
        values
      };
    }
  }

  const updateResult = (await supabase
    .from("patients")
    .update(buildPatientUpdate(input) as never)
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .select("id")
    .maybeSingle()) as unknown as {
    data: { id: string } | null;
    error: { code: string } | null;
  };

  if (updateResult.error || !updateResult.data) {
    logger.error("Patient update failed", {
      component: "edit_patient",
      status: updateResult.error ? "update_error" : "missing_result",
      code: updateResult.error?.code
    });
    return { state: "error", error: "No fue posible actualizar el paciente. Intenta nuevamente.", values };
  }

  return { state: "success", patientId: updateResult.data.id };
}
