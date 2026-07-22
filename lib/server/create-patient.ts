import "server-only";

import {
  canCreatePatients,
  validatePatientFormValues,
  type PatientFieldErrors,
  type PatientFormValues
} from "@/lib/patients/create";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import {
  getPatientClinicToday,
  getPatientFormOptions,
  type PatientDoctorOption
} from "@/lib/server/patient-form-options";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PatientInsert = Database["public"]["Tables"]["patients"]["Insert"];

export type { PatientDoctorOption } from "@/lib/server/patient-form-options";

export type PatientCreationOptions = {
  doctors: PatientDoctorOption[];
  clinicToday: string;
};

export type PatientCreationOptionsResult =
  | { state: "ready"; data: PatientCreationOptions }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "forbidden"; data: null }
  | { state: "error"; data: null };

export type CreatePatientResult =
  | { state: "success"; patientId: string }
  | { state: "unauthenticated" }
  | { state: "no_active_membership" }
  | { state: "forbidden" }
  | {
      state: "validation_error" | "duplicate" | "error";
      error: string;
      fieldErrors?: PatientFieldErrors;
      values: PatientFormValues;
    };

export async function getPatientCreationOptions(): Promise<PatientCreationOptionsResult> {
  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  if (!canCreatePatients(context.tenant.membership.role)) {
    return { state: "forbidden", data: null };
  }

  const supabase = await createClient();
  const optionsResult = await getPatientFormOptions(
    supabase,
    context.tenant.clinic.id,
    context.tenant.clinic.timezone
  );

  if (optionsResult.state !== "ready") {
    logger.error("Patient creation options query failed", {
      component: "create_patient",
      status: optionsResult.state,
      code: optionsResult.code ?? undefined
    });
    return { state: "error", data: null };
  }

  return {
    state: "ready",
    data: { doctors: optionsResult.doctors, clinicToday: optionsResult.clinicToday }
  };
}

export async function createPatientForActiveTenant(values: PatientFormValues): Promise<CreatePatientResult> {
  const context = await getActiveTenantContext();

  if (context.state === "error") {
    return {
      state: "error",
      error: "No fue posible resolver la clínica activa. Intenta nuevamente.",
      values
    };
  }

  if (context.state !== "ready") {
    return { state: context.state };
  }

  if (!canCreatePatients(context.tenant.membership.role)) {
    return { state: "forbidden" };
  }

  const clinicToday = getPatientClinicToday(context.tenant.clinic.timezone);

  if (!clinicToday) {
    logger.error("Patient creation validation context failed", {
      component: "create_patient",
      status: "timezone_error"
    });
    return { state: "error", error: "No fue posible validar los datos. Intenta nuevamente.", values };
  }

  const validation = validatePatientFormValues(values, clinicToday);

  if (!validation.valid) {
    return {
      state: "validation_error",
      error: "Revisa los campos marcados antes de crear el paciente.",
      fieldErrors: validation.fieldErrors,
      values
    };
  }

  const input = validation.data;
  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();

  if (input.primaryDoctorId) {
    const doctorResult = await supabase
      .from("doctor_public_profiles")
      .select("profile_id")
      .eq("clinic_id", clinicId)
      .eq("profile_id", input.primaryDoctorId)
      .limit(1)
      .maybeSingle();

    if (doctorResult.error) {
      logger.error("Patient primary doctor validation failed", {
        component: "create_patient",
        status: "doctor_validation_error",
        code: doctorResult.error.code
      });
      return {
        state: "error",
        error: "No fue posible validar el médico seleccionado. Intenta nuevamente.",
        values
      };
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
    if (!value) {
      continue;
    }

    const duplicateResult = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    if (duplicateResult.error) {
      logger.error("Patient duplicate check failed", {
        component: "create_patient",
        status: "duplicate_query_error",
        code: duplicateResult.error.code
      });
      return {
        state: "error",
        error: "No fue posible verificar posibles duplicados. Intenta nuevamente.",
        values
      };
    }

    if (duplicateResult.data) {
      return {
        state: "duplicate",
        error: "Ya existe un paciente con datos de contacto similares.",
        fieldErrors: {
          [column === "email" ? "email" : "phone"]: "Revisa este dato de contacto."
        },
        values
      };
    }
  }

  const insertValues = {
    clinic_id: clinicId,
    primary_doctor_id: input.primaryDoctorId,
    full_name: input.fullName,
    date_of_birth: input.dateOfBirth,
    sex: input.sex,
    phone: input.phone,
    email: input.email,
    relevant_history: input.relevantHistory,
    status: input.status
  } satisfies PatientInsert;
  // The hand-maintained Database type lacks generated relationship metadata, so this table infers insert as never.
  const insertResult = (await supabase
    .from("patients")
    .insert(insertValues as never)
    .select("id")
    .single()) as unknown as {
    data: { id: string } | null;
    error: { code: string } | null;
  };

  if (insertResult.error || !insertResult.data) {
    logger.error("Patient insert failed", {
      component: "create_patient",
      status: "insert_error",
      code: insertResult.error?.code ?? "missing_result"
    });
    return {
      state: "error",
      error: "No fue posible crear el paciente. Intenta nuevamente.",
      values
    };
  }

  return { state: "success", patientId: insertResult.data.id };
}
