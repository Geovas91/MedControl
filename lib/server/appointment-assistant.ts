import "server-only";

import {
  APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE,
  APPOINTMENT_ASSISTANT_UPCOMING_LIMIT,
  canManageAppointmentAssistant,
  getAppointmentAssistantActivityCursor,
  type AppointmentAssistantSearchParams,
  type AppointmentAssistantSettingsInput
} from "@/lib/appointment-assistant";
import { addDaysToAppointmentDate, type AppointmentStatus } from "@/lib/appointments/query";
import { getClinicDateRange, getClinicDayRange } from "@/lib/dashboard/timezone";
import { getInvitationEmailConfiguration } from "@/lib/email/config";
import { logger } from "@/lib/logger";
import { getActiveTenantContext, type ActiveTenant } from "@/lib/server/active-tenant";
import { canUseFeature, getClinicEntitlements, planIncludesFeature } from "@/lib/server/entitlements";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type BotSettingsRow = Database["public"]["Tables"]["bot_settings"]["Row"];

type PatientRelation = { full_name: string; clinic_id: string } | { full_name: string; clinic_id: string }[] | null;

type UpcomingRow = Pick<AppointmentRow, "id" | "title" | "starts_at" | "status"> & {
  patients: PatientRelation;
};

type ActivityRpcRow = {
  event_id: string;
  event_source: "appointment" | "audit_log" | "calendar_email";
  action: string;
  appointment_id: string;
  patient_name: string;
  occurred_at: string;
};

type AutomationDashboardRow = {
  job_id: string;
  job_type: "reminder_email" | "review_request_email" | "reminder_whatsapp";
  job_status: string;
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
  last_error_code: string | null;
  appointment_id: string;
  last_scheduler_started_at: string | null;
  last_scheduler_completed_at: string | null;
  last_scheduler_status: string | null;
};

type AutomationSchedulerRow = {
  last_started_at: string | null;
  last_completed_at: string | null;
  last_status: string | null;
  last_claimed: number;
  last_succeeded: number;
  last_skipped: number;
  last_failed: number;
  assistant_enabled: boolean;
  reminder_enabled: boolean;
  review_request_enabled: boolean;
};

type AssistantRpcClient = {
  rpc(fn: "get_appointment_automation_scheduler_status_for_current_user", args: { p_clinic_id: string }): Promise<{ data: AutomationSchedulerRow[] | null; error: { code?: string } | null }>;
  rpc(fn: "get_appointment_automation_dashboard_for_current_user", args: { p_clinic_id: string; p_limit: number }): Promise<{ data: AutomationDashboardRow[] | null; error: { code?: string } | null }>;
  rpc(
    fn: "list_appointment_assistant_activity_for_current_user",
    args: {
      p_clinic_id: string;
      p_before_occurred_at: string | null;
      p_before_event_source: string | null;
      p_before_event_id: string | null;
      p_limit: number;
    }
  ): Promise<{ data: ActivityRpcRow[] | null; error: { code?: string } | null }>;
  rpc(
    fn: "save_appointment_assistant_settings_for_current_user",
    args: {
      p_clinic_id: string;
      p_enabled: boolean;
      p_reminder_enabled: boolean;
      p_reminder_hours_before: number;
      p_quiet_hours_start: string | null;
      p_quiet_hours_end: string | null;
      p_review_request_enabled: boolean;
    }
  ): Promise<{ data: unknown; error: { code?: string } | null }>;
};

export type AppointmentAssistantActivity = {
  id: string;
  source: ActivityRpcRow["event_source"];
  action: string;
  appointmentId: string;
  patientName: string;
  occurredAt: string;
};

export type AppointmentAssistantData = {
  tenant: ActiveTenant;
  localDate: string;
  totals: Record<AppointmentStatus, number> & { today: number; upcoming: number };
  upcoming: Array<{
    id: string;
    title: string;
    patientName: string;
    startsAt: string;
    status: AppointmentStatus;
  }>;
  settings: Pick<BotSettingsRow, "enabled" | "reminder_enabled" | "reminder_hours_before" | "quiet_hours_start" | "quiet_hours_end" | "review_request_enabled"> | null;
  canManageSettings: boolean;
  canWriteSettings: boolean;
  emailCalendarConfigured: boolean;
  googleCalendarAvailable: boolean;
  automationJobs: AutomationDashboardRow[];
  automationScheduler: AutomationSchedulerRow | null;
  assistantEnabled: boolean;
  reminderEnabled: boolean;
  reviewRequestEnabled: boolean;
  activity: AppointmentAssistantActivity[];
  activityNextCursor: {
    occurredAt: string;
    eventSource: ActivityRpcRow["event_source"];
    eventId: string;
  } | null;
  activityHasPrevious: boolean;
};

export type AppointmentAssistantResult =
  | { state: "ready"; data: AppointmentAssistantData }
  | { state: "unauthenticated" | "no_active_membership" | "upgrade_required" | "error"; data: null };

function patientName(relation: PatientRelation) {
  return Array.isArray(relation) ? relation[0]?.full_name ?? "Paciente" : relation?.full_name ?? "Paciente";
}

export async function getAppointmentAssistantForActiveTenant(
  searchParams: AppointmentAssistantSearchParams
): Promise<AppointmentAssistantResult> {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };

  const clinicId = context.tenant.clinic.id;
  const entitlements = await getClinicEntitlements(clinicId);
  if (entitlements.state !== "ready") return { state: "error", data: null };
  if (!planIncludesFeature(entitlements, "appointment_assistant")) {
    return { state: "upgrade_required", data: null };
  }
  let todayRange;
  let upcomingEnd;

  try {
    todayRange = getClinicDayRange(context.tenant.clinic.timezone);
    upcomingEnd = getClinicDateRange(
      context.tenant.clinic.timezone,
      addDaysToAppointmentDate(todayRange.localDate, 8)
    ).startIso;
  } catch {
    logger.error("Appointment assistant clinic timezone is invalid", {
      component: "appointment_assistant",
      status: "timezone_error"
    });
    return { state: "error", data: null };
  }

  const now = new Date().toISOString();
  const supabase = await createClient();
  const canManageSettings = canManageAppointmentAssistant(context.tenant.membership.role);
  const cursor = getAppointmentAssistantActivityCursor(searchParams);
  const todayQuery = supabase
    .from("appointments")
    .select("status")
    .eq("clinic_id", clinicId)
    .gte("starts_at", todayRange.startIso)
    .lt("starts_at", todayRange.endIso);
  const upcomingCountQuery = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .gte("starts_at", now)
    .lt("starts_at", upcomingEnd)
    .in("status", ["scheduled", "confirmed", "waiting"]);
  const upcomingQuery = supabase
    .from("appointments")
    .select("id, title, starts_at, status, patients!appointments_clinic_patient_fk!inner(full_name, clinic_id)")
    .eq("clinic_id", clinicId)
    .eq("patients.clinic_id", clinicId)
    .gte("starts_at", now)
    .lt("starts_at", upcomingEnd)
    .in("status", ["scheduled", "confirmed", "waiting"])
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(APPOINTMENT_ASSISTANT_UPCOMING_LIMIT);
  const settingsQuery = canManageSettings
    ? supabase
        .from("bot_settings")
        .select("enabled, reminder_enabled, reminder_hours_before, quiet_hours_start, quiet_hours_end, review_request_enabled")
        .eq("clinic_id", clinicId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const activityQuery = (supabase as unknown as AssistantRpcClient).rpc(
    "list_appointment_assistant_activity_for_current_user",
    {
      p_clinic_id: clinicId,
      p_before_occurred_at: cursor?.occurredAt ?? null,
      p_before_event_source: cursor?.eventSource ?? null,
      p_before_event_id: cursor?.eventId ?? null,
      p_limit: APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE + 1
    }
  );
  const automationQuery = (supabase as unknown as AssistantRpcClient).rpc(
    "get_appointment_automation_dashboard_for_current_user", { p_clinic_id: clinicId, p_limit: 10 }
  );
  const schedulerQuery = (supabase as unknown as AssistantRpcClient).rpc(
    "get_appointment_automation_scheduler_status_for_current_user", { p_clinic_id: clinicId }
  );

  const [todayResult, upcomingCountResult, upcomingResult, settingsResult, activityResult, automationResult, schedulerResult] =
    await Promise.all([
      todayQuery,
      upcomingCountQuery,
      upcomingQuery,
      settingsQuery,
      activityQuery,
      automationQuery,
      schedulerQuery
    ]);

  if (
    todayResult.error ||
    upcomingCountResult.error ||
    upcomingResult.error ||
    settingsResult.error ||
    activityResult.error ||
    automationResult.error ||
    schedulerResult.error
  ) {
    logger.error("Appointment assistant data query failed", {
      component: "appointment_assistant",
      status: "data_query_error",
      todayCode: todayResult.error?.code,
      upcomingCountCode: upcomingCountResult.error?.code,
      upcomingCode: upcomingResult.error?.code,
      settingsCode: settingsResult.error?.code,
      activityCode: activityResult.error?.code
    });
    return { state: "error", data: null };
  }

  const todayStatuses = (todayResult.data ?? []) as Array<{ status: AppointmentStatus }>;
  const totals = todayStatuses.reduce<Record<AppointmentStatus, number> & { today: number; upcoming: number }>(
    (current, appointment) => {
      current.today += 1;
      current[appointment.status] += 1;
      return current;
    },
    { today: 0, upcoming: upcomingCountResult.count ?? 0, scheduled: 0, confirmed: 0, waiting: 0, completed: 0, cancelled: 0 }
  );
  const activityRows = (activityResult.data ?? []) as ActivityRpcRow[];
  const hasMoreActivity = activityRows.length > APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE;
  const visibleActivity = activityRows.slice(0, APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE);
  const lastActivity = visibleActivity.at(-1);
  const configuration = getInvitationEmailConfiguration();
  const automationScheduler = ((schedulerResult.data ?? []) as AutomationSchedulerRow[])[0] ?? null;
  const safeSettings = settingsResult.data as AppointmentAssistantData["settings"];

  return {
    state: "ready",
    data: {
      tenant: context.tenant,
      localDate: todayRange.localDate,
      totals,
      upcoming: ((upcomingResult.data ?? []) as UpcomingRow[]).map((appointment) => ({
        id: appointment.id,
        title: appointment.title,
        patientName: patientName(appointment.patients),
        startsAt: appointment.starts_at,
        status: appointment.status
      })),
      settings: safeSettings,
      canManageSettings,
      canWriteSettings: canUseFeature(entitlements, "appointment_assistant"),
      emailCalendarConfigured: configuration.state === "ready",
      googleCalendarAvailable: Boolean(entitlements && entitlements.state === "ready" && entitlements.entitlements.plan.features.google_calendar),
      automationJobs: (automationResult.data ?? []) as AutomationDashboardRow[],
      automationScheduler,
      assistantEnabled: safeSettings?.enabled ?? automationScheduler?.assistant_enabled ?? false,
      reminderEnabled: safeSettings?.reminder_enabled ?? automationScheduler?.reminder_enabled ?? false,
      reviewRequestEnabled: safeSettings?.review_request_enabled ?? automationScheduler?.review_request_enabled ?? false,
      activity: visibleActivity.map((event) => ({
        id: event.event_id,
        source: event.event_source,
        action: event.action,
        appointmentId: event.appointment_id,
        patientName: event.patient_name,
        occurredAt: event.occurred_at
      })),
      activityNextCursor: hasMoreActivity && lastActivity
        ? {
            occurredAt: lastActivity.occurred_at,
            eventSource: lastActivity.event_source,
            eventId: lastActivity.event_id
          }
        : null,
      activityHasPrevious: Boolean(cursor)
    }
  };
}

export type SaveAppointmentAssistantSettingsResult =
  | { state: "success" }
  | { state: "unauthenticated" | "no_active_membership" | "forbidden" | "error" };

export async function saveAppointmentAssistantSettingsForActiveTenant(
  input: AppointmentAssistantSettingsInput
): Promise<SaveAppointmentAssistantSettingsResult> {
  const context = await getActiveTenantContext();
  if (context.state === "error") return { state: "error" };
  if (context.state !== "ready") return { state: context.state };
  if (!canManageAppointmentAssistant(context.tenant.membership.role)) return { state: "forbidden" };
  if (!canUseFeature(await getClinicEntitlements(context.tenant.clinic.id), "appointment_assistant")) return { state: "forbidden" };

  const supabase = await createClient();
  const result = await (supabase as unknown as AssistantRpcClient).rpc(
    "save_appointment_assistant_settings_for_current_user",
    {
      p_clinic_id: context.tenant.clinic.id,
      p_enabled: input.enabled,
      p_reminder_enabled: input.reminderEnabled,
      p_reminder_hours_before: input.reminderHoursBefore,
      p_quiet_hours_start: input.quietHoursStart,
      p_quiet_hours_end: input.quietHoursEnd,
      p_review_request_enabled: input.reviewRequestEnabled
    }
  );

  if (result.error) {
    logger.error("Appointment assistant settings update failed", {
      component: "appointment_assistant",
      status: "settings_update_error",
      code: result.error.code
    });
    return { state: "error" };
  }

  return { state: "success" };
}
