import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE,
  canManageAppointmentAssistant,
  getAppointmentAssistantActivityCursor,
  parseAppointmentAssistantSettings
} from "../../lib/appointment-assistant.ts";

const page = readFileSync("app/dashboard/bot/page.tsx", "utf8");
const server = readFileSync("lib/server/appointment-assistant.ts", "utf8");
const migration = readFileSync("supabase/migrations/0028_appointment_assistant_integrity.sql", "utf8");
const navigation = readFileSync("components/dashboard/dashboard-shell.tsx", "utf8");

test("appointment assistant uses real tenant-scoped agenda data and transparent limits", () => {
  assert.match(server, /getActiveTenantContext\(\)/);
  assert.match(server, /\.from\("appointments"\)/);
  assert.match(server, /\.eq\("clinic_id", clinicId\)/);
  assert.match(server, /count: "exact", head: true/);
  assert.match(page, /Se muestran las primeras.*historial completo está en Citas/);
  assert.match(page, /CliniControl no tiene un estado no-show/);
});

test("visible bot route is honestly named and contains no simulated conversations", () => {
  assert.match(page, /title="Asistente de agenda"/);
  assert.match(navigation, /href: "\/dashboard\/bot", label: "Asistente"/);
  assert.doesNotMatch(page, /Demo conectado|Respuesta:|Responde 1|patientResponse/i);
  assert.match(page, /No existe un chatbot ni un proceso automático de recordatorios activo/);
});

test("settings parser accepts only explicit bounded internal preferences", () => {
  const valid = new FormData();
  valid.set("enabled", "on");
  valid.set("reminder_hours_before", "24");
  valid.set("quiet_hours_start", "20:00");
  valid.set("quiet_hours_end", "08:00");
  assert.deepEqual(parseAppointmentAssistantSettings(valid), {
    enabled: true,
    reminderHoursBefore: 24,
    quietHoursStart: "20:00",
    quietHoursEnd: "08:00"
  });

  valid.set("reminder_hours_before", "169");
  assert.equal(parseAppointmentAssistantSettings(valid), null);
  valid.set("reminder_hours_before", "24");
  valid.delete("quiet_hours_end");
  assert.equal(parseAppointmentAssistantSettings(valid), null);
});

test("only owner and admin can manage global assistant settings", () => {
  assert.equal(canManageAppointmentAssistant("owner"), true);
  assert.equal(canManageAppointmentAssistant("admin"), true);
  assert.equal(canManageAppointmentAssistant("doctor"), false);
  assert.equal(canManageAppointmentAssistant("assistant"), false);
  assert.match(server, /canManageAppointmentAssistant\(context\.tenant\.membership\.role\)/);
});

test("activity uses a validated stable cursor and asks the RPC for one extra row", () => {
  const cursor = getAppointmentAssistantActivityCursor({
    activity_before: "2026-08-21T12:00:00.000Z",
    activity_before_source: "audit_log",
    activity_before_id: "c1000000-0000-4000-8000-000000000001"
  });
  assert.deepEqual(cursor, {
    occurredAt: "2026-08-21T12:00:00.000Z",
    eventSource: "audit_log",
    eventId: "c1000000-0000-4000-8000-000000000001"
  });
  assert.equal(getAppointmentAssistantActivityCursor({ activity_before: "bad", activity_before_id: "bad" }), null);
  assert.match(server, new RegExp(`p_limit: APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE \\+ 1`));
  assert.equal(APPOINTMENT_ASSISTANT_ACTIVITY_PAGE_SIZE, 10);
});

test("0028 hardens settings, appointments and safe activity without exposing secrets", () => {
  assert.match(migration, /foreign key \(clinic_id, patient_id\)[\s\S]+references public\.patients\(clinic_id, id\)/i);
  assert.match(migration, /revoke all privileges on table public\.appointments from public, anon, authenticated[\s\S]+grant select, insert, update on table public\.appointments to authenticated/i);
  assert.match(migration, /protect_appointment_integrity[\s\S]+security invoker[\s\S]+new\.clinic_id is distinct from old\.clinic_id[\s\S]+new\.patient_id is distinct from old\.patient_id/i);
  assert.match(migration, /revoke all privileges on table public\.bot_settings from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.bot_settings to authenticated/i);
  assert.match(migration, /save_appointment_assistant_settings_for_current_user[\s\S]+has_clinic_role\(p_clinic_id, array\['owner', 'admin'\]\)[\s\S]+clinic_has_write_entitlement/i);
  assert.match(migration, /revoke all privileges on table public\.bot_logs from public, anon, authenticated/i);
  assert.match(migration, /list_appointment_assistant_activity_for_current_user[\s\S]+array\['owner', 'admin', 'doctor', 'assistant'\]/i);
  const activityResult = migration.match(/list_appointment_assistant_activity_for_current_user[\s\S]+?returns table \(([\s\S]+?)\)\r?\nlanguage sql/i)?.[1] ?? "";
  assert.ok(activityResult);
  assert.doesNotMatch(activityResult, /metadata|message|patient_response|provider_message_id|secret/i);
  assert.doesNotMatch(activityResult, /appointment_title|channel|delivery_status/i);
});

test("channel status is derived server-side without returning provider configuration", () => {
  assert.match(server, /getInvitationEmailConfiguration\(\)/);
  assert.match(server, /emailCalendarConfigured: configuration\.state === "ready"/);
  assert.doesNotMatch(page, /RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|provider_message_id/);
  assert.match(page, /No ejecuta recordatorios programados/);
});

test("the production assistant has no mock appointment bot dependency", () => {
  assert.doesNotMatch(page, /appointmentBotSettings|botActivityLog/);
  assert.doesNotMatch(server, /createAdminClient/);
});
