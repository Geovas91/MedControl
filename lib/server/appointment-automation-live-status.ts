import "server-only";

import {
  APPOINTMENT_AUTOMATION_LIVE_JOB_LIMIT,
  buildAppointmentAutomationLiveStatus,
  canViewAppointmentAutomationLiveStatus,
  sanitizeAppointmentAutomationCode,
  type AppointmentAutomationDashboardSource,
  type AppointmentAutomationLiveStatus,
  type AppointmentAutomationSchedulerSource
} from "@/lib/appointment-automation-live-status";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";

type LiveStatusRpcClient = {
  rpc(fn: "get_appointment_automation_scheduler_status_for_current_user", args: { p_clinic_id: string }): Promise<{ data: AppointmentAutomationSchedulerSource[] | null; error: { code?: string } | null }>;
  rpc(fn: "get_appointment_automation_dashboard_for_current_user", args: { p_clinic_id: string; p_limit: number }): Promise<{ data: AppointmentAutomationDashboardSource[] | null; error: { code?: string } | null }>;
};

export type AppointmentAutomationLiveStatusResult =
  | { state: "ready"; data: AppointmentAutomationLiveStatus }
  | { state: "unauthenticated" | "no_active_membership" | "forbidden" | "error"; data: null };

export async function getAppointmentAutomationLiveStatusForActiveTenant(): Promise<AppointmentAutomationLiveStatusResult> {
  const context = await getActiveTenantContext();
  if (context.state === "error") return { state: "error", data: null };
  if (context.state !== "ready") return { state: context.state, data: null };
  if (!canViewAppointmentAutomationLiveStatus(context.tenant.membership.role)) {
    return { state: "forbidden", data: null };
  }

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient() as unknown as LiveStatusRpcClient;
  const [schedulerResult, jobsResult] = await Promise.all([
    supabase.rpc("get_appointment_automation_scheduler_status_for_current_user", { p_clinic_id: clinicId }),
    supabase.rpc("get_appointment_automation_dashboard_for_current_user", {
      p_clinic_id: clinicId,
      p_limit: APPOINTMENT_AUTOMATION_LIVE_JOB_LIMIT
    })
  ]);

  if (schedulerResult.error || jobsResult.error) {
    logger.error("Appointment automation live status query failed", {
      component: "appointment_automation_live_status",
      status: "query_error",
      schedulerCode: sanitizeAppointmentAutomationCode(schedulerResult.error?.code),
      jobsCode: sanitizeAppointmentAutomationCode(jobsResult.error?.code)
    });
    return { state: "error", data: null };
  }

  return {
    state: "ready",
    data: buildAppointmentAutomationLiveStatus({
      scheduler: schedulerResult.data?.[0] ?? null,
      jobs: jobsResult.data ?? [],
      cronConfigured: Boolean(process.env.APPOINTMENT_AUTOMATION_CRON_SECRET)
    })
  };
}
