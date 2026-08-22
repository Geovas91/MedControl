import "server-only";

import {
  buildGoogleCalendarEventId,
  buildGoogleCalendarEventPayload,
  shouldSyncGoogleCalendarEvent
} from "@/lib/calendar/google-event";
import { decryptCalendarRefreshToken } from "@/lib/calendar/token-encryption";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getGoogleCalendarConfiguration } from "@/lib/server/google-calendar-config";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  refreshGoogleCalendarAccessToken,
  updateGoogleCalendarEvent
} from "@/lib/server/google-calendar-provider";
import {
  auditGoogleCalendarEvent,
  clearGoogleCalendarIntegration,
  getGoogleCalendarIntegration,
  listStoredGoogleCalendarEvents,
  recordGoogleCalendarEventResult,
  reserveGoogleCalendarEvent,
  type StoredGoogleCalendarEvent,
  type StoredGoogleCalendarIntegration
} from "@/lib/server/google-calendar-store";
import { createClient } from "@/lib/supabase/server";

export type GoogleCalendarSyncOutcome = "synced" | "deleted" | "disabled" | "duplicate" | "failed" | "reconnect_required";

type GoogleCalendarAppointment = {
  id: string;
  doctor_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  updated_at: string;
};

async function markReconnectRequired(integration: StoredGoogleCalendarIntegration, actorUserId: string | null) {
  await clearGoogleCalendarIntegration({
    integrationId: integration.id,
    clinicId: integration.clinic_id,
    userId: integration.user_id,
    status: "expired",
    errorCode: "refresh_rejected",
    revokedAt: new Date().toISOString()
  });
  await auditGoogleCalendarEvent({
    clinicId: integration.clinic_id,
    actorUserId,
    entityId: integration.id,
    action: "calendar_reconnect_required",
    metadata: { provider: "google", reason: "refresh_rejected" }
  });
}

async function accessTokenFor(integration: StoredGoogleCalendarIntegration, actorUserId: string | null) {
  const configuration = getGoogleCalendarConfiguration();
  if (configuration.state !== "ready" || integration.status !== "connected" || !integration.refresh_token_encrypted) {
    return { state: "disabled" as const };
  }
  let refreshToken: string;
  try {
    refreshToken = decryptCalendarRefreshToken(integration.refresh_token_encrypted, configuration.encryptionKey);
  } catch {
    await markReconnectRequired(integration, actorUserId);
    return { state: "reconnect_required" as const };
  }
  const refreshed = await refreshGoogleCalendarAccessToken({
    refreshToken,
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret
  });
  if (!refreshed.ok) {
    if (refreshed.code === "reconnect_required") {
      await markReconnectRequired(integration, actorUserId);
      return { state: "reconnect_required" as const };
    }
    return { state: "failed" as const };
  }
  return { state: "ready" as const, accessToken: refreshed.accessToken };
}

async function recordFailure(mapping: StoredGoogleCalendarEvent, integration: StoredGoogleCalendarIntegration, appointmentVersion: string, actorUserId: string | null, code: string) {
  await recordGoogleCalendarEventResult({
    mappingId: mapping.id,
    integrationId: integration.id,
    clinicId: integration.clinic_id,
    appointmentVersion,
    status: "failed",
    googleEventId: mapping.google_event_id!,
    errorCode: code
  });
  await auditGoogleCalendarEvent({
    clinicId: integration.clinic_id,
    actorUserId,
    entityId: mapping.appointment_id,
    action: "appointment_calendar_sync_failed",
    metadata: { provider: "google", reason: code }
  });
}

async function deleteStoredEvent(mapping: StoredGoogleCalendarEvent, actorUserId: string | null, appointmentVersion: string): Promise<GoogleCalendarSyncOutcome> {
  if (mapping.sync_status === "deleted" && mapping.appointment_version === appointmentVersion) return "duplicate";
  const integrationResult = await getGoogleCalendarIntegration(mapping.clinic_id, mapping.doctor_user_id);
  const integration = integrationResult.data;
  if (!integration || !mapping.google_event_id) return "disabled";
  const access = await accessTokenFor(integration, actorUserId);
  if (access.state !== "ready") return access.state;
  const deleted = await deleteGoogleCalendarEvent({ accessToken: access.accessToken, eventId: mapping.google_event_id });
  if (!deleted.ok) {
    await recordFailure(mapping, integration, appointmentVersion, actorUserId, deleted.code);
    return deleted.code === "reconnect_required" ? "reconnect_required" : "failed";
  }
  await recordGoogleCalendarEventResult({
    mappingId: mapping.id,
    integrationId: integration.id,
    clinicId: mapping.clinic_id,
    appointmentVersion,
    status: "deleted",
    googleEventId: mapping.google_event_id,
    errorCode: null
  });
  await auditGoogleCalendarEvent({
    clinicId: mapping.clinic_id,
    actorUserId,
    entityId: mapping.appointment_id,
    action: "appointment_calendar_synced",
    metadata: { provider: "google", operation: "deleted" }
  });
  return "deleted";
}

export async function syncAppointmentGoogleCalendar(input: {
  appointmentId: string;
  appointmentVersion: string;
  operation: "upsert" | "delete";
}): Promise<GoogleCalendarSyncOutcome> {
  try {
    const context = await getActiveTenantContext();
    if (context.state !== "ready" || !["owner", "admin", "doctor"].includes(context.tenant.membership.role)) return "disabled";
    const clinicId = context.tenant.clinic.id;
    const supabase = await createClient();
    const appointmentResult = await supabase.from("appointments")
      .select("id, doctor_id, starts_at, ends_at, status, updated_at")
      .eq("id", input.appointmentId).eq("clinic_id", clinicId).maybeSingle();
    const appointment = appointmentResult.data as unknown as GoogleCalendarAppointment | null;
    if (appointmentResult.error || !appointment || appointment.updated_at !== input.appointmentVersion) return "duplicate";

    const mappingsResult = await listStoredGoogleCalendarEvents(clinicId, input.appointmentId);
    if (mappingsResult.error) return "failed";
    const mappings = mappingsResult.data;
    const shouldDelete = input.operation === "delete" || appointment.status === "cancelled" || !appointment.doctor_id;
    if (shouldDelete) {
      const outcomes = await Promise.all(mappings.map((mapping) => deleteStoredEvent(mapping, context.user.id, input.appointmentVersion)));
      return outcomes.some((outcome) => outcome === "failed" || outcome === "reconnect_required") ? "failed" : outcomes.length ? "deleted" : "disabled";
    }

    const doctorUserId = appointment.doctor_id!;
    const staleMappings = mappings.filter((mapping) => mapping.doctor_user_id !== doctorUserId && mapping.sync_status !== "deleted");
    for (const mapping of staleMappings) {
      const outcome = await deleteStoredEvent(mapping, context.user.id, input.appointmentVersion);
      if (outcome === "failed" || outcome === "reconnect_required") return outcome;
    }

    const integrationResult = await getGoogleCalendarIntegration(clinicId, doctorUserId);
    const integration = integrationResult.data;
    if (integrationResult.error || !integration || integration.status !== "connected") return "disabled";
    const existing = mappings.find((mapping) => mapping.integration_id === integration.id) ?? null;
    if (!shouldSyncGoogleCalendarEvent(existing ? { appointmentVersion: existing.appointment_version, status: existing.sync_status } : null, input.appointmentVersion, "synced")) return "duplicate";

    const creating = !existing || existing.sync_status === "deleted";
    const eventId = creating
      ? buildGoogleCalendarEventId(integration.id, input.appointmentId, existing ? input.appointmentVersion : "initial")
      : existing.google_event_id ?? buildGoogleCalendarEventId(integration.id, input.appointmentId);
    const reservation = await reserveGoogleCalendarEvent({
      clinicId,
      appointmentId: input.appointmentId,
      integrationId: integration.id,
      doctorUserId,
      googleEventId: eventId,
      appointmentVersion: input.appointmentVersion
    });
    if (reservation.error || !reservation.data) return "failed";
    const mapping: StoredGoogleCalendarEvent = {
      id: (reservation.data as { id: string }).id,
      clinic_id: clinicId,
      appointment_id: input.appointmentId,
      integration_id: integration.id,
      doctor_user_id: doctorUserId,
      google_event_id: eventId,
      appointment_version: input.appointmentVersion,
      sync_status: "pending",
      last_error_code: null
    };
    const access = await accessTokenFor(integration, context.user.id);
    if (access.state !== "ready") return access.state;
    const payload = buildGoogleCalendarEventPayload({
      appointmentId: input.appointmentId,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      timeZone: context.tenant.clinic.timezone
    });
    let providerResult = creating
      ? await createGoogleCalendarEvent({ accessToken: access.accessToken, eventId, payload })
      : await updateGoogleCalendarEvent({ accessToken: access.accessToken, eventId, payload });
    if (!providerResult.ok && providerResult.code === "event_exists") {
      providerResult = await updateGoogleCalendarEvent({ accessToken: access.accessToken, eventId, payload });
    }
    if (!providerResult.ok && providerResult.code === "event_missing") {
      const replacementId = buildGoogleCalendarEventId(integration.id, input.appointmentId, input.appointmentVersion);
      providerResult = await createGoogleCalendarEvent({ accessToken: access.accessToken, eventId: replacementId, payload });
      mapping.google_event_id = replacementId;
    }
    if (!providerResult.ok) {
      if (providerResult.code === "reconnect_required") await markReconnectRequired(integration, context.user.id);
      await recordFailure(mapping, integration, input.appointmentVersion, context.user.id, providerResult.code);
      return providerResult.code === "reconnect_required" ? "reconnect_required" : "failed";
    }
    await recordGoogleCalendarEventResult({
      mappingId: mapping.id,
      integrationId: integration.id,
      clinicId,
      appointmentVersion: input.appointmentVersion,
      status: "synced",
      googleEventId: providerResult.eventId,
      errorCode: null
    });
    await auditGoogleCalendarEvent({
      clinicId,
      actorUserId: context.user.id,
      entityId: input.appointmentId,
      action: "appointment_calendar_synced",
      metadata: { provider: "google", operation: creating ? "created" : "updated" }
    });
    return "synced";
  } catch {
    logger.warn("Google Calendar sync failed without affecting the appointment", {
      component: "google_calendar",
      status: "sync_failed"
    });
    return "failed";
  }
}
