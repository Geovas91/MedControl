import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, Date, process, require: (name: string) => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith("@/") || name === "server-only" ? {} : require(name) });
  return exports;
}

for (const plan of ["basic", "plus", "pro"]) {
  for (const status of ["active", "trialing", "trial_expired", "past_due", "inactive", "cancelled"]) {
    test(`${plan}/${status}: canonical Assistant new-work state`, async () => {
      const entitlements = load("lib/server/entitlements.ts", {});
      const access = load("lib/server/appointment-assistant-access.ts", { "@/lib/server/entitlements": entitlements });
      const expected = plan === "basic" ? "upgrade_required" : ["active", "trialing"].includes(status) ? "ready" : "subscription_read_only";
      assert.equal(access.resolveAssistantCommercialAccess({ state: "ready", entitlements: { effectiveStatus: status, plan: { features: { appointment_assistant: plan !== "basic" } } } }), expected);
    });
  }
}

for (const state of ["missing", "error"]) {
  test(`${state}: never becomes Basic or an upgrade error`, () => {
    const entitlements = load("lib/server/entitlements.ts", {});
    const access = load("lib/server/appointment-assistant-access.ts", { "@/lib/server/entitlements": entitlements });
    assert.equal(access.resolveAssistantCommercialAccess({ state }), state === "missing" ? "subscription_missing" : "error");
    assert.doesNotMatch(access.getAssistantAccessMessage("error"), /facturación|Plus|Pro/);
  });
}

for (const state of ["upgrade_required", "subscription_missing", "subscription_read_only", "forbidden", "error"]) {
  test(`${state}: all conversational entry points deny before planner, reads, proposal or execution`, async () => {
    const counters = { provider: 0, read: 0, proposal: 0, execution: 0 };
    const denied = { ok: false, error: { code: "entitlement", safeMessage: state } };
    const actions = load("app/dashboard/bot/actions.ts", {
      "next/cache": { revalidatePath() {} }, "next/navigation": {},
      "@/lib/assistant/tools/registry": {
        getAssistantToolContext: async () => denied,
        executeAssistantReadTool: async () => { counters.read++; throw Error("unexpected read"); },
        prepareAssistantMutation: async () => { counters.proposal++; throw Error("unexpected proposal"); },
        executeConfirmedAssistantAction: async () => { counters.execution++; return denied; }
      },
      "@/lib/assistant/parser/deterministic": { isAssistantIntent: () => true },
      "@/lib/assistant/llm/gated-planner": { runGatedAssistantPlanner: async () => { counters.provider++; throw Error("unexpected provider"); } }
    });
    await actions.planAssistantConversationAction("Agenda mañana", null);
    await actions.submitAssistantIntentAction({ type: "search_patients", query: "QA" });
    await actions.submitAssistantContextualHelperAction({ type: "create_appointment" }, "patients");
    await actions.selectAssistantResultAction({}, {});
    await actions.planAssistantConversationWithContextAction("Agenda mañana", null);
    await actions.submitAssistantIntentWithContextAction({}, null);
    await actions.submitAssistantContextualHelperWithContextAction({}, "patients", null);
    await actions.selectAssistantResultWithContextAction({}, null);
    await actions.searchAssistantPatientSuggestionsAction("QA", null);
    await actions.searchAssistantProfessionalSuggestionsAction("QA", null);
    assert.deepEqual(counters, { provider: 0, read: 0, proposal: 0, execution: 0 });
  });
}

test("automation SQL protects new dispatch but preserves accepted reconciliation", () => {
  const sql = readFileSync("supabase/migrations/0059_appointment_assistant_plan_authority.sql", "utf8");
  assert.match(sql, /begin_appointment_automation_delivery[\s\S]+clinic_has_effective_automation_subscription_internal/);
  assert.doesNotMatch(sql, /create (?:or replace )?function public\.(mark_appointment_automation_delivery_accepted|finish_appointment_automation_job|claim_due_appointment_automation_jobs)/);
  assert.match(sql, /for share/);
  assert.match(sql, /mutation_executed_at is not null/);
});

for (const jobType of ["reminder_email", "review_request_email"]) {
  for (const gate of ["initial", "final", "dispatch"]) {
    test(`${jobType}/${gate}: real runner makes zero provider calls after entitlement loss`, async () => {
      const automation = load("lib/appointment-automations.ts", {});
      const start = new Date(Date.now() + 3600000).toISOString();
      const job = { id: "job", clinic_id: "clinic", appointment_id: "appointment", type: jobType, source_version: start, attempts: 1, max_attempts: 3, lease_token: "lease", delivery_state: "not_started" };
      let provider = 0, reads = 0;
      const finishes: Record<string, unknown>[] = [];
      const client = { rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "claim_due_appointment_automation_jobs") return { data: [job], error: null };
        if (name === "get_appointment_automation_context") {
          reads++;
          return { data: [{ ...job, job_type: jobType, starts_at: start, appointment_status: jobType === "reminder_email" ? "scheduled" : "completed", doctor_user_id: "doctor", patient_email: "synthetic@example.test", doctor_display_name: "Synthetic", clinic_timezone: "America/Mexico_City", valid_subscription: gate === "initial" ? false : gate === "final" ? reads < 2 : reads < 3, assistant_enabled: true, reminder_enabled: true, review_request_enabled: true, invitation_exists: false, review_exists: false }], error: null };
        }
        if (name === "issue_review_invitation_for_automation") return { data: [{ invitation_id: "synthetic", raw_token: "synthetic", expires_at: start }], error: null };
        if (name === "begin_appointment_automation_delivery") return { data: false, error: null };
        if (name === "finish_appointment_automation_job") finishes.push(args);
        return { data: true, error: null };
      } };
      const runner = load("lib/server/appointment-automation-runner.ts", {
        "@/lib/appointment-automations": automation,
        "@/lib/appointment-automation-heartbeat": { runWithAppointmentAutomationHeartbeat: async (_client: unknown, work: () => unknown) => work() },
        "@/lib/supabase/admin": { createAdminClient: () => client },
        "@/lib/email/provider": { getInvitationEmailConfiguration: () => ({ state: "ready" }) },
        "@/lib/email/resend-provider": { sendWithResend: async () => { provider++; throw Error("unexpected provider"); } },
        "@/lib/logger": { logger: { info() {}, warn() {}, error() {} } }
      });
      const result = await runner.runAppointmentAutomations();
      assert.equal(provider, 0);
      assert.equal(result.skipped, 1);
      assert.equal(result.succeeded, 0);
      assert.equal(finishes.length, 1);
      assert.equal(finishes[0].p_error_code, "invalidated_entitlement");
    });
  }
}

for (const state of ["upgrade_required", "subscription_missing", "error", "forbidden", "subscription_read_only", "ready"]) {
  test(`${state}: page renders only the authorized chat and CTA surfaces`, async () => {
    const data = { tenant: { clinic: { id: "clinic", timezone: "America/Mexico_City" } }, localDate: "2030-01-07", canWriteSettings: state === "ready", canManageSettings: true, activity: [], upcoming: [], totals: { today: 0, upcoming: 0 }, automationJobs: [], automationScheduler: null };
    const page = load("app/dashboard/bot/page.tsx", {
      "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }), Fragment: "fragment" },
      "@/components/ui/button": { ButtonLink: "billingCTA" },
      "@/components/bot/appointment-assistant": { AppointmentAssistant: "chat" },
      "@/components/bot/appointment-assistant-settings": { AppointmentAssistantSettings: "settings" },
      "@/lib/server/appointment-assistant": { getAppointmentAssistantForActiveTenant: async () => ({ state: ["ready", "subscription_read_only"].includes(state) ? "ready" : state, data }) },
      "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", user: { id: "actor" } }) },
      "@/lib/appointment-automation-live-status": { buildAppointmentAutomationLiveStatus: () => ({}) },
      "@/lib/appointment-assistant": { hasAppointmentAssistantSavedMessage: () => false, hasAppointmentAssistantSettingsError: () => false }
    });
    const tree = JSON.stringify(await page.default({ searchParams: Promise.resolve({}) }));
    assert.equal(tree.includes('"type":"chat"'), state === "ready");
    assert.equal(tree.includes('"href":"/dashboard/billing"'), ["upgrade_required", "subscription_missing", "subscription_read_only"].includes(state));
    if (state === "subscription_read_only") assert.match(tree, /en modo de consulta/);
    if (["upgrade_required", "subscription_missing", "error", "forbidden"].includes(state)) assert.doesNotMatch(tree, /"type":"settings"/);
  });
}
