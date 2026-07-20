import "server-only";

import { canCreatePatients } from "@/lib/patients/create";
import { getPatientPagination, type PatientListQuery } from "@/lib/patients/query";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PatientRow = Database["public"]["Tables"]["patients"]["Row"];

export type PatientListItem = Pick<
  PatientRow,
  "id" | "full_name" | "status" | "email" | "phone" | "date_of_birth" | "sex"
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
      `full_name.ilike."${value}",email.ilike."${value}",phone.ilike."${value}"`
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
      .select("id, full_name, status, email, phone, date_of_birth, sex"),
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
