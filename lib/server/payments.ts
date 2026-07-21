import "server-only";

import { getClinicDateRange } from "@/lib/dashboard/timezone";
import { logger } from "@/lib/logger";
import {
  buildClinicalPaymentDateFilter,
  buildClinicalPaymentSearchFilter,
  getClinicalPaymentPagination,
  normalizeClinicalPaymentQuery,
  type ClinicalPaymentQuery,
  type ClinicalPaymentSearchParams,
  type ClinicalPaymentStatus
} from "@/lib/payments/query";
import {
  mergeClinicalPaymentSummaries,
  summarizeClinicalPayments,
  type ClinicalPaymentCurrencySummary,
  type ClinicalPaymentSummaryRow
} from "@/lib/payments/format";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
const paymentSummaryBatchSize = 1000;

type PatientRelation =
  | { id: string; full_name: string; clinic_id: string }
  | { id: string; full_name: string; clinic_id: string }[]
  | null;

type PaymentQueryRow = Pick<
  PaymentRow,
  | "id"
  | "patient_id"
  | "amount"
  | "currency"
  | "status"
  | "payment_method"
  | "concept"
  | "paid_at"
  | "created_at"
> & { patients: PatientRelation };

export type ClinicalPaymentItem = Omit<PaymentQueryRow, "patients"> & {
  patientName: string | null;
};

export type ClinicalPaymentPatientOption = {
  id: string;
  name: string;
};

export type ClinicalPaymentData = {
  payments: ClinicalPaymentItem[];
  patients: ClinicalPaymentPatientOption[];
  methods: string[];
  summaries: ClinicalPaymentCurrencySummary[];
  query: ClinicalPaymentQuery;
  timeZone: string;
  totalPayments: number;
  filteredTotal: number;
  page: number;
  pageCount: number;
  visibleFrom: number;
  visibleTo: number;
};

export type ClinicalPaymentResult =
  | { state: "ready"; data: ClinicalPaymentData }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "error"; data: null };

type PaymentFilterBuilder<T> = T & {
  eq(column: string, value: string): T;
  or(filters: string): T;
};

function applyPaymentFilters<T>(
  query: PaymentFilterBuilder<T>,
  filters: ClinicalPaymentQuery,
  dateFilter: string | null,
  searchFilter: string | null
) {
  let filtered = query;

  if (filters.status) filtered = filtered.eq("status", filters.status) as PaymentFilterBuilder<T>;
  if (filters.patient) filtered = filtered.eq("patient_id", filters.patient) as PaymentFilterBuilder<T>;
  if (filters.method) filtered = filtered.eq("payment_method", filters.method) as PaymentFilterBuilder<T>;
  if (dateFilter) filtered = filtered.or(dateFilter) as PaymentFilterBuilder<T>;
  if (searchFilter) filtered = filtered.or(searchFilter) as PaymentFilterBuilder<T>;

  return filtered;
}

function relationPatient(relation: PatientRelation) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

async function getFilteredPaymentSummaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  filters: ClinicalPaymentQuery,
  dateFilter: string | null,
  searchFilter: string | null
) {
  let summaries: ClinicalPaymentCurrencySummary[] = [];
  let offset = 0;

  while (true) {
    const batchQuery = applyPaymentFilters(
      supabase
        .from("payments")
        .select("amount, currency, status")
        .eq("clinic_id", clinicId),
      filters,
      dateFilter,
      searchFilter
    );
    const batchResult = await batchQuery
      .order("id", { ascending: true })
      .range(offset, offset + paymentSummaryBatchSize - 1);

    if (batchResult.error) {
      return { data: null, error: batchResult.error };
    }

    const rows = (batchResult.data ?? []) as ClinicalPaymentSummaryRow[];
    summaries = mergeClinicalPaymentSummaries(summaries, summarizeClinicalPayments(rows));

    if (rows.length < paymentSummaryBatchSize) {
      return { data: summaries, error: null };
    }

    offset += paymentSummaryBatchSize;
  }
}

export async function getClinicalPaymentsForActiveTenant(
  searchParams: ClinicalPaymentSearchParams
): Promise<ClinicalPaymentResult> {
  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  const clinicId = context.tenant.clinic.id;
  const timeZone = context.tenant.clinic.timezone;
  const initialQuery = normalizeClinicalPaymentQuery(searchParams);
  const supabase = await createClient();
  const [patientOptionsResult, totalPaymentsResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name")
      .eq("clinic_id", clinicId)
      .order("full_name", { ascending: true })
      .limit(100),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId)
  ]);

  if (patientOptionsResult.error || totalPaymentsResult.error) {
    logger.error("Clinical payment filter context query failed", {
      component: "clinical_payments",
      status: "context_query_error",
      patientsCode: patientOptionsResult.error?.code,
      totalCode: totalPaymentsResult.error?.code
    });
    return { state: "error", data: null };
  }

  const patients = ((patientOptionsResult.data ?? []) as { id: string; full_name: string }[]).map((patient) => ({
    id: patient.id,
    name: patient.full_name
  }));
  const methodSet = new Set<string>();
  let methodOffset = 0;

  while (true) {
    const methodRowsResult = await supabase
      .from("payments")
      .select("payment_method")
      .eq("clinic_id", clinicId)
      .not("payment_method", "is", null)
      .order("payment_method", { ascending: true })
      .order("id", { ascending: true })
      .range(methodOffset, methodOffset + paymentSummaryBatchSize - 1);

    if (methodRowsResult.error) {
      logger.error("Clinical payment method options query failed", {
        component: "clinical_payments",
        status: "method_options_error",
        code: methodRowsResult.error.code
      });
      return { state: "error", data: null };
    }

    const methodRows = (methodRowsResult.data ?? []) as { payment_method: string | null }[];
    methodRows.forEach((row) => {
      const method = row.payment_method?.trim();
      if (method) methodSet.add(method);
    });

    if (methodRows.length < paymentSummaryBatchSize) break;
    methodOffset += paymentSummaryBatchSize;
  }

  const methods = Array.from(methodSet).sort((left, right) => left.localeCompare(right, "es-MX"));
  let query: ClinicalPaymentQuery = {
    ...initialQuery,
    method: initialQuery.method && methods.includes(initialQuery.method) ? initialQuery.method : null
  };

  if (initialQuery.method && !query.method) {
    query = { ...query, filtersWereNormalized: true };
  }

  if (query.patient && !patients.some((patient) => patient.id === query.patient)) {
    const selectedPatientResult = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("clinic_id", clinicId)
      .eq("id", query.patient)
      .maybeSingle();

    if (selectedPatientResult.error) {
      logger.error("Clinical payment patient validation failed", {
        component: "clinical_payments",
        status: "patient_validation_error",
        code: selectedPatientResult.error.code
      });
      return { state: "error", data: null };
    }

    const selectedPatient = selectedPatientResult.data as { id: string; full_name: string } | null;

    if (selectedPatient) {
      patients.push({ id: selectedPatient.id, name: selectedPatient.full_name });
      patients.sort((left, right) => left.name.localeCompare(right.name, "es-MX"));
    } else {
      query = { ...query, patient: null, filtersWereNormalized: true };
    }
  }

  let dateStartIso: string | null = null;
  let dateEndIso: string | null = null;

  try {
    if (query.dateFrom) dateStartIso = getClinicDateRange(timeZone, query.dateFrom).startIso;
    if (query.dateTo) dateEndIso = getClinicDateRange(timeZone, query.dateTo).endIso;
  } catch {
    logger.error("Clinical payment date range is invalid", {
      component: "clinical_payments",
      status: "date_range_error"
    });
    return { state: "error", data: null };
  }

  let matchingPatientIds: string[] = [];

  if (query.search) {
    const patientMatchesResult = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .ilike("full_name", `%${query.search}%`)
      .limit(500);

    if (patientMatchesResult.error) {
      logger.error("Clinical payment patient search failed", {
        component: "clinical_payments",
        status: "patient_search_error",
        code: patientMatchesResult.error.code
      });
      return { state: "error", data: null };
    }

    matchingPatientIds = ((patientMatchesResult.data ?? []) as { id: string }[]).map((patient) => patient.id);
  }

  const dateFilter = buildClinicalPaymentDateFilter(dateStartIso, dateEndIso);
  const searchFilter = buildClinicalPaymentSearchFilter(query.search, matchingPatientIds);
  const countQuery = applyPaymentFilters(
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    query,
    dateFilter,
    searchFilter
  );
  const summaryPromise = getFilteredPaymentSummaries(
    supabase,
    clinicId,
    query,
    dateFilter,
    searchFilter
  );
  const [countResult, summaryResult] = await Promise.all([countQuery, summaryPromise]);

  if (countResult.error || summaryResult.error) {
    logger.error("Clinical payment summary query failed", {
      component: "clinical_payments",
      status: "summary_query_error",
      countCode: countResult.error?.code,
      summaryCode: summaryResult.error?.code
    });
    return { state: "error", data: null };
  }

  const filteredTotal = countResult.count ?? 0;
  const pagination = getClinicalPaymentPagination(filteredTotal, query.page);
  query = { ...query, page: pagination.page };
  const rowsQuery = applyPaymentFilters(
    supabase
      .from("payments")
      .select(
        "id, patient_id, amount, currency, status, payment_method, concept, paid_at, created_at, patients(id, full_name, clinic_id)"
      )
      .eq("clinic_id", clinicId)
      .eq("patients.clinic_id", clinicId),
    query,
    dateFilter,
    searchFilter
  );
  const rowsResult = await rowsQuery
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(pagination.from, pagination.to);

  if (rowsResult.error) {
    logger.error("Clinical payment list query failed", {
      component: "clinical_payments",
      status: "list_query_error",
      code: rowsResult.error.code
    });
    return { state: "error", data: null };
  }

  const rows = (rowsResult.data ?? []) as PaymentQueryRow[];
  const payments = rows.map((payment) => {
    const patient = relationPatient(payment.patients);

    return {
      id: payment.id,
      patient_id: payment.patient_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      payment_method: payment.payment_method,
      concept: payment.concept,
      paid_at: payment.paid_at,
      created_at: payment.created_at,
      patientName: patient?.clinic_id === clinicId ? patient.full_name : null
    };
  });

  return {
    state: "ready",
    data: {
      payments,
      patients,
      methods,
      summaries: summaryResult.data ?? [],
      query,
      timeZone,
      totalPayments: totalPaymentsResult.count ?? 0,
      filteredTotal,
      page: pagination.page,
      pageCount: pagination.pageCount,
      visibleFrom: filteredTotal === 0 ? 0 : pagination.from + 1,
      visibleTo: Math.min(pagination.to + 1, filteredTotal)
    }
  };
}
