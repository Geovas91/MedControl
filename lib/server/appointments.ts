import "server-only";

import {
  appointmentStatuses,
  buildAppointmentSearchFilter,
  getAppointmentAgendaPagination,
  getAppointmentPeriodBounds,
  hasAppointmentCreatedMessage,
  isAppointmentPeriodAscending,
  normalizeAppointmentQuery,
  summarizeAppointmentStatusCounts,
  type AppointmentDayTotals,
  type AppointmentPeriodBounds,
  type AppointmentQuery,
  type AppointmentSearchParams,
  type AppointmentStatus
} from "@/lib/appointments/query";
import { hasAppointmentUpdatedMessage } from "@/lib/appointments/edit";
import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { logger } from "@/lib/logger";
import { getActiveTenantContext, type ActiveTenant } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type PatientRelation =
  | { id: string; full_name: string; clinic_id: string }
  | { id: string; full_name: string; clinic_id: string }[]
  | null;
type AppointmentQueryRow = Pick<
  AppointmentRow,
  "id" | "patient_id" | "doctor_id" | "title" | "appointment_type" | "location" | "meeting_url" | "starts_at" | "ends_at" | "status"
> & { patients: PatientRelation };
type DoctorProfile = { profile_id: string | null; display_name: string };

export type AppointmentAgendaItem = Omit<AppointmentQueryRow, "patients"> & {
  patientName: string;
  doctorName: string | null;
};
export type AppointmentDoctorOption = { id: string; name: string };
export type AppointmentAgendaData = {
  tenant: ActiveTenant;
  query: AppointmentQuery;
  clinicToday: string;
  appointments: AppointmentAgendaItem[];
  doctors: AppointmentDoctorOption[];
  totals: AppointmentDayTotals;
  filteredTotal: number;
  page: number;
  pageCount: number;
  visibleFrom: number;
  visibleTo: number;
  created: boolean;
  updated: boolean;
};
export type AppointmentAgendaResult =
  | { state: "ready"; data: AppointmentAgendaData }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "error"; data: null };

function relationPatient(relation: PatientRelation) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

type FilterBuilder<T> = {
  eq(column: string, value: string): T;
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
  or(filters: string): T;
};

function applyAgendaFilters<T extends FilterBuilder<T>>(
  query: T,
  filters: AppointmentQuery,
  bounds: AppointmentPeriodBounds,
  searchFilter: string | null,
  includeStatus = true
) {
  let filteredQuery = query;
  if (bounds.startIso) filteredQuery = filteredQuery.gte("starts_at", bounds.startIso);
  if (bounds.endIso) filteredQuery = filteredQuery.lt("starts_at", bounds.endIso);
  if (includeStatus && filters.status) filteredQuery = filteredQuery.eq("status", filters.status);
  if (filters.doctor) filteredQuery = filteredQuery.eq("doctor_id", filters.doctor);
  if (searchFilter) filteredQuery = filteredQuery.or(searchFilter);
  return filteredQuery;
}

function emptyAgendaData(
  context: Extract<Awaited<ReturnType<typeof getActiveTenantContext>>, { state: "ready" }>,
  query: AppointmentQuery,
  clinicToday: string,
  doctors: AppointmentDoctorOption[],
  searchParams: AppointmentSearchParams
): AppointmentAgendaData {
  return {
    tenant: context.tenant,
    query,
    clinicToday,
    appointments: [],
    doctors,
    totals: summarizeAppointmentStatusCounts({}),
    filteredTotal: 0,
    page: 1,
    pageCount: 1,
    visibleFrom: 0,
    visibleTo: 0,
    created: hasAppointmentCreatedMessage(searchParams),
    updated: hasAppointmentUpdatedMessage(searchParams)
  };
}

export async function getAppointmentAgendaForActiveTenant(
  searchParams: AppointmentSearchParams
): Promise<AppointmentAgendaResult> {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };

  const clinicId = context.tenant.clinic.id;
  const timeZone = context.tenant.clinic.timezone;
  let clinicToday: string;
  let initialQuery: AppointmentQuery;

  try {
    clinicToday = getClinicDayRange(timeZone).localDate;
    initialQuery = normalizeAppointmentQuery(searchParams, clinicToday);
  } catch {
    logger.error("Appointment agenda timezone is invalid", { component: "appointments", status: "date_range_error" });
    return { state: "error", data: null };
  }

  const supabase = await createClient();
  const doctorsResult = await supabase
    .from("doctor_public_profiles")
    .select("profile_id, display_name")
    .eq("clinic_id", clinicId)
    .not("profile_id", "is", null)
    .order("display_name", { ascending: true })
    .limit(100);

  if (doctorsResult.error) {
    logger.error("Appointment agenda doctor options query failed", {
      component: "appointments",
      status: "doctor_options_error",
      code: doctorsResult.error.code
    });
    return { state: "error", data: null };
  }

  const doctors = ((doctorsResult.data ?? []) as DoctorProfile[])
    .filter((profile): profile is DoctorProfile & { profile_id: string } => Boolean(profile.profile_id))
    .map((profile) => ({ id: profile.profile_id, name: profile.display_name }));
  const doctorIsAllowed = initialQuery.doctor ? doctors.some((doctor) => doctor.id === initialQuery.doctor) : true;
  const query: AppointmentQuery = {
    ...initialQuery,
    doctor: doctorIsAllowed ? initialQuery.doctor : null,
    filtersWereNormalized: initialQuery.filtersWereNormalized || !doctorIsAllowed
  };

  if (query.rangeError) {
    return { state: "ready", data: emptyAgendaData(context, query, clinicToday, doctors, searchParams) };
  }

  let bounds: AppointmentPeriodBounds;
  try {
    bounds = getAppointmentPeriodBounds(query, timeZone, new Date());
  } catch {
    logger.error("Appointment agenda period is invalid", { component: "appointments", status: "period_range_error" });
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
      logger.error("Appointment agenda patient search failed", {
        component: "appointments",
        status: "patient_search_error",
        code: patientMatchesResult.error.code
      });
      return { state: "error", data: null };
    }
    matchingPatientIds = ((patientMatchesResult.data ?? []) as { id: string }[]).map((patient) => patient.id);
  }

  const searchFilter = buildAppointmentSearchFilter(query.search, matchingPatientIds);
  const countResults = await Promise.all(
    appointmentStatuses.map((status) => {
      if (query.status && query.status !== status) return Promise.resolve({ count: 0, error: null });
      const countQuery = applyAgendaFilters(
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
        query,
        bounds,
        searchFilter,
        false
      );
      return countQuery.eq("status", status);
    })
  );

  const countError = countResults.find((result) => result.error)?.error;
  if (countError) {
    logger.error("Appointment agenda metrics query failed", {
      component: "appointments",
      status: "metrics_query_error",
      code: countError.code
    });
    return { state: "error", data: null };
  }

  const counts = Object.fromEntries(
    appointmentStatuses.map((status, index) => [status, countResults[index].count ?? 0])
  ) as Record<AppointmentStatus, number>;
  const totals = summarizeAppointmentStatusCounts(counts);
  const pagination = getAppointmentAgendaPagination(totals.total, query.page);
  const normalizedQuery = { ...query, page: pagination.page };
  const ascending = isAppointmentPeriodAscending(query.period);
  const rowsQuery = applyAgendaFilters(
    supabase
      .from("appointments")
      .select(
        "id, patient_id, doctor_id, title, appointment_type, location, meeting_url, starts_at, ends_at, status, patients!appointments_clinic_patient_fk!inner(id, full_name, clinic_id)"
      )
      .eq("clinic_id", clinicId)
      .eq("patients.clinic_id", clinicId),
    normalizedQuery,
    bounds,
    searchFilter
  );
  const appointmentsResult = await rowsQuery
    .order("starts_at", { ascending })
    .order("id", { ascending })
    .range(pagination.from, pagination.to);

  if (appointmentsResult.error) {
    logger.error("Appointment agenda data query failed", {
      component: "appointments",
      status: "data_query_error",
      code: appointmentsResult.error.code
    });
    return { state: "error", data: null };
  }

  const doctorNames = new Map(doctors.map((doctor) => [doctor.id, doctor.name]));
  const appointments = ((appointmentsResult.data ?? []) as AppointmentQueryRow[]).map((appointment) => {
    const patient = relationPatient(appointment.patients);
    return {
      id: appointment.id,
      patient_id: appointment.patient_id,
      doctor_id: appointment.doctor_id,
      title: appointment.title,
      appointment_type: appointment.appointment_type,
      location: appointment.location,
      meeting_url: appointment.meeting_url,
      starts_at: appointment.starts_at,
      ends_at: appointment.ends_at,
      status: appointment.status,
      patientName: patient?.clinic_id === clinicId ? patient.full_name : "Sin registro",
      doctorName: appointment.doctor_id ? doctorNames.get(appointment.doctor_id) ?? null : null
    };
  });

  return {
    state: "ready",
    data: {
      tenant: context.tenant,
      query: normalizedQuery,
      clinicToday,
      doctors,
      totals,
      filteredTotal: totals.total,
      page: pagination.page,
      pageCount: pagination.pageCount,
      visibleFrom: totals.total === 0 ? 0 : pagination.from + 1,
      visibleTo: Math.min(pagination.to + 1, totals.total),
      appointments,
      created: hasAppointmentCreatedMessage(searchParams),
      updated: hasAppointmentUpdatedMessage(searchParams)
    }
  };
}
