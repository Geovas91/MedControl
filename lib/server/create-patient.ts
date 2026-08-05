import "server-only";

import {
  canCreatePatients,
  validatePatientFormValues,
  type PatientFieldErrors,
  type PatientFormValues
} from "@/lib/patients/create";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canCreateWithEntitlements, getClinicEntitlements } from "@/lib/server/entitlements";
import {
  getPatientClinicToday,
  getPatientFormOptions,
  type PatientDoctorOption
} from "@/lib/server/patient-form-options";
import { createClient } from "@/lib/supabase/server";

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
  | { state: "success"; patientId: string; historyId: string; flowIntent: "complete_history" | "later" }
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

  if (!canCreateWithEntitlements(await getClinicEntitlements(context.tenant.clinic.id))) {
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

  const entitlements = await getClinicEntitlements(context.tenant.clinic.id);
  if (!canCreateWithEntitlements(entitlements)) {
    return { state: "forbidden", values } as CreatePatientResult;
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

  const rpcResult = await (supabase as any).rpc("create_patient_with_record", {
    p_clinic_id: clinicId,
    p_first_names: input.firstNames,
    p_paternal_surname: input.paternalSurname,
    p_maternal_surname: input.maternalSurname,
    p_date_of_birth: input.dateOfBirth,
    p_sex: input.sex,
    p_gender_identity: input.genderIdentity,
    p_phone: input.phone,
    p_email: input.email,
    p_address: input.address,
    p_marital_status: input.maritalStatus,
    p_occupation: input.occupation,
    p_education_level: input.educationLevel,
    p_status: input.status,
    p_emergency_contact_name: input.emergencyContactName,
    p_emergency_contact_relationship: input.emergencyContactRelationship,
    p_emergency_contact_phone: input.emergencyContactPhone,
    p_primary_doctor_id: input.primaryDoctorId
  });
  const created = rpcResult.data?.[0] as { patient_id: string; initial_history_id: string } | undefined;

  if (rpcResult.error || !created) {
    logger.error("Patient insert failed", {
      component: "create_patient",
      status: "atomic_rpc_error",
      code: rpcResult.error?.code ?? "missing_result"
    });
    if (rpcResult.error?.code === "23505") {
      return { state: "duplicate", error: "Ya existe un paciente con el mismo nombre, fecha de nacimiento y contacto.", values };
    }
    return {
      state: "error",
      error: "No fue posible crear el paciente y su expediente. No se guardó información parcial.",
      values
    };
  }

  return { state: "success", patientId: created.patient_id, historyId: created.initial_history_id, flowIntent: input.flowIntent };
}
