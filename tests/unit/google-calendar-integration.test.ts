import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GOOGLE_CALENDAR_SCOPE,
  buildGoogleCalendarAuthorizationUrl,
  createGoogleCalendarOAuthState,
  hashGoogleCalendarSessionBinding,
  hashGoogleCalendarOAuthState,
  isValidGoogleAuthorizationCode,
  isValidGoogleCalendarOAuthState
} from "../../lib/calendar/google-oauth.ts";
import {
  buildGoogleCalendarEventId,
  buildGoogleCalendarEventPayload,
  classifyGoogleCalendarFailure,
  shouldSyncGoogleCalendarEvent
} from "../../lib/calendar/google-event.ts";
import {
  decryptCalendarRefreshToken,
  encryptCalendarRefreshToken,
  parseCalendarTokenEncryptionKey
} from "../../lib/calendar/token-encryption.ts";

const migration = readFileSync("supabase/migrations/0029_google_calendar_integrations.sql", "utf8");
const callbackRoute = readFileSync("app/api/integrations/google-calendar/callback/route.ts", "utf8");
const connectRoute = readFileSync("app/api/integrations/google-calendar/connect/route.ts", "utf8");
const integrationServer = readFileSync("lib/server/google-calendar-integration.ts", "utf8");
const syncServer = readFileSync("lib/server/appointment-google-calendar.ts", "utf8");
const page = readFileSync("app/dashboard/settings/integrations/page.tsx", "utf8");
const provider = readFileSync("lib/server/google-calendar-provider.ts", "utf8");

test("OAuth state is unpredictable, one-way hashed and strictly validated", () => {
  const first = createGoogleCalendarOAuthState();
  const second = createGoogleCalendarOAuthState();
  assert.notEqual(first.state, second.state);
  assert.equal(first.stateHash, hashGoogleCalendarOAuthState(first.state));
  assert.equal(first.stateHash.length, 64);
  assert.equal(isValidGoogleCalendarOAuthState(first.state), true);
  assert.equal(isValidGoogleCalendarOAuthState(`${first.state}x`), false);
  assert.equal(isValidGoogleAuthorizationCode("short"), false);
  assert.equal(isValidGoogleAuthorizationCode("valid-google-code"), true);
  assert.equal(hashGoogleCalendarSessionBinding("session-a").length, 64);
  assert.notEqual(hashGoogleCalendarSessionBinding("session-a"), hashGoogleCalendarSessionBinding("session-b"));
});

test("authorization URL requests only owned calendar events and offline server access", () => {
  const state = createGoogleCalendarOAuthState().state;
  const url = new URL(buildGoogleCalendarAuthorizationUrl({ clientId: "client-id", redirectUri: "https://app.example.test/api/integrations/google-calendar/callback", state }));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), GOOGLE_CALENDAR_SCOPE);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), state);
  assert.doesNotMatch(url.toString(), /gmail|contacts|drive|meet|calendar\.readonly/i);
});

test("refresh token encryption uses authenticated encryption and rejects tampering", () => {
  const key = Buffer.alloc(32, 7);
  const encodedKey = key.toString("base64");
  assert.deepEqual(parseCalendarTokenEncryptionKey(encodedKey), key);
  assert.equal(parseCalendarTokenEncryptionKey(Buffer.alloc(31).toString("base64")), null);
  assert.equal(parseCalendarTokenEncryptionKey(`${encodedKey.slice(0, -1)}!`), null);
  const encrypted = encryptCalendarRefreshToken("refresh-token-test-only", key);
  assert.doesNotMatch(encrypted, /refresh-token-test-only/);
  assert.equal(decryptCalendarRefreshToken(encrypted, key), "refresh-token-test-only");
  const parts = encrypted.split(".");
  parts[2] = `${parts[2]!.startsWith("A") ? "B" : "A"}${parts[2]!.slice(1)}`;
  assert.throws(() => decryptCalendarRefreshToken(parts.join("."), key));
  assert.throws(() => decryptCalendarRefreshToken(encrypted, Buffer.alloc(32, 8)));
});

test("Google event payload is neutral and contains no clinical or patient data", () => {
  const payload = buildGoogleCalendarEventPayload({
    appointmentId: "d4000000-0000-4000-8000-000000000001",
    startsAt: "2026-08-21T15:00:00.000Z",
    endsAt: "2026-08-21T16:00:00.000Z",
    timeZone: "America/Mexico_City"
  });
  assert.equal(payload.summary, "Cita CliniControl");
  assert.equal("location" in payload, false);
  assert.equal(payload.visibility, "private");
  assert.deepEqual(payload.extendedProperties.private, { clinicontrolAppointmentId: "d4000000-0000-4000-8000-000000000001" });
  assert.doesNotMatch(JSON.stringify(payload), /paciente|diagnóstico|consentimiento|correo|teléfono|nota clínica/i);
});

test("event relation is deterministically idempotent by integration and appointment", () => {
  const one = buildGoogleCalendarEventId("i1", "a1");
  assert.equal(one, buildGoogleCalendarEventId("i1", "a1"));
  assert.notEqual(one, buildGoogleCalendarEventId("i2", "a1"));
  assert.equal(shouldSyncGoogleCalendarEvent({ appointmentVersion: "v1", status: "synced" }, "v1", "synced"), false);
  assert.equal(shouldSyncGoogleCalendarEvent({ appointmentVersion: "v1", status: "failed" }, "v1", "synced"), true);
  assert.equal(shouldSyncGoogleCalendarEvent({ appointmentVersion: "v1", status: "synced" }, "v2", "synced"), true);
});

test("callback consumes tenant/user-bound state before server-side exchange", () => {
  assert.match(callbackRoute, /getActiveTenantContext\(\)/);
  assert.match(callbackRoute, /consumeGoogleCalendarOAuthState\([\s\S]+clinicId: context\.tenant\.clinic\.id[\s\S]+userId: context\.user\.id[\s\S]+sessionHash/);
  const callbackBody = callbackRoute.slice(callbackRoute.indexOf("export async function GET"));
  assert.ok(callbackBody.indexOf("consumeGoogleCalendarOAuthState") < callbackBody.indexOf("exchangeGoogleCalendarAuthorizationCode"));
  assert.doesNotMatch(callbackRoute, /logger|console\.|access_token|refresh_token/);
  assert.match(connectRoute, /createGoogleCalendarOAuthState[\s\S]+context\.tenant\.clinic\.id[\s\S]+context\.user\.id/);
});

test("permissions allow only owner admin and doctor to connect their own account", () => {
  assert.match(integrationServer, /\["owner", "admin", "doctor"\]\.includes/);
  assert.match(integrationServer, /getGoogleCalendarIntegration\(context\.tenant\.clinic\.id, context\.user\.id\)/);
  assert.match(page, /El rol assistant no conecta ni administra cuentas de médicos/);
  const pageLoader = integrationServer.slice(
    integrationServer.indexOf("export async function getGoogleCalendarIntegrationPageData"),
    integrationServer.indexOf("export async function disconnectOwnGoogleCalendarIntegration")
  );
  assert.doesNotMatch(pageLoader, /refresh_token_encrypted|access_token|provider_calendar_id|google_event_id/i);
  assert.match(integrationServer, /list_google_calendar_integration_status_for_current_user/);
  const safeProjection = migration.match(/list_google_calendar_integration_status_for_current_user[\s\S]+?returns table \(([\s\S]+?)\)\r?\nlanguage sql/i)?.[1] ?? "";
  assert.ok(safeProjection);
  assert.doesNotMatch(safeProjection, /token|scope|provider_calendar_id|google_event_id/i);
});

test("disconnect is ownership-bound, revokes first and then removes the local secret", () => {
  const disconnectBody = integrationServer.slice(
    integrationServer.indexOf("export async function disconnectOwnGoogleCalendarIntegration")
  );
  assert.match(disconnectBody, /getGoogleCalendarIntegration\(context\.tenant\.clinic\.id, context\.user\.id\)/);
  assert.ok(disconnectBody.indexOf("revokeGoogleCalendarToken") < disconnectBody.indexOf("clearGoogleCalendarIntegration"));
  assert.match(disconnectBody, /clinicId: context\.tenant\.clinic\.id[\s\S]+userId: context\.user\.id/);
});

test("migration removes all client grants and makes tenant relations structural", () => {
  assert.match(migration, /revoke all privileges on table public\.calendar_integrations from public, anon, authenticated/i);
  assert.match(migration, /revoke all privileges on table public\.google_calendar_oauth_states from public, anon, authenticated/i);
  assert.match(migration, /revoke all privileges on table public\.google_calendar_events from public, anon, authenticated/i);
  assert.match(migration, /foreign key \(clinic_id, integration_id, doctor_user_id\)[\s\S]+calendar_integrations\(clinic_id, id, user_id\)/i);
  assert.match(migration, /foreign key \(clinic_id, appointment_id\)[\s\S]+appointments\(clinic_id, id\)/i);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete).*authenticated/i);
});

test("provider keeps tokens in headers or form bodies and never query URLs", () => {
  assert.match(provider, /Authorization: `Bearer \$\{input\.accessToken\}`/);
  assert.match(provider, /new URLSearchParams\(\{[\s\S]+refresh_token: input\.refreshToken/);
  assert.doesNotMatch(provider, /\?access_token|\?refresh_token|console\.|logger/);
});

test("reconnect and failure handling never blocks the clinical mutation", () => {
  assert.equal(classifyGoogleCalendarFailure(401), "reconnect_required");
  assert.equal(classifyGoogleCalendarFailure(404), "event_missing");
  assert.equal(classifyGoogleCalendarFailure(429), "temporary_failure");
  assert.match(syncServer, /calendar_reconnect_required/);
  assert.match(syncServer, /appointment_calendar_sync_failed/);
  assert.match(syncServer, /Google Calendar sync failed without affecting the appointment/);
});

test("visible integrations page has no mock, demo or coming-soon calendar UI", () => {
  assert.doesNotMatch(page, /mock-calendar-integrations|Demo conectado|Próximamente|Generar \.ics demo|WhatsApp|SMS/i);
  assert.match(page, /Conectar Google Calendar/);
  assert.match(page, /Desconectar mi cuenta/);
  assert.match(page, /Requiere reconexión/);
});
