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
import { canCreateWithEntitlements, getClinicEntitlements } from "@/lib/server/entitlements";
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
  appointment_title: string;
  channel: string | null;
  delivery_status: string | null;
  occurred_at: string;
};

type AssistantRpcClient = {
  rpc(
    fn: "list_appointment_assistant_activity_for_current_user",
    args: {
      p_clinic_id: string;
      p_before_occurred_at: string | null;
      p_before_event_id: string | null;
      p_limit: number;
    }
  ): Promise<{ data: ActivityRpcRow[] | null; error: { code?: string } | null }>;
  rpc(
    fn: "save_appointment_assistant_settings_for_current_user",
    args: {
      p_clinic_id: string;
      p_enabled: boolean;
      p_reminder_hours_before: number;
      p_quiet_hours_start: string | null;
      p_quiet_hours_end: string | null;
    }
  ): Promise<{ data: unknown; error: { code?: string } | null }>;
};

export type AppointmentAssistantActivity = {
  id: string;
  source: ActivityRpcRow["event_source"];
  action: string;
  appointmentId: string;
  patientName: string;
  appointmentTitle: string;
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
  settings: Pick<BotSettingsRow, "enabled" | "reminder_hours_before" | "quiet_hours_start" | "quiet_hours_end"> | null;
  canManageSettings: boolean;
  canWriteSettings: boolean;
  emailCalendarChannel: "connected" | "not_configured";
  activity: AppointmentAssistantActivity[];
  activityNextCursor: { occurredAt: string; eventId: string } | null;
  activityHasPrevious: boolean;
};

export type AppointmentAssistantResult =
  | { state: "ready"; data: AppointmentAssistantData }
  | { state: "unauthenticated" | "no_active_membership" | "error"; data: null };

function patientName(relation: PatientRelation) {
  return Array.isArray(relation) ? relation[0]?.full_name ?? "Paciente" : relation?.full_name ?? "Paciente";
}

export async function getAppointmentAssistantForActiveTenant(
  searchParams: AppointmentAssistantSearchParams
): Promise<AppointmentAssistantResult> {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };

  const clinicId = context.tenant.clinic.id;
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
    .select("id, title, starts_at, status, patients!inner(full_name, clinic_id)")
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
        .select("enabled, reminder_hours_before, quiet_hours_start, quiet_hours_end")
        .eq("clinic_id", clinicId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const entitlementsPromise = canManageSettings ? getClinicEntitlements(clinicId) : Promise.resolve(null);
  const activityQuery = (supabase as unknown as AssistantRpcClient).rpc(
    "list_appointment_assistant_activity_for_current_user",
    {
      p_clinic_id: clinicId,
      p_before_occurred_at: cursor?.occurredAt ?? null,
      p_before_event_id: cursor?.eventId ?? null,
      p_limit: APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE + 1
    }
  );

  const [todayResult, upcomingCountResult, upcomingResult, settingsResult, entitlements, activityResult] =
    await Promise.all([
      todayQuery,
      upcomingCountQuery,
      upcomingQuery,
      settingsQuery,
      entitlementsPromise,
      activityQuery
    ]);

  if (
    todayResult.error ||
    upcomingCountResult.error ||
    upcomingResult.error ||
    settingsResult.error ||
    activityResult.error
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
      settings: settingsResult.data as AppointmentAssistantData["settings"],
      canManageSettings,
      canWriteSettings: Boolean(entitlements && canCreateWithEntitlements(entitlements)),
      emailCalendarChannel: configuration.state === "ready" ? "connected" : "not_configured",
      activity: visibleActivity.map((event) => ({
        id: event.event_id,
        source: event.event_source,
        action: event.action,
        appointmentId: event.appointment_id,
        patientName: event.patient_name,
        appointmentTitle: event.appointment_title,
        occurredAt: event.occurred_at
      })),
      activityNextCursor: hasMoreActivity && lastActivity
        ? { occurredAt: lastActivity.occurred_at, eventId: lastActivity.event_id }
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
  if (!canCreateWithEntitlements(await getClinicEntitlements(context.tenant.clinic.id))) return { state: "forbidden" };

  const supabase = await createClient();
  const result = await (supabase as unknown as AssistantRpcClient).rpc(
    "save_appointment_assistant_settings_for_current_user",
    {
      p_clinic_id: context.tenant.clinic.id,
      p_enabled: input.enabled,
      p_reminder_hours_before: input.reminderHoursBefore,
      p_quiet_hours_start: input.quietHoursStart,
      p_quiet_hours_end: input.quietHoursEnd
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
