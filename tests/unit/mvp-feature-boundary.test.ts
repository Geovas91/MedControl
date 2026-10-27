import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { commercialPlans, getPlanEntitlements } from "../../config/plans.ts";
import { releaseAllows } from "../../lib/release-boundary.ts";

const native = createRequire(import.meta.url);
const actionId = "11111111-1111-4111-8111-111111111111";
const env = {
  APP_ENV: "production", APPOINTMENT_OUTBOUND_MODE: "normal",
  APPOINTMENT_ASSISTANT_LLM_ENABLED: "true", APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED: "true",
  OPENAI_API_KEY: "synthetic", WHATSAPP_OUTBOUND_ENABLED: "true",
  APPOINTMENT_AUTOMATION_CRON_SECRET: "synthetic-cron-secret-with-sufficient-length"
};

// Execute real entry points and their pure dependencies with the actual fixed
// release policy. Only IO/tenant edges are doubles; invoking one fails the test.
function harness(extraEnv: Record<string, string> = {}, mocks: Record<string, unknown> = {}) {
  let effects = 0;
  const unexpected = () => { effects++; throw Error("Unexpected IO at the MVP boundary"); };
  const edge = new Proxy({}, { get: () => unexpected });
  const actualServers = new Set([
    "lib/server/appointment-automation-runner.ts", "lib/server/appointment-google-calendar.ts",
    "lib/server/google-calendar-provider.ts", "lib/server/whatsapp/config.ts",
    "lib/server/appointment-assistant.ts", "lib/server/google-calendar-integration.ts"
  ]);
  const cache = new Map<string, Record<string, any>>();
  function load(file: string): Record<string, any> {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file)!;
    const exports: Record<string, any> = {};
    cache.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText;
    runInNewContext(source, {
      exports, Buffer, URL, URLSearchParams, Request, Response, FormData, AbortSignal, DOMException,
      setTimeout, clearTimeout, process: { env: { ...env, ...extraEnv } }, fetch: unexpected,
      require(name: string) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === "server-only") return {};
        if (name === "next/server") return { NextResponse: { json: Response.json } };
        if (name === "next/navigation") return {
          usePathname: () => "/dashboard", redirect: (url: string) => { throw Error(`redirect:${url}`); },
          notFound: () => { throw Error("notFound"); }
        };
        if (name === "next/cache") return { revalidatePath: unexpected };
        if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: any) => React.createElement("a", props, children) };
        if (name === "@/lib/logger") return { logger: { info: unexpected, error: unexpected, warn: unexpected } };
        if (name === "@/lib/email/resend-provider") return { sendWithResend: unexpected };
        if (name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
        if (name.startsWith("@/lib/server/") || name.startsWith("@/lib/supabase/")) {
          if (!actualServers.has(name.slice(2) + ".ts")) return edge;
        }
        if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
        if (name.startsWith(".")) return load(path.resolve(path.dirname(file), path.extname(name) ? name : name + ".ts"));
        return native(name);
      }
    });
    return exports;
  }
  return { load, effects: () => effects };
}

test("MVP policy and effective catalog exclude optional features for every plan without changing prices/capacity/staff", () => {
  for (const feature of ["appointment_assistant", "appointment_automations", "google_calendar", "automated_messaging", "experimental_llm"] as const) assert.equal(releaseAllows(feature), false);
  assert.equal(releaseAllows("unrecognized" as never), false);
  assert.equal(releaseAllows("constructor" as never), false);
  for (const [id, price, limit, staff] of [["basic", 349, 1, false], ["plus", 799, 5, true], ["pro", 1299, null, true]] as const) {
    const effective = getPlanEntitlements(id);
    assert.equal(effective.doctorLimit, limit);
    assert.equal(effective.features.additional_staff, staff);
    assert.equal(effective.features.service_bot_tier1, true);
    for (const key of ["appointment_assistant", "google_calendar", "whatsapp_notifications"] as const) assert.equal(effective.features[key], false);
    const plan = commercialPlans.find((entry) => entry.id === id)!;
    assert.equal(plan.monthlyPriceMxn, price);
    assert.doesNotMatch(plan.features.join(" "), /Appointment Assistant|Asistente de agenda|Google Calendar|WhatsApp|SMS/i);
    effective.features.appointment_assistant = true;
    assert.equal(getPlanEntitlements(id).features.appointment_assistant, false);
  }
});

test("actual registry rejects all new mutations and legacy pending confirmations before tenant/DB/provider work", async () => {
  const h = harness();
  const registry = h.load("lib/assistant/tools/registry.ts");
  for (const name of ["create_appointment", "reschedule_appointment", "cancel_appointment", "confirm_appointment"]) {
    const result = await registry.prepareAssistantMutation(name, { clinicId: actionId, enabled: true, patientId: actionId });
    assert.equal(result.ok, false); assert.equal(result.error.code, "forbidden");
  }
  assert.equal((await registry.executeConfirmedAssistantAction(actionId)).ok, false);
  assert.equal((await registry.getAssistantToolContext()).ok, false);
  assert.equal((await registry.executeAssistantReadTool("get_professionals", {})).ok, false);
  assert.equal(h.effects(), 0);
});

test("direct Assistant actions cannot bypass MVP through env, pending proposal or conversation input", async () => {
  const h = harness(); const actions = h.load("app/dashboard/bot/actions.ts");
  assert.equal((await actions.planAssistantConversationAction("agenda una cita", { enabled: true })).result.state, "unsupported");
  assert.equal((await actions.confirmAssistantProposalAction(actionId)).state, "error");
  assert.equal((await actions.submitAssistantIntentAction({ type: "create_appointment", enabled: true })).state, "error");
  assert.equal((await actions.selectAssistantResultAction({}, {})).state, "error");
  assert.equal((await actions.planAssistantConversationWithContextAction("agenda", { enabled: true }, actionId)).resolved.result.state, "unsupported");
  for (const method of ["submitAssistantIntentWithContextAction", "selectAssistantResultWithContextAction"]) {
    const response = await actions[method]({}, { enabled: true });
    assert.equal(response.response.state, "error");
  }
  for (const method of ["searchAssistantPatientSuggestionsAction", "searchAssistantProfessionalSuggestionsAction"]) {
    assert.equal((await actions[method]("synthetic", {})).state, "unavailable");
  }
  assert.equal((await actions.submitAssistantContextualHelperAction({}, "cancel")).state, "error");
  assert.equal((await actions.submitAssistantContextualHelperWithContextAction({}, "cancel", {})).response.state, "error");
  await assert.rejects(actions.saveAppointmentAssistantSettingsAction(new FormData()), /redirect:\/dashboard$/);
  assert.equal(h.effects(), 0);
});

for (const route of ["connect", "callback"]) test(`Google ${route} HTTP handler rejects direct requests before OAuth/state/storage access`, async () => {
  const h = harness(); const handler = h.load(`app/api/integrations/google-calendar/${route}/route.ts`);
  const response = await handler.GET(new Request("https://example.test/api?code=synthetic&state=synthetic&enabled=true"));
  assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: "feature_unavailable" });
  assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.equal(h.effects(), 0);
});

test("Cron retains authorization and rejects even an authenticated direct call before loading a runner", async () => {
  const h = harness(); const { POST } = h.load("app/api/internal/appointment-automations/run/route.ts");
  assert.equal((await POST(new Request("https://example.test", { method: "POST" }))).status, 401);
  const response = await POST(new Request("https://example.test", { method: "POST", headers: { authorization: `Bearer ${env.APPOINTMENT_AUTOMATION_CRON_SECRET}` }, body: '{"enabled":true}' }));
  assert.equal(response.status, 403); assert.equal(h.effects(), 0);
});

test("excluded automation live-status HTTP endpoint performs no tenant or database reads", async () => {
  const h = harness();
  assert.equal((await h.load("app/api/appointment-automations/live-status/route.ts").GET()).status, 403);
  assert.equal(h.effects(), 0);
});

test("application automation runner is a zero-effect no-op in production even with outbound flags enabled", async () => {
  const h = harness(); const runner = h.load("lib/server/appointment-automation-runner.ts");
  const result = await runner.runAppointmentAutomations();
  for (const value of Object.values(result)) assert.equal(value, 0);
  assert.equal(h.effects(), 0);
  const blocked = harness({ APP_ENV: "staging", APPOINTMENT_OUTBOUND_MODE: "invalid" });
  await assert.rejects(blocked.load("lib/server/appointment-automation-runner.ts").runAppointmentAutomations(), /outbound_configuration_blocked/);
  assert.equal(blocked.effects(), 0);
});

test("Google hooks leave manual scheduling independent and transports cannot emit or write sync jobs", async () => {
  const h = harness();
  assert.equal(await h.load("lib/server/appointment-google-calendar.ts").syncAppointmentGoogleCalendar({ appointmentId: actionId, appointmentVersion: "synthetic", operation: "upsert" }), "disabled");
  const provider = h.load("lib/server/google-calendar-provider.ts");
  const input = { accessToken: "synthetic", refreshToken: "synthetic", code: "synthetic", eventId: "event1", payload: {} };
  for (const method of ["exchangeGoogleCalendarAuthorizationCode", "refreshGoogleCalendarAccessToken", "createGoogleCalendarEvent", "updateGoogleCalendarEvent", "deleteGoogleCalendarEvent"]) assert.equal((await provider[method](input)).ok, false);
  assert.equal(await provider.revokeGoogleCalendarToken("synthetic"), false);
  assert.equal((await h.load("lib/server/google-calendar-integration.ts").disconnectOwnGoogleCalendarIntegration()).state, "forbidden");
  assert.equal(h.effects(), 0);
});

test("WhatsApp and both actual LLM entry points stay disabled regardless of credentials/flags", async () => {
  const h = harness();
  assert.equal(h.load("lib/server/whatsapp/config.ts").isWhatsAppOutboundEnabled("true"), false);
  await assert.rejects(h.load("lib/assistant/llm/provider.ts").openAiPlannerProvider({}), { code: "not_configured" });
  await assert.rejects(h.load("lib/assistant/llm/transport.ts").requestOpenAiPlanner({ context: {}, apiKey: "synthetic", model: "synthetic", fetcher: () => { throw Error("Unexpected provider"); } }), { code: "not_configured" });
  assert.equal(h.effects(), 0);
});

for (const page of ["app/dashboard/bot/page.tsx", "app/dashboard/settings/integrations/page.tsx"]) test(`${page} returns notFound before loading data`, async () => {
  const h = harness(); await assert.rejects(h.load(page).default({ searchParams: Promise.resolve({}) }), /notFound/);
  assert.equal(h.effects(), 0);
});

test("navigation hides excluded links even when caller-provided availability is true", () => {
  const h = harness(); const { DashboardShell } = h.load("components/dashboard/dashboard-shell.tsx");
  const html = renderToStaticMarkup(React.createElement(DashboardShell, { appointmentAssistantAvailable: true, clinicalPaymentsAvailable: true }, "synthetic"));
  assert.doesNotMatch(html, /href="\/dashboard\/(?:bot|settings\/integrations)"/);
  for (const route of ["patients", "appointments", "medical-notes", "consents", "billing", "payments", "members", "support"]) assert.ok(html.includes(`href="/dashboard/${route}"`));
  assert.equal(h.effects(), 0);
});

test("optional settings cannot save or disconnect through direct services/actions", async () => {
  const h = harness();
  assert.equal((await h.load("lib/server/appointment-assistant.ts").saveAppointmentAssistantSettingsForActiveTenant({ enabled: true })).state, "forbidden");
  await assert.rejects(h.load("app/dashboard/settings/integrations/actions.ts").disconnectGoogleCalendarAction(), /redirect:\/dashboard\/settings$/);
  assert.equal(h.effects(), 0);
});

test("essential production email configuration remains available under the real MVP policy", () => {
  const h = harness({ EMAIL_REQUIRED: "true", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "synthetic", EMAIL_FROM: "qa@example.test", APP_BASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic" });
  assert.equal(h.load("lib/email/config.ts").getInvitationEmailConfiguration().state, "ready");
  assert.equal(h.effects(), 0);
});

test("actual manual lifecycle preserves tenant-derived RPCs, transitions and safe authorization errors with MVP disabled", async () => {
  for (const role of ["owner", "admin", "doctor", "assistant"]) {
    for (const clinicId of [actionId, "22222222-2222-4222-8222-222222222222"]) {
      let calls = 0;
      const h = harness({}, {
        "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", tenant: { clinic: { id: clinicId }, membership: { role } } }) },
        "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
          calls++; assert.equal(name, "mutate_appointment_lifecycle_for_current_user");
          assert.equal(args.p_clinic_id, clinicId);
          if (role === "assistant") return { data: null, error: { code: "42501" } };
          return { data: [{ appointment_id: actionId, status: args.p_operation === "cancel" ? "cancelled" : "scheduled", changed: true }], error: null };
        } }) },
        "@/lib/logger": { logger: { error() {} } }
      });
      const service = h.load("lib/server/appointment-lifecycle.ts");
      for (const operation of ["reschedule", "cancel", "confirm"]) {
        const result = await service.mutateAppointmentLifecycleForActiveTenant({ appointmentId: actionId, clinicId: "untrusted-foreign-tenant", operation, startsAt: "2030-01-01T10:00:00Z", endsAt: "2030-01-01T10:30:00Z" });
        assert.equal(result.state, role === "assistant" ? "forbidden" : "success");
      }
      assert.equal(calls, 3);
    }
  }
});

test("prepared SQL boundary only revokes optional entry points and disables optional automation producers (not executed)", () => {
  const sql = readFileSync("supabase/migrations/0066_mvp_feature_boundary.sql", "utf8").replace(/--[^\n]*/g, "");
  assert.equal((sql.match(/disable trigger/g) ?? []).length, 3);
  assert.equal((sql.match(/public\.[a-z_]+\(/g) ?? []).length, 8);
  for (const name of ["create_assistant_pending_action_for_current_user", "claim_assistant_pending_action_for_current_user", "execute_claimed_assistant_pending_action_for_current_user", "save_appointment_assistant_settings_for_current_user", "rebuild_clinic_reminder_jobs", "claim_due_appointment_automation_jobs", "begin_appointment_automation_delivery", "issue_review_invitation_for_automation"]) assert.ok(sql.includes(`public.${name}(`));
  assert.doesNotMatch(sql, /\b(?:delete|insert|update|drop|create|row level security|enable trigger)\b/i);
});
