import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// These tables intentionally have no client grants because they contain OAuth
// state, encrypted tokens and provider event ids. Callers are server-only and
// must resolve the authenticated active tenant and ownership before using this store.

export type StoredGoogleCalendarIntegration = {
  id: string;
  clinic_id: string;
  user_id: string;
  refresh_token_encrypted: string | null;
  scopes: string[];
  status: "connected" | "disconnected" | "expired" | "failed";
  connected_at: string | null;
  revoked_at: string | null;
  last_sync_at: string | null;
  last_error_code: string | null;
  token_encryption_version: number | null;
};

export type StoredGoogleCalendarEvent = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  integration_id: string;
  doctor_user_id: string;
  google_event_id: string | null;
  appointment_version: string;
  sync_status: "pending" | "synced" | "deleted" | "failed";
  last_error_code: string | null;
};

const integrationColumns = "id, clinic_id, user_id, refresh_token_encrypted, scopes, status, connected_at, revoked_at, last_sync_at, last_error_code, token_encryption_version";

export async function createGoogleCalendarOAuthState(input: {
  clinicId: string;
  userId: string;
  sessionHash: string;
  stateHash: string;
  expiresAt: string;
}) {
  return createAdminClient().from("google_calendar_oauth_states" as never).insert({
    clinic_id: input.clinicId,
    user_id: input.userId,
    session_hash: input.sessionHash,
    state_hash: input.stateHash,
    expires_at: input.expiresAt
  } as never);
}

export async function consumeGoogleCalendarOAuthState(input: {
  clinicId: string;
  userId: string;
  sessionHash: string;
  stateHash: string;
  now: string;
}) {
  const result = await createAdminClient()
    .from("google_calendar_oauth_states" as never)
    .update({ consumed_at: input.now } as never)
    .eq("clinic_id", input.clinicId)
    .eq("user_id", input.userId)
    .eq("session_hash", input.sessionHash)
    .eq("state_hash", input.stateHash)
    .is("consumed_at", null)
    .gt("expires_at", input.now)
    .select("id")
    .maybeSingle();
  return { consumed: Boolean(result.data), error: result.error };
}

export async function saveGoogleCalendarIntegration(input: {
  clinicId: string;
  userId: string;
  encryptedRefreshToken: string;
  scopes: string[];
  connectedAt: string;
}) {
  const result = await createAdminClient().from("calendar_integrations").upsert({
    clinic_id: input.clinicId,
    user_id: input.userId,
    provider: "google",
    provider_calendar_id: "primary",
    calendar_name: "Calendario principal",
    sync_direction: "clinicontrol_to_provider",
    access_token_encrypted: null,
    refresh_token_encrypted: input.encryptedRefreshToken,
    token_expires_at: null,
    scopes: input.scopes,
    status: "connected",
    connected_at: input.connectedAt,
    revoked_at: null,
    last_error_code: null,
    token_encryption_version: 1
  } as never, { onConflict: "clinic_id,user_id,provider" }).select("id").single();
  return { data: result.data as { id: string } | null, error: result.error };
}

export async function getGoogleCalendarIntegration(clinicId: string, userId: string) {
  const result = await createAdminClient().from("calendar_integrations").select(integrationColumns)
    .eq("clinic_id", clinicId).eq("user_id", userId).eq("provider", "google").maybeSingle();
  return { data: result.data as StoredGoogleCalendarIntegration | null, error: result.error };
}

export async function clearGoogleCalendarIntegration(input: {
  integrationId: string;
  clinicId: string;
  userId: string;
  status: "disconnected" | "expired" | "failed";
  errorCode: string | null;
  revokedAt: string;
}) {
  return createAdminClient().from("calendar_integrations").update({
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
    scopes: [],
    status: input.status,
    revoked_at: input.revokedAt,
    last_error_code: input.errorCode,
    token_encryption_version: null
  } as never).eq("id", input.integrationId).eq("clinic_id", input.clinicId).eq("user_id", input.userId).eq("provider", "google");
}

export async function auditGoogleCalendarEvent(input: {
  clinicId: string;
  actorUserId: string | null;
  entityId: string | null;
  action: "calendar_connected" | "calendar_disconnected" | "calendar_reconnect_required" | "appointment_calendar_synced" | "appointment_calendar_sync_failed";
  metadata?: Record<string, string>;
}) {
  return createAdminClient().from("audit_logs").insert({
    clinic_id: input.clinicId,
    actor_user_id: input.actorUserId,
    entity_type: input.action.startsWith("appointment_") ? "appointment" : "calendar_integration",
    entity_id: input.entityId,
    action: input.action,
    metadata: input.metadata ?? {}
  } as never);
}

export async function listStoredGoogleCalendarEvents(clinicId: string, appointmentId: string) {
  const result = await createAdminClient().from("google_calendar_events" as never)
    .select("id, clinic_id, appointment_id, integration_id, doctor_user_id, google_event_id, appointment_version, sync_status, last_error_code")
    .eq("clinic_id", clinicId).eq("appointment_id", appointmentId);
  return { data: (result.data ?? []) as unknown as StoredGoogleCalendarEvent[], error: result.error };
}

export async function reserveGoogleCalendarEvent(input: {
  clinicId: string;
  appointmentId: string;
  integrationId: string;
  doctorUserId: string;
  googleEventId: string;
  appointmentVersion: string;
}) {
  const result = await createAdminClient().from("google_calendar_events" as never).upsert({
    clinic_id: input.clinicId,
    appointment_id: input.appointmentId,
    integration_id: input.integrationId,
    doctor_user_id: input.doctorUserId,
    google_event_id: input.googleEventId,
    appointment_version: input.appointmentVersion,
    sync_status: "pending",
    last_error_code: null
  } as never, { onConflict: "integration_id,appointment_id" }).select("id").single();
  return { data: result.data as unknown as { id: string } | null, error: result.error };
}

export async function recordGoogleCalendarEventResult(input: {
  mappingId: string;
  integrationId: string;
  clinicId: string;
  appointmentVersion: string;
  status: "synced" | "deleted" | "failed";
  googleEventId: string;
  errorCode: string | null;
}) {
  const now = new Date().toISOString();
  const admin = createAdminClient();
  const mapping = await admin.from("google_calendar_events" as never).update({
    appointment_version: input.appointmentVersion,
    sync_status: input.status,
    google_event_id: input.googleEventId,
    last_error_code: input.errorCode,
    last_synced_at: input.status === "failed" ? null : now
  } as never).eq("id", input.mappingId).eq("clinic_id", input.clinicId);
  if (!mapping.error) {
    await admin.from("calendar_integrations").update((input.status === "failed"
      ? { last_error_code: input.errorCode }
      : { last_sync_at: now, last_error_code: null }) as never)
      .eq("id", input.integrationId).eq("clinic_id", input.clinicId);
  }
  return mapping;
}
