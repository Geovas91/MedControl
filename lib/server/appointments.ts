import "server-only";

import {
  hasAppointmentCreatedMessage,
  matchesAppointmentSearch,
  normalizeAppointmentQuery,
  summarizeAppointmentStatuses,
  type AppointmentDayTotals,
  type AppointmentQuery,
  type AppointmentSearchParams
} from "@/lib/appointments/query";
import { getClinicDateRange, getClinicDayRange } from "@/lib/dashboard/timezone";
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
  | "id"
  | "patient_id"
  | "doctor_id"
  | "title"
  | "appointment_type"
  | "location"
  | "meeting_url"
  | "starts_at"
  | "ends_at"
  | "status"
> & {
  patients: PatientRelation;
};

type DoctorProfile = {
  profile_id: string | null;
  display_name: string;
};

export type AppointmentAgendaItem = Omit<AppointmentQueryRow, "patients"> & {
  patientName: string;
  doctorName: string | null;
};

export type AppointmentDoctorOption = {
  id: string;
  name: string;
};

export type AppointmentAgendaData = {
  tenant: ActiveTenant;
  query: AppointmentQuery;
  clinicToday: string;
  appointments: AppointmentAgendaItem[];
  doctors: AppointmentDoctorOption[];
  totals: AppointmentDayTotals;
  created: boolean;
};

export type AppointmentAgendaResult =
  | { state: "ready"; data: AppointmentAgendaData }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "error"; data: null };

function relationPatient(relation: PatientRelation) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function applyAgendaFilters<T extends {
  eq(column: string, value: string): T;
}>(query: T, filters: AppointmentQuery) {
  let filteredQuery = query;

  if (filters.status) {
    filteredQuery = filteredQuery.eq("status", filters.status);
  }

  if (filters.doctor) {
    filteredQuery = filteredQuery.eq("doctor_id", filters.doctor);
  }

  return filteredQuery;
}

export async function getAppointmentAgendaForActiveTenant(
  searchParams: AppointmentSearchParams
): Promise<AppointmentAgendaResult> {
  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  const clinicId = context.tenant.clinic.id;
  let clinicToday: string;
  let dayRange;

  try {
    clinicToday = getClinicDayRange(context.tenant.clinic.timezone).localDate;
    const normalizedQuery = normalizeAppointmentQuery(searchParams, clinicToday);
    dayRange = getClinicDateRange(context.tenant.clinic.timezone, normalizedQuery.date);
  } catch {
    logger.error("Appointment agenda date range is invalid", {
      component: "appointments",
      status: "date_range_error"
    });
    return { state: "error", data: null };
  }

  const initialQuery = normalizeAppointmentQuery(searchParams, clinicToday);
  const supabase = await createClient();
  const allDayQuery = supabase
    .from("appointments")
    .select("id, status")
    .eq("clinic_id", clinicId)
    .gte("starts_at", dayRange.startIso)
    .lt("starts_at", dayRange.endIso);
  const doctorsQuery = supabase
    .from("doctor_public_profiles")
    .select("profile_id, display_name")
    .eq("clinic_id", clinicId)
    .not("profile_id", "is", null)
    .order("display_name", { ascending: true })
    .limit(100);
  const [allDayResult, doctorsResult] = await Promise.all([allDayQuery, doctorsQuery]);

  if (allDayResult.error || doctorsResult.error) {
    logger.error("Appointment agenda context query failed", {
      component: "appointments",
      status: "context_query_error",
      totalsCode: allDayResult.error?.code,
      doctorsCode: doctorsResult.error?.code
    });
    return { state: "error", data: null };
  }

  const doctorProfiles = (doctorsResult.data ?? []) as DoctorProfile[];
  const doctors = doctorProfiles
    .filter((profile): profile is DoctorProfile & { profile_id: string } => Boolean(profile.profile_id))
    .map((profile) => ({ id: profile.profile_id, name: profile.display_name }));
  const doctorIsAllowed = initialQuery.doctor
    ? doctors.some((doctor) => doctor.id === initialQuery.doctor)
    : true;
  const query: AppointmentQuery = {
    ...initialQuery,
    doctor: doctorIsAllowed ? initialQuery.doctor : null
  };
  const appointmentQuery = supabase
    .from("appointments")
    .select(
      "id, patient_id, doctor_id, title, appointment_type, location, meeting_url, starts_at, ends_at, status, patients!inner(id, full_name, clinic_id)"
    )
    .eq("clinic_id", clinicId)
    .eq("patients.clinic_id", clinicId)
    .gte("starts_at", dayRange.startIso)
    .lt("starts_at", dayRange.endIso)
    .order("starts_at", { ascending: true });
  const appointmentsResult = await applyAgendaFilters(appointmentQuery, query);

  if (appointmentsResult.error) {
    logger.error("Appointment agenda data query failed", {
      component: "appointments",
      status: "data_query_error",
      code: appointmentsResult.error.code
    });
    return { state: "error", data: null };
  }

  const doctorNames = new Map(doctors.map((doctor) => [doctor.id, doctor.name]));
  const allDayRows = (allDayResult.data ?? []) as Pick<AppointmentRow, "status">[];
  const rows = (appointmentsResult.data ?? []) as AppointmentQueryRow[];
  const appointments = rows
    .map((appointment) => {
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
        patientName: patient?.full_name ?? "Sin registro",
        doctorName: appointment.doctor_id ? doctorNames.get(appointment.doctor_id) ?? null : null
      };
    })
    .filter((appointment) => matchesAppointmentSearch(appointment.title, appointment.patientName, query.search));

  return {
    state: "ready",
    data: {
      tenant: context.tenant,
      query,
      clinicToday,
      doctors,
      totals: summarizeAppointmentStatuses(allDayRows.map((appointment) => appointment.status)),
      appointments,
      created: hasAppointmentCreatedMessage(searchParams)
    }
  };
}
