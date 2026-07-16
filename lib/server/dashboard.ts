import "server-only";

import { aggregateMxnPayments, type DashboardPayment } from "@/lib/dashboard/metrics";
import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { logger } from "@/lib/logger";
import { getActiveTenantContext, type ActiveTenant } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type AppointmentRow = Tables["appointments"]["Row"];

type AppointmentQueryRow = Pick<AppointmentRow, "id" | "starts_at" | "title" | "appointment_type" | "status"> & {
  patients: { full_name: string; clinic_id: string } | { full_name: string; clinic_id: string }[] | null;
};

export type DashboardAgendaItem = {
  id: string;
  startsAt: string;
  patientName: string;
  title: string;
  appointmentType: string | null;
  status: AppointmentRow["status"];
};

export type DashboardOverview = {
  tenant: ActiveTenant;
  localDate: string;
  patientCount: number;
  appointmentsToday: DashboardAgendaItem[];
  paidMxn: number;
  pendingMxn: number;
};

export type DashboardOverviewResult =
  | { state: "ready"; data: DashboardOverview }
  | { state: "unauthenticated"; data: null }
  | { state: "no_active_membership"; data: null }
  | { state: "error"; data: null };

function patientName(relation: AppointmentQueryRow["patients"]) {
  if (Array.isArray(relation)) {
    return relation[0]?.full_name ?? "Paciente";
  }

  return relation?.full_name ?? "Paciente";
}

export async function getDashboardOverview(): Promise<DashboardOverviewResult> {
  const context = await getActiveTenantContext();

  if (context.state !== "ready") {
    return { state: context.state, data: null };
  }

  const { tenant } = context;
  let dayRange;

  try {
    dayRange = getClinicDayRange(tenant.clinic.timezone);
  } catch {
    logger.error("Dashboard clinic timezone is invalid", {
      component: "dashboard",
      status: "timezone_error"
    });
    return { state: "error", data: null };
  }

  const supabase = await createClient();
  const [patientsResult, appointmentsResult, paymentsResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", tenant.clinic.id),
    supabase
      .from("appointments")
      .select("id, starts_at, title, appointment_type, status, patients!inner(full_name, clinic_id)")
      .eq("clinic_id", tenant.clinic.id)
      .eq("patients.clinic_id", tenant.clinic.id)
      .gte("starts_at", dayRange.startIso)
      .lt("starts_at", dayRange.endIso)
      .order("starts_at", { ascending: true }),
    supabase
      .from("payments")
      .select("amount, currency, status")
      .eq("clinic_id", tenant.clinic.id)
      .eq("currency", "MXN")
      .in("status", ["paid", "pending"])
  ]);

  if (patientsResult.error || appointmentsResult.error || paymentsResult.error) {
    logger.error("Dashboard tenant data query failed", {
      component: "dashboard",
      status: "data_query_error",
      patientsCode: patientsResult.error?.code,
      appointmentsCode: appointmentsResult.error?.code,
      paymentsCode: paymentsResult.error?.code
    });
    return { state: "error", data: null };
  }

  const appointmentRows = (appointmentsResult.data ?? []) as AppointmentQueryRow[];
  const paymentRows = (paymentsResult.data ?? []) as DashboardPayment[];
  const paymentTotals = aggregateMxnPayments(paymentRows);

  return {
    state: "ready",
    data: {
      tenant,
      localDate: dayRange.localDate,
      patientCount: patientsResult.count ?? 0,
      appointmentsToday: appointmentRows.map((appointment) => ({
        id: appointment.id,
        startsAt: appointment.starts_at,
        patientName: patientName(appointment.patients),
        title: appointment.title,
        appointmentType: appointment.appointment_type,
        status: appointment.status
      })),
      paidMxn: paymentTotals.paid,
      pendingMxn: paymentTotals.pending
    }
  };
}
