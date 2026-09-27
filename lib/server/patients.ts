import "server-only";

import { ASSISTANT_PATIENT_SUGGESTION_LIMIT, parseAssistantPatientQuery } from "@/lib/assistant/orchestration/patient-selection";
import { canCreatePatients } from "@/lib/patients/create";
import { getPatientPagination, type PatientListQuery } from "@/lib/patients/query";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type SchedulingPatient = Database["public"]["Functions"]["search_patient_names_for_scheduling"]["Returns"][number];
type SchedulingPatientRpcClient = {
  rpc(
    fn: "search_patient_names_for_scheduling",
    args: { p_clinic_id: string; p_professional_clinic_member_id: string; p_query: string; p_limit: number }
  ): Promise<{ data: SchedulingPatient[] | null; error: { code: string } | null }>;
};
type SchedulingEligibilityRpcClient = {
  rpc(
    fn: "is_patient_eligible_for_scheduling",
    args: { p_clinic_id: string; p_professional_clinic_member_id: string; p_patient_id: string }
  ): Promise<{ data: boolean | null; error: { code: string } | null }>;
};

export type PatientListItem = Pick<
  PatientRow,
  "id" | "full_name" | "internal_identifier" | "status" | "email" | "phone" | "date_of_birth" | "sex"
>;

export type PatientListData = {
  patients: PatientListItem[];
  totalPatients: number;
  filteredTotal: number;
  page: number;
  pageCount: number;
  pageSize: number;
  canCreate: boolean;
};

export type PatientListResult =
  | { state: "ready"; data: PatientListData }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "error"; data: null };

function applyPatientFilters<T extends {
  eq(column: string, value: string): T;
  or(filters: string): T;
}>(query: T, clinicId: string, filters: PatientListQuery) {
  let filteredQuery = query.eq("clinic_id", clinicId);

  if (filters.status) {
    filteredQuery = filteredQuery.eq("status", filters.status);
  }

  if (filters.search) {
    const value = `*${filters.search}*`;
    filteredQuery = filteredQuery.or(
      `full_name.ilike."${value}",email.ilike."${value}",phone.ilike."${value}",internal_identifier.ilike."${value}"`
    );
  }

  return filteredQuery;
}

export async function getPatientsForActiveTenant(filters: PatientListQuery): Promise<PatientListResult> {
  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const [totalResult, filteredCountResult] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    applyPatientFilters(
      supabase.from("patients").select("id", { count: "exact", head: true }),
      clinicId,
      filters
    )
  ]);

  if (totalResult.error || filteredCountResult.error) {
    logger.error("Patient list count query failed", {
      component: "patients",
      status: "count_query_error",
      totalCode: totalResult.error?.code,
      filteredCode: filteredCountResult.error?.code
    });
    return { state: "error", data: null };
  }

  const totalPatients = totalResult.count ?? 0;
  const filteredTotal = filteredCountResult.count ?? 0;
  const pagination = getPatientPagination(filteredTotal, filters.page, filters.pageSize);
  const patientsResult = await applyPatientFilters(
    supabase
      .from("patients")
      .select("id, full_name, internal_identifier, status, email, phone, date_of_birth, sex"),
    clinicId,
    filters
  )
    .order("full_name", { ascending: true })
    .range(pagination.from, pagination.to);

  if (patientsResult.error) {
    logger.error("Patient list data query failed", {
      component: "patients",
      status: "data_query_error",
      code: patientsResult.error.code
    });
    return { state: "error", data: null };
  }

  return {
    state: "ready",
    data: {
      patients: (patientsResult.data ?? []) as PatientListItem[],
      totalPatients,
      filteredTotal,
      page: pagination.page,
      pageCount: pagination.pageCount,
      pageSize: filters.pageSize,
      canCreate: canCreatePatients(context.tenant.membership.role)
    }
  };
}

/** Revalidates a patient reference with the authenticated tenant and current RLS scope. */
export async function isPatientAvailableForActiveTenant(patientId: string): Promise<boolean> {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return false;
  const result = await (await createClient())
    .from("patients")
    .select("id")
    .eq("clinic_id", context.tenant.clinic.id)
    .eq("id", patientId)
    .maybeSingle();
  return !result.error && Boolean(result.data);
}

/** Revalidates the exact pair in PostgreSQL under the authenticated actor and active clinic. */
export async function isPatientEligibleForSchedulingWithProfessionalActiveTenant(patientId: string, professionalClinicMemberId: string): Promise<boolean> {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return false;
  const client = await createClient() as unknown as SchedulingEligibilityRpcClient;
  const result = await client.rpc("is_patient_eligible_for_scheduling", {
    p_clinic_id: context.tenant.clinic.id,
    p_professional_clinic_member_id: professionalClinicMemberId,
    p_patient_id: patientId
  });
  if (result.error) {
    logger.error("Assistant patient eligibility check failed", { component: "appointment_assistant", code: result.error.code });
    return false;
  }
  return result.data === true;
}

/** Name-only assistant search under the authenticated actor and active clinic. */
export async function searchAssistantPatientNamesForActiveTenant(rawQuery: unknown, professionalClinicMemberId?: string) {
  const query = parseAssistantPatientQuery(rawQuery);
  if (!query) return { state: "invalid_query" as const, data: null };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };
  if (context.tenant.membership.role === "doctor" && professionalClinicMemberId && professionalClinicMemberId !== context.tenant.membership.id) {
    return { state: "forbidden" as const, data: null };
  }

  if (professionalClinicMemberId) {
    const client = await createClient() as unknown as SchedulingPatientRpcClient;
    const result = await client.rpc("search_patient_names_for_scheduling", {
      p_clinic_id: context.tenant.clinic.id,
      p_professional_clinic_member_id: professionalClinicMemberId,
      p_query: query,
      p_limit: ASSISTANT_PATIENT_SUGGESTION_LIMIT + 1
    });
    if (result.error) {
      logger.error("Assistant professional patient lookup failed", { component: "appointment_assistant", code: result.error.code });
      return { state: "error" as const, data: null };
    }
    const patients = (result.data ?? []).map((patient) => ({ id: patient.patient_id, name: patient.display_name }));
    return { state: "ready" as const, data: { patients: patients.slice(0, ASSISTANT_PATIENT_SUGGESTION_LIMIT), hasMore: patients.length > ASSISTANT_PATIENT_SUGGESTION_LIMIT } };
  }

  let search = (await createClient())
    .from("patients")
    .select("id, full_name")
    .eq("clinic_id", context.tenant.clinic.id);
  for (const term of query.split(" ")) search = search.ilike("full_name", `%${term}%`);
  const result = await search.order("full_name", { ascending: true }).limit(ASSISTANT_PATIENT_SUGGESTION_LIMIT + 1);
  if (result.error) {
    logger.error("Assistant patient name lookup failed", { component: "appointment_assistant", code: result.error.code });
    return { state: "error" as const, data: null };
  }
  const patients = ((result.data ?? []) as Pick<PatientRow, "id" | "full_name">[]).map((patient) => ({ id: patient.id, name: patient.full_name }));
  return { state: "ready" as const, data: { patients: patients.slice(0, ASSISTANT_PATIENT_SUGGESTION_LIMIT), hasMore: patients.length > ASSISTANT_PATIENT_SUGGESTION_LIMIT } };
}
