import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const version = "2026-09-09T12:00:00.000Z";

function loadSync(options: {
  entitlement?: boolean;
  mappings?: any[] | ((call: number) => any[]);
  persistence?: boolean | ((call: number) => boolean);
}) {
  const calls = { create: 0, update: 0, delete: 0, persist: 0, list: 0, audits: [] as any[] };
  const appointment = { id: "appointment", doctor_id: "doctor", starts_at: version, ends_at: "2026-09-09T13:00:00.000Z", status: "scheduled", updated_at: version };
  const integration = { id: "integration", clinic_id: "clinic", user_id: "doctor", refresh_token_encrypted: "encrypted", status: "connected" };
  const source = ts.transpileModule(readFileSync("lib/server/appointment-google-calendar.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports: Record<string, any> = {};
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: appointment, error: null }) };
  const mocks: Record<string, any> = {
    "server-only": {},
    "@/lib/calendar/google-event": {
      buildGoogleCalendarEventId: () => "deterministic-event",
      buildGoogleCalendarEventPayload: () => ({ summary: "CliniControl appointment" }),
      shouldSyncGoogleCalendarEvent: () => true
    },
    "@/lib/calendar/token-encryption": { decryptCalendarRefreshToken: () => "refresh-token" },
    "@/lib/logger": { logger: { warn: () => {} } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", user: { id: "actor" }, tenant: { clinic: { id: "clinic", timezone: "UTC" }, membership: { role: "owner" } } }) },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => "plan", canUseFeature: () => options.entitlement ?? true },
    "@/lib/server/google-calendar-config": { getGoogleCalendarConfiguration: () => ({ state: "ready", clientId: "client", clientSecret: "secret", encryptionKey: "key" }) },
    "@/lib/server/google-calendar-provider": {
      refreshGoogleCalendarAccessToken: async () => ({ ok: true, accessToken: "access" }),
      createGoogleCalendarEvent: async () => { calls.create++; return { ok: true, eventId: "deterministic-event" }; },
      updateGoogleCalendarEvent: async () => { calls.update++; return { ok: true, eventId: "deterministic-event" }; },
      deleteGoogleCalendarEvent: async () => { calls.delete++; return { ok: true, eventId: "deterministic-event" }; }
    },
    "@/lib/server/google-calendar-store": {
      clearGoogleCalendarIntegration: async () => ({ error: null }),
      getGoogleCalendarIntegration: async () => ({ data: integration, error: null }),
      listStoredGoogleCalendarEvents: async () => {
        calls.list++;
        const data = typeof options.mappings === "function" ? options.mappings(calls.list) : options.mappings ?? [];
        return { data, error: null };
      },
      reserveGoogleCalendarEvent: async () => ({ data: { id: "mapping" }, error: null }),
      recordGoogleCalendarEventResult: async () => {
        calls.persist++;
        const persisted = typeof options.persistence === "function" ? options.persistence(calls.persist) : options.persistence ?? true;
        return { persisted, error: persisted ? null : { code: "local_write_failed" } };
      },
      auditGoogleCalendarEvent: async (input: any) => { calls.audits.push(input); return { error: null }; }
    },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) }
  };
  runInNewContext(source, { exports, require: (name: string) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return require(name);
  } });
  return { sync: exports.syncAppointmentGoogleCalendar, calls };
}

const pendingMapping = {
  id: "mapping", clinic_id: "clinic", appointment_id: "appointment", integration_id: "integration",
  doctor_user_id: "doctor", google_event_id: "deterministic-event", appointment_version: version,
  sync_status: "pending", last_error_code: null
};

test("provider create plus persisted mapping reports synced", async () => {
  const runtime = loadSync({});
  assert.equal(await runtime.sync({ appointmentId: "appointment", appointmentVersion: version, operation: "upsert" }), "synced");
  assert.equal(runtime.calls.create, 1);
  assert.equal(runtime.calls.persist, 1);
});

test("provider create success plus local persistence failure cannot report synced", async () => {
  const runtime = loadSync({ persistence: false });
  assert.equal(await runtime.sync({ appointmentId: "appointment", appointmentVersion: version, operation: "upsert" }), "failed");
  assert.equal(runtime.calls.create, 1);
  assert.equal(runtime.calls.audits.at(-1).metadata.reason, "local_persistence_failed");
});

test("retry after create persistence failure updates the reserved provider id without duplicate create", async () => {
  const runtime = loadSync({
    mappings: call => call === 1 ? [] : [pendingMapping],
    persistence: call => call > 1
  });
  assert.equal(await runtime.sync({ appointmentId: "appointment", appointmentVersion: version, operation: "upsert" }), "failed");
  assert.equal(await runtime.sync({ appointmentId: "appointment", appointmentVersion: version, operation: "upsert" }), "synced");
  assert.deepEqual({ create: runtime.calls.create, update: runtime.calls.update }, { create: 1, update: 1 });
});

test("provider update success plus local persistence failure stays failed", async () => {
  const runtime = loadSync({ mappings: [{ ...pendingMapping, appointment_version: "older", sync_status: "synced" }], persistence: false });
  assert.equal(await runtime.sync({ appointmentId: "appointment", appointmentVersion: version, operation: "upsert" }), "failed");
  assert.equal(runtime.calls.update, 1);
});

test("lost entitlement cleans an existing mapping", async () => {
  const runtime = loadSync({ entitlement: false, mappings: [pendingMapping] });
  assert.equal(await runtime.sync({ appointmentId: "appointment", appointmentVersion: version, operation: "upsert" }), "deleted");
  assert.equal(runtime.calls.delete, 1);
  assert.equal(runtime.calls.create, 0);
});

test("lost entitlement blocks creation when there is no mapping to clean", async () => {
  const runtime = loadSync({ entitlement: false });
  assert.equal(await runtime.sync({ appointmentId: "appointment", appointmentVersion: version, operation: "upsert" }), "disabled");
  assert.deepEqual({ create: runtime.calls.create, update: runtime.calls.update, delete: runtime.calls.delete }, { create: 0, update: 0, delete: 0 });
});
