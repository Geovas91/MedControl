import type { Database } from "@/types/database";

export const APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE = 10;
export const APPOINTMENT_ASSISTANT_UPCOMING_LIMIT = 5;

type ClinicMemberRole = Database["public"]["Enums"]["clinic_member_role"];

export type AppointmentAssistantSettingsInput = {
  enabled: boolean;
  reminderHoursBefore: number;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

export type AppointmentAssistantSearchParams = {
  activity_before?: string | string[];
  activity_before_id?: string | string[];
  saved?: string | string[];
  settings_error?: string | string[];
};

export function canManageAppointmentAssistant(role: ClinicMemberRole) {
  return role === "owner" || role === "admin";
}
function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function canonicalUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function getAppointmentAssistantActivityCursor(searchParams: AppointmentAssistantSearchParams) {
  const occurredAt = singleValue(searchParams.activity_before);
  const eventId = singleValue(searchParams.activity_before_id);

  if (!occurredAt || !eventId || !canonicalUuid(eventId) || !Number.isFinite(Date.parse(occurredAt))) {
    return null;
  }

  return { occurredAt: new Date(occurredAt).toISOString(), eventId };
}

export function hasAppointmentAssistantSavedMessage(searchParams: AppointmentAssistantSearchParams) {
  return singleValue(searchParams.saved) === "1";
}

export function hasAppointmentAssistantSettingsError(searchParams: AppointmentAssistantSearchParams) {
  return singleValue(searchParams.settings_error) === "1";
}

function parseQuietTime(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value === "") return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : undefined;
}

export function parseAppointmentAssistantSettings(formData: FormData): AppointmentAssistantSettingsInput | null {
  const hours = Number(formData.get("reminder_hours_before"));
  const quietHoursStart = parseQuietTime(formData.get("quiet_hours_start"));
  const quietHoursEnd = parseQuietTime(formData.get("quiet_hours_end"));

  if (!Number.isInteger(hours) || hours < 1 || hours > 168) return null;
  if (quietHoursStart === undefined || quietHoursEnd === undefined) return null;
  if ((quietHoursStart === null) !== (quietHoursEnd === null)) return null;

  return {
    enabled: formData.get("enabled") === "on",
    reminderHoursBefore: hours,
    quietHoursStart,
    quietHoursEnd
  };
}
