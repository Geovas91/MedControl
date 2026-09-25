import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";

const require = createRequire(import.meta.url);
const pendingLabel = "El asistente está procesando la solicitud.";
const safeFailure = "No fue posible procesar la solicitud. Intenta de nuevo.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function mountAssistant(overrides: {
  llmEnabled?: boolean;
  plan?: () => Promise<unknown>;
  submitIntent?: () => Promise<unknown>;
  confirm?: (actionId: string) => Promise<unknown>;
  cancel?: () => Promise<unknown>;
  resolve?: () => unknown;
} = {}) {
  const state: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let cursor = 0;
  let pending = false;
  let completion: Promise<void> = Promise.resolve();
  const response = { state: "message", message: "Respuesta segura." };
  const resolvedIntent = { state: "parsed", result: { state: "intent", intent: { type: "search_appointments" } } };
  const actions = {
    cancelAssistantProposalAction: overrides.cancel ?? (async () => ({ state: "cancelled", message: "Acción cancelada." })),
    confirmAssistantProposalAction: overrides.confirm ?? (async () => ({ state: "success", message: "Acción completada." })),
    planAssistantConversationAction: overrides.plan ?? (async () => ({ state: "parsed", result: { state: "unsupported", message: "Respuesta segura." } })),
    submitAssistantIntentAction: overrides.submitIntent ?? (async () => response),
    submitAssistantContextualHelperAction: async () => response
  };
  const output = ts.transpileModule(readFileSync("components/bot/appointment-assistant.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(output, {
    exports,
    require: (name: string) => {
      if (name === "react") return {
        useState: (initial: unknown) => {
          const slot = cursor++;
          if (!(slot in state)) state[slot] = initial;
          return [state[slot], (next: unknown) => { state[slot] = typeof next === "function" ? (next as (value: unknown) => unknown)(state[slot]) : next; }];
        },
        useRef: (initial: unknown) => {
          const slot = cursor++;
          if (!(slot in refs)) refs[slot] = { current: initial };
          return refs[slot];
        },
        useTransition: () => {
          cursor++;
          return [pending, (callback: () => Promise<void>) => {
            pending = true;
            completion = Promise.resolve(callback()).finally(() => { pending = false; });
          }];
        }
      };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (name === "@/components/ui/button") return { Button: ({ children, ...props }: any) => createElement("button", props, children) };
      if (name === "@/lib/appointments/query") return { appointmentStatuses: [], getAppointmentStatusLabel: (value: string) => value };
      if (name === "@/app/dashboard/bot/actions") return actions;
      if (name === "@/lib/assistant/orchestration/conversation") return {
        classifyContextualHelper: () => null,
        resolveConversationInput: overrides.resolve ?? (() => resolvedIntent)
      };
      throw new Error(`Unmocked dependency: ${name}`);
    }
  });
  return {
    render: () => { cursor = 0; return exports.AppointmentAssistant({ today: "2026-09-25", timeZone: "America/Mexico_City", llmEnabled: overrides.llmEnabled ?? true }); },
    done: () => completion
  };
}

function resolveTree(node: any): any {
  if (Array.isArray(node)) return node.map(resolveTree);
  if (!node || typeof node !== "object") return node;
  if (typeof node.type === "function") {
    const rendered = resolveTree(node.type(node.props));
    return rendered && typeof rendered === "object" && !Array.isArray(rendered) ? { ...rendered, key: node.key } : rendered;
  }
  return { ...node, props: { ...node.props, children: resolveTree(node.props?.children) } };
}

function nodes(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}

function textContent(node: any): string {
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!node || typeof node !== "object") return String(node ?? "");
  return textContent(node.props?.children);
}

function input(tree: any) { return nodes(tree).find((node) => node.type === "input"); }
function form(tree: any) { return nodes(tree).find((node) => node.type === "form"); }
function send(tree: any) { return nodes(tree).find((node) => node.type === "button" && textContent(node).includes("Enviar")); }
function submit(ui: ReturnType<typeof mountAssistant>, message: string) {
  let tree = resolveTree(ui.render());
  input(tree).props.onChange({ target: { value: message } });
  tree = resolveTree(ui.render());
  form(tree).props.onSubmit({ preventDefault() {} });
}

test("planner request renders the user message and accessible pending bubble immediately, then clears it", async () => {
  const planner = deferred<unknown>();
  let calls = 0;
  const ui = mountAssistant({ plan: () => { calls++; return planner.promise; } });
  submit(ui, "Dame mis citas de hoy");

  const during = resolveTree(ui.render());
  const duringNodes = nodes(during);
  assert.ok(textContent(during).includes("Dame mis citas de hoy"));
  const status = duringNodes.find((node) => node.props?.role === "status");
  assert.ok(status);
  assert.equal(status.props["aria-live"], "polite");
  assert.equal(status.props["aria-label"], pendingLabel);
  assert.equal(input(during).props.disabled, true);
  assert.equal(send(during).props.disabled, true);
  assert.equal(calls, 1);

  planner.resolve({ state: "parsed", result: { state: "unsupported", message: "Respuesta terminada." } });
  await ui.done();
  const after = resolveTree(ui.render());
  assert.equal(nodes(after).some((node) => node.props?.role === "status"), false);
  assert.equal(input(after).props.disabled, false);
  input(after).props.onChange({ target: { value: "siguiente" } });
  const ready = resolveTree(ui.render());
  assert.equal(send(ready).props.disabled, false);
  assert.ok(textContent(ready).includes("Respuesta terminada."));
});

test("pending state prevents a duplicate submit and does not add another planner call", async () => {
  const planner = deferred<unknown>();
  let calls = 0;
  const ui = mountAssistant({ plan: () => { calls++; return planner.promise; } });
  submit(ui, "Ver disponibilidad");
  const tree = resolveTree(ui.render());
  form(tree).props.onSubmit({ preventDefault() {} });
  const during = resolveTree(ui.render());
  assert.equal(calls, 1);
  assert.equal(nodes(during).filter((node) => node.type === "div" && node.props?.className?.includes("ml-auto")).length, 1);
  assert.equal(nodes(during).filter((node) => node.props?.role === "status").length, 1);
  planner.resolve({ state: "parsed", result: { state: "unsupported", message: "Listo." } });
  await ui.done();
});

test("planner-to-server-action remains one pending turn and invokes each action once", async () => {
  const planner = deferred<unknown>();
  const serverAction = deferred<unknown>();
  let plannerCalls = 0;
  let intentCalls = 0;
  const ui = mountAssistant({
    plan: () => { plannerCalls++; return planner.promise; },
    submitIntent: () => { intentCalls++; return serverAction.promise; }
  });
  submit(ui, "Dame mis citas de hoy");
  planner.resolve({ state: "parsed", result: { state: "intent", intent: { type: "search_appointments" } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  let tree = resolveTree(ui.render());
  assert.equal(plannerCalls, 1);
  assert.equal(intentCalls, 1);
  assert.ok(nodes(tree).some((node) => node.props?.role === "status"));
  assert.equal(nodes(tree).filter((node) => node.type === "div" && node.props?.className?.includes("ml-auto")).length, 1);
  serverAction.resolve({ state: "message", message: "Agenda revisada." });
  await ui.done();
  tree = resolveTree(ui.render());
  assert.equal(nodes(tree).some((node) => node.props?.role === "status"), false);
  assert.ok(textContent(tree).includes("Agenda revisada."));
});

test("typing dots stay decorative and reduced-motion disables their animation", async () => {
  const planner = deferred<unknown>();
  const ui = mountAssistant({ plan: () => planner.promise });
  submit(ui, "Ver disponibilidad");
  const tree = resolveTree(ui.render());
  const dots = nodes(tree).find((node) => node.props?.className === "inline-flex gap-1");
  assert.equal(dots?.props["aria-hidden"], "true");
  const styles = readFileSync("app/globals.css", "utf8");
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]+\.assistant-typing-dot \{ animation: none;/);
  planner.resolve({ state: "parsed", result: { state: "unsupported", message: "Listo." } });
  await ui.done();
});

test("rejected server action clears pending and shows only a safe error", async () => {
  const ui = mountAssistant({ llmEnabled: false, submitIntent: async () => { throw new Error("PRIVATE_SERVER_DETAIL"); } });
  submit(ui, "Buscar citas");
  const during = resolveTree(ui.render());
  assert.ok(nodes(during).some((node) => node.props?.role === "status"));
  await ui.done();
  const after = resolveTree(ui.render());
  assert.equal(nodes(after).some((node) => node.props?.role === "status"), false);
  assert.equal(input(after).props.disabled, false);
  assert.ok(textContent(after).includes(safeFailure));
  assert.equal(textContent(after).includes("PRIVATE_SERVER_DETAIL"), false);
});

test("pending indicator is visible only during work; proposal still uses the durable confirm action", async () => {
  const proposal = {
    state: "proposal", action: "Crear cita", patient: "Paciente QA", proposal: { actionId: "safe-action-id" }
  };
  const confirmation = deferred<unknown>();
  let actionId = "";
  const ui = mountAssistant({
    llmEnabled: false,
    submitIntent: async () => proposal,
    confirm: (id?: string) => { actionId = id ?? "safe-action-id"; return confirmation.promise; }
  });
  submit(ui, "Agendar una cita");
  await ui.done();
  let tree = resolveTree(ui.render());
  assert.ok(textContent(tree).includes("Propuesta pendiente"));
  assert.equal(nodes(tree).some((node) => node.props?.role === "status"), false);

  const confirmButton = nodes(tree).find((node) => node.type === "button" && textContent(node).includes("Confirmar"));
  assert.ok(confirmButton);
  confirmButton.props.onClick();
  tree = resolveTree(ui.render());
  assert.ok(nodes(tree).some((node) => node.props?.role === "status"));
  confirmation.resolve({ state: "success", message: "Acción completada." });
  await ui.done();
  tree = resolveTree(ui.render());
  assert.equal(nodes(tree).some((node) => node.props?.role === "status"), false);
  assert.equal(actionId, "safe-action-id");
  assert.ok(textContent(tree).includes("Cita creada correctamente."));
});
