import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { PassThrough } from "node:stream";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as context from "../../lib/assistant/orchestration/context.ts";
import * as conversation from "../../lib/assistant/orchestration/conversation.ts";
import * as parser from "../../lib/assistant/parser/deterministic.ts";
import * as timeFilter from "../../lib/assistant/orchestration/time-filter.ts";
import * as readTools from "../../lib/assistant/orchestration/read-tools.ts";
import * as domainGate from "../../lib/assistant/llm/domain-gate.ts";
import * as structuredSelection from "../../lib/assistant/orchestration/structured-selection.ts";
import * as intents from "../../lib/assistant/orchestration/intents.ts";
import * as query from "../../lib/appointments/query.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const clinicId = "22222222-2222-4222-8222-222222222222";
const today = "2026-10-20";
const timeZone = "America/Mexico_City";

const require = createRequire(import.meta.url);
const appointmentId = "33333333-3333-4333-8333-333333333333";
const fixture = { appointment_id: appointmentId, patient_display_name: "QA Patient", professional_display_name: "QA Doctor", starts_at: "2026-10-21T22:00:00Z", ends_at: "2026-10-21T22:30:00Z", status: "scheduled" };

function loadActions(rows: typeof fixture[] = [], options: { authorized?: boolean; readError?: boolean; patientValidation?: "unavailable" | "error"; professionalValidation?: "unavailable" | "error" | "exception"; appointmentStatus?: string; appointmentThrowsOnRead?: number } = {}) {
  const reads: Array<{ name: string; input: any }> = [];
  const diagnostics: Array<[string, Record<string, unknown>]> = [];
  const validationError = new Error("PRIVATE_POST_VALIDATION_ERROR credential=PRIVATE_CREDENTIAL");
  let appointmentReads = 0;
  const mocks: Record<string, unknown> = {
    "@/lib/assistant/orchestration/context": context,
    "@/lib/assistant/orchestration/conversation": conversation,
    "@/lib/assistant/parser/deterministic": parser,
    "@/lib/assistant/orchestration/time-filter": timeFilter,
    "@/lib/assistant/orchestration/read-tools": readTools,
    "@/lib/assistant/llm/domain-gate": domainGate,
    "@/lib/assistant/orchestration/structured-selection": structuredSelection,
    "@/lib/assistant/orchestration/intents": intents,
    "@/lib/appointments/query": query,
    "@/lib/dashboard/timezone": { getClinicDayRange: () => ({ localDate: today }) },
    "@/lib/assistant/tools/registry": {
      getAssistantToolContext: async () => options.authorized === false
        ? { ok: false, error: { code: "forbidden", safeMessage: "Debes iniciar sesión." } }
        : { ok: true, data: { userId: actorId, clinicId, role: "assistant", isProfessional: false, timeZone } },
      executeAssistantReadTool: async (name: string, input: unknown) => {
        reads.push({ name, input });
        if (name === "get_professionals") {
          if (options.professionalValidation === "exception") throw new Error("PRIVATE_LOOKUP_EXCEPTION");
          return options.professionalValidation === "error"
            ? { ok: false, error: { code: "generic", safeMessage: "PRIVATE_LOOKUP_ERROR" } }
            : { ok: true, data: [] };
        }
        if (name === "get_appointment") {
          appointmentReads++;
          if (appointmentReads === options.appointmentThrowsOnRead) throw validationError;
          return { ok: true, data: { ...fixture, status: options.appointmentStatus ?? "scheduled" } };
        }
        assert.equal(name, "search_appointments");
        if (options.readError) return { ok: false, error: { code: "generic", safeMessage: "No fue posible consultar la agenda. Intenta de nuevo." } };
        const filter = (input as { timeFilter?: timeFilter.AssistantTimeFilter }).timeFilter;
        return { ok: true, data: { appointments: rows.filter((row) => {
          const localTime = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(row.starts_at));
          return !filter || timeFilter.assistantTimeMatches(localTime, filter);
        }), hasMore: false } };
      },
      prepareAssistantMutation: () => assert.fail("Unexpected mutation proposal"),
      executeConfirmedAssistantAction: () => assert.fail("Unexpected mutation execution")
    },
    "@/lib/assistant/llm/gated-planner": { runGatedAssistantPlanner: () => assert.fail("Unexpected provider call") },
    "@/lib/assistant/llm/provider": { openAiPlannerProvider: () => assert.fail("Unexpected provider call") },
    "@/lib/server/patients": { isPatientAvailableForActiveTenant: () => {
      if (options.patientValidation === "unavailable") return false;
      if (options.patientValidation === "error") throw new Error("PRIVATE_VALIDATOR_ERROR");
      assert.fail("No patient was selected");
    } },
    "@/lib/logger": { logger: { info: (event: string, details: Record<string, unknown>) => diagnostics.push([event, details]) } }
  };
  const actions: Record<string, (...args: any[]) => Promise<any>> = {};
  const source = ts.transpileModule(readFileSync("app/dashboard/bot/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports: actions, Date, Intl, process: { env: { APPOINTMENT_ASSISTANT_LLM_ENABLED: "false" } }, require: (name: string) => {
    // Retained implementation fixture only; real MVP denial has separate runtime tests.
    if (name === "@/lib/release-boundary") return { releaseAllows: () => true };
    if (name in mocks) return mocks[name];
    if (["next/cache", "next/navigation", "@/lib/appointment-assistant", "@/lib/assistant/llm/rate-limit", "@/lib/server/appointment-assistant", "@/lib/server/entitlements"].includes(name)) return {};
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return { actions, reads, diagnostics, validationError };
}

function mountAssistant(actions: ReturnType<typeof loadActions>["actions"]) {
  const state: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let cursor = 0;
  let pending = false;
  let completion = Promise.resolve();
  const exports: Record<string, any> = {};
  const source = ts.transpileModule(readFileSync("components/bot/appointment-assistant.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, require: (name: string) => {
    if (name === "react") return {
      useEffect: () => {},
      useState: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value: any) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
      useRef: (initial: unknown) => { const index = cursor++; if (!(index in refs)) refs[index] = { current: initial }; return refs[index]; },
      useTransition: () => { cursor++; return [pending, (operation: () => Promise<void>) => { pending = true; completion = operation().finally(() => { pending = false; }); }]; }
    };
    if (name === "react/jsx-runtime") return require(name);
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name === "@/components/ui/button") return { Button: "button" };
    if (name === "@/lib/appointments/query") return query;
    if (name === "@/app/dashboard/bot/actions") return actions;
    if (name === "@/lib/assistant/orchestration/conversation") return conversation;
    if (name === "@/lib/assistant/orchestration/context") return context;
    throw new Error(`Unexpected UI dependency: ${name}`);
  } });
  const render = () => { cursor = 0; return exports.AppointmentAssistant({ today, timeZone, llmEnabled: false }); };
  const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
  const text = (node: any): string => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : String(node ?? "");
  return {
    render,
    text: () => text(render()),
    send: async (message: string) => {
      nodes(render()).find((node) => node.type === "input").props.onChange({ target: { value: message } });
      nodes(render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
      await completion;
    }
  };
}

test("empty agenda from the UI's first-turn path survives a contextual filter replacement", async () => {
  const { actions, reads } = loadActions();
  const first = conversation.resolveConversationInput(null, "Muéstrame mi agenda de mañana después de las 15:00.", today);
  assert.equal(first.state, "parsed");
  if (first.state !== "parsed" || first.result.state !== "intent") assert.fail("Expected a read intent");
  const submitted = await actions.submitAssistantIntentWithContextAction(first.result.intent, null);
  assert.equal(submitted.response.state, "appointments");
  assert.equal(submitted.response.appointments.length, 0);
  assert.equal(submitted.context.activeIntent, "search_appointments");
  assert.equal(submitted.context.focusedAppointmentRef, undefined);
  const second = await actions.planAssistantConversationWithContextAction("Mejor antes de las 12:00.", submitted.context);
  assert.equal(second.resolved.result.state, "intent");
  const refined = await actions.submitAssistantIntentWithContextAction(second.resolved.result.intent, second.context);
  assert.equal(refined.response.state, "appointments");
  assert.equal(refined.context.localDate, "2026-10-21");
  assert.deepEqual(JSON.parse(JSON.stringify(refined.context.timeFilter)), { maximum: { time: "12:00", inclusive: false } });
  assert.equal(reads.length, 2);
});

test("UI integration: empty first result, context replacement and a third read use the actual server actions", async () => {
  const { actions, reads, diagnostics } = loadActions();
  const ui = mountAssistant(actions);
  await ui.send("Muéstrame mi agenda de mañana después de las 15:00.");
  assert.match(ui.text(), /Encontré 0 citas/);
  await ui.send("Mejor antes de las 12:00.");
  await ui.send("Después de las 15:00.");
  assert.equal(reads.length, 3);
  assert.deepEqual(reads.map((read) => read.input.date), ["2026-10-21", "2026-10-21", "2026-10-21"]);
  assert.deepEqual(reads.map((read) => JSON.parse(JSON.stringify(read.input.timeFilter))), [
    { minimum: { time: "15:00", inclusive: false } },
    { maximum: { time: "12:00", inclusive: false } },
    { minimum: { time: "15:00", inclusive: false } }
  ]);
  assert.doesNotMatch(ui.text(), /selección anterior|No fue posible|Propuesta pendiente/);
  assert.equal(JSON.stringify(diagnostics).includes("invalidated"), false);
});

test("three turns starting without a filter preserve the clinic-local date", async () => {
  const { actions, reads } = loadActions();
  const ui = mountAssistant(actions);
  await ui.send("Muéstrame las citas de mañana.");
  await ui.send("Después de las 15:00.");
  await ui.send("Mejor antes de las 12:00.");
  assert.equal(reads.length, 3);
  assert.ok(reads.every((read) => read.input.date === "2026-10-21"));
  assert.doesNotMatch(ui.text(), /selección anterior|No fue posible/);
});

for (const count of [1, 2]) test(`${count} appointment result(s) can be refined without selecting or mutating a row`, async () => {
  const rows = count === 1 ? [fixture] : [fixture, { ...fixture, appointment_id: "44444444-4444-4444-8444-444444444444" }];
  const { actions, reads } = loadActions(rows);
  const ui = mountAssistant(actions);
  await ui.send("Muéstrame mi agenda de mañana después de las 15:00.");
  assert.match(ui.text(), new RegExp(`Encontré ${count} citas`));
  await ui.send("Mejor antes de las 12:00.");
  assert.equal(reads.filter((read) => read.name === "search_appointments").length, 2);
  assert.match(ui.text(), /Encontré 0 citas/);
  assert.doesNotMatch(ui.text(), /selección anterior|No fue posible|Propuesta pendiente/);
});

for (const reason of ["expired", "scope_changed"] as const) test(`${reason} context does not reuse date, filter or selected appointment in a refinement`, async () => {
  const { actions, reads } = loadActions();
  const prior = {
    ...context.newAssistantConversationContext({ actorId, clinicId }),
    activeIntent: "search_appointments",
    focusedAppointmentRef: appointmentId,
    localDate: "2026-10-21",
    timeFilter: { minimum: { time: "15:00", inclusive: false } },
    ...(reason === "expired" ? { updatedAt: Date.now() - 901_000 } : { clinicId: "55555555-5555-4555-8555-555555555555" })
  };
  const next = await actions.planAssistantConversationWithContextAction("Mejor antes de las 12:00.", prior);
  assert.equal(next.resolved.result.state, "needs_input");
  assert.equal(next.context.focusedAppointmentRef, undefined);
  assert.equal(next.context.localDate, undefined);
  assert.equal(next.context.timeFilter, undefined);
  assert.equal(next.context.actorId, actorId);
  assert.equal(next.context.clinicId, clinicId);
  assert.equal(reads.length, 0);
});

test("loss of authorization blocks planning and submission before any protected read", async () => {
  const { actions, reads } = loadActions([], { authorized: false });
  const planned = await actions.planAssistantConversationWithContextAction("Mejor antes de las 12:00.", null);
  assert.equal(planned.resolved.result.state, "unsupported");
  const submitted = await actions.submitAssistantIntentWithContextAction({ type: "search_appointments", localDate: "2026-10-21" }, null);
  assert.equal(submitted.response.state, "error");
  assert.equal(submitted.context, null);
  assert.equal(reads.length, 0);
});

test("a temporary agenda query failure stays an error and preserves the previous safe read context", async () => {
  const { actions } = loadActions([], { readError: true });
  const prior = { ...context.newAssistantConversationContext({ actorId, clinicId }), activeIntent: "search_appointments", localDate: "2026-10-21", timeFilter: { minimum: { time: "15:00", inclusive: false } } };
  const result = await actions.submitAssistantIntentWithContextAction(context.intentFromAssistantContext(prior as context.AssistantConversationContext), prior);
  assert.equal(result.response.state, "error");
  assert.equal(result.context.localDate, prior.localDate);
  assert.deepEqual(result.context.timeFilter, prior.timeFilter);
  assert.doesNotMatch(result.response.message, /selección anterior/);
});

test("React Flight response and action-argument transport preserve an empty agenda's context across three turns", async () => {
  // Use the installed Next codecs; only the server codec needs the react-server React build.
  const hooks = registerHooks({ resolve(specifier, parent, next) {
    return next(specifier === "react" && parent.parentURL?.includes("react-server-dom-webpack-server.node.production")
      ? "next/dist/compiled/react/react.react-server.js" : specifier, parent);
  } });
  let server;
  try { server = require("next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js"); }
  finally { hooks.deregister(); }
  const client = require("next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js");
  const fromServer = async (value: unknown) => {
    const stream = new PassThrough();
    server.renderToPipeableStream(value, {}).pipe(stream);
    return await client.createFromNodeStream(stream, { moduleMap: {}, serverModuleMap: {}, moduleLoading: null });
  };
  const toServer = async (value: unknown) => await server.decodeReply(await client.encodeReply(value), {});
  const { actions, reads } = loadActions();
  const first = conversation.resolveConversationInput(null, "Muéstrame mi agenda de mañana después de las 15:00.", today);
  if (first.state !== "parsed" || first.result.state !== "intent") assert.fail("Expected agenda");
  let reply = await fromServer(await actions.submitAssistantIntentWithContextAction(...await toServer([first.result.intent, null])));
  for (const message of ["Mejor antes de las 12:00.", "Después de las 15:00."]) {
    const planned = await fromServer(await actions.planAssistantConversationWithContextAction(...await toServer([message, reply.context])));
    assert.equal(planned.resolved.result.state, "intent");
    reply = await fromServer(await actions.submitAssistantIntentWithContextAction(...await toServer([planned.resolved.result.intent, planned.context])));
    assert.equal(reply.response.state, "appointments");
    assert.equal(reply.context.activeIntent, "search_appointments");
    assert.equal(reply.context.localDate, "2026-10-21");
    assert.equal(reply.context.focusedAppointmentRef, undefined);
  }
  assert.equal(reads.length, 3);
});

for (const result of ["unavailable", "error"] as const) test(`invalidation diagnostics identify patient validation ${result} without exposing its reference or exception`, async () => {
  const { actions, diagnostics, reads } = loadActions([], { patientValidation: result });
  const prior = { ...context.newAssistantConversationContext({ actorId, clinicId }), activeIntent: "search_appointments", focusedPatientRef: appointmentId, localDate: "2026-10-21" };
  await actions.submitAssistantIntentWithContextAction({ type: "search_appointments", localDate: "2026-10-21" }, prior);
  const invalidation = diagnostics.find(([event]) => event === "assistant_context_invalidated");
  assert.ok(invalidation);
  assert.equal(invalidation[1].reference_category, "patient");
  assert.equal(invalidation[1].validation_result, result);
  assert.equal(invalidation[1].transition_type, "load");
  assert.equal(invalidation[1].reason_code, result === "error" ? "validation_exception" : "reference_unavailable");
  for (const privateValue of [actorId, clinicId, appointmentId, "PRIVATE_VALIDATOR_ERROR"]) assert.equal(JSON.stringify(diagnostics).includes(privateValue), false);
  assert.equal(reads.length, 0, "failed revalidation never reaches the agenda read");
});

test("post-read invalidation identifies a newly focused cancelled appointment without logging its data", async () => {
  const { actions, diagnostics } = loadActions([fixture], { appointmentStatus: "cancelled" });
  const submitted = await actions.submitAssistantIntentWithContextAction({ type: "search_appointments", localDate: "2026-10-21" }, null);
  assert.equal(submitted.response.state, "message", "the existing reference validation remains fail-closed");
  const invalidation = diagnostics.find(([event]) => event === "assistant_context_invalidated");
  assert.ok(invalidation);
  assert.equal(invalidation[1].reference_category, "appointment");
  assert.equal(invalidation[1].validation_result, "unavailable");
  assert.equal(invalidation[1].transition_type, "after_read");
  for (const value of [appointmentId, actorId, clinicId, fixture.patient_display_name, fixture.professional_display_name]) assert.equal(JSON.stringify(diagnostics).includes(value), false);
});

for (const result of ["unavailable", "error", "exception"] as const) test(`professional validation distinguishes ${result} from other failure categories`, async () => {
  const { actions, diagnostics, reads } = loadActions([], { professionalValidation: result });
  const prior = { ...context.newAssistantConversationContext({ actorId, clinicId }), activeIntent: "check_availability", focusedProfessionalRef: appointmentId, localDate: "2026-10-21" };
  await actions.submitAssistantIntentWithContextAction(context.intentFromAssistantContext(prior as context.AssistantConversationContext), prior);
  const invalidation = diagnostics.find(([event]) => event === "assistant_context_invalidated");
  assert.ok(invalidation);
  assert.equal(invalidation[1].reference_category, "professional");
  assert.equal(invalidation[1].validation_result, result === "unavailable" ? "unavailable" : "error");
  assert.equal(invalidation[1].reason_code, result === "unavailable" ? "reference_unavailable" : result === "error" ? "reference_lookup_error" : "validation_exception");
  assert.deepEqual(reads.map((read) => read.name), ["get_professionals"]);
  for (const value of [actorId, clinicId, appointmentId, "PRIVATE_LOOKUP_ERROR", "PRIVATE_LOOKUP_EXCEPTION"]) assert.equal(JSON.stringify(diagnostics).includes(value), false);
});

for (const transition of ["after_read", "after_selection"] as const) test(`${transition} validator exception emits one safe diagnostic and preserves rejection`, async () => {
  const { actions, diagnostics, reads, validationError } = loadActions([fixture], { appointmentThrowsOnRead: transition === "after_read" ? 1 : 2 });
  const operation = transition === "after_read"
    ? actions.submitAssistantIntentWithContextAction({ type: "search_appointments", localDate: "2026-10-21" }, null)
    : actions.selectAssistantResultWithContextAction({ kind: "appointment", label: "PRIVATE_SELECTION_LABEL", reference: appointmentId }, null);
  await assert.rejects(operation, (error: unknown) => error === validationError, "revalidation failure must not become a successful response or a different exception");
  assert.deepEqual(reads.map((read) => read.name), transition === "after_read" ? ["search_appointments", "get_appointment"] : ["get_appointment", "get_appointment"]);
  const invalidations = diagnostics.filter(([event]) => event === "assistant_context_invalidated");
  assert.equal(invalidations.length, 1, "the post-validation exception needs exactly one diagnostic");
  assert.deepEqual(JSON.parse(JSON.stringify(invalidations[0][1])), {
    reason_code: "validation_exception",
    transition_type: transition,
    reference_category: "appointment",
    validation_result: "error"
  });
  for (const privateValue of [actorId, clinicId, appointmentId, fixture.patient_display_name, fixture.professional_display_name, fixture.starts_at, "PRIVATE_SELECTION_LABEL", validationError.message, validationError.stack!, "PRIVATE_CREDENTIAL"]) {
    assert.equal(JSON.stringify(diagnostics).includes(privateValue), false, "diagnostics contain static metadata only");
  }
});
