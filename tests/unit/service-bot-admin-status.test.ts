import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { supportStatusLabels } from "../../lib/support/presentation.ts";
import { isSupportUuid } from "../../lib/support/security.ts";

const require = createRequire(import.meta.url);
const id = "11111111-1111-4111-8111-111111111111";
const states = ["open", "triaged", "in_progress", "waiting_user", "resolved", "closed"] as const;
const expected = {
  open: [["triaged", "Pasar a triage"]],
  triaged: [["in_progress", "Iniciar atención"]],
  in_progress: [["waiting_user", "Esperando usuario"], ["resolved", "Resolver"]],
  waiting_user: [["in_progress", "Reanudar atención"]],
  resolved: [["closed", "Cerrar ticket"]],
  closed: []
};

// Execute the actual TS/TSX with isolated framework and database boundaries.
function load(path: string, mocks: Record<string, unknown>) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(output, { exports, require: (name: string) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "react/jsx-runtime") return require(name);
    throw new Error(`Unmocked dependency: ${name}`);
  } });
  return exports;
}

function controls(status: string, action: (...args: unknown[]) => Promise<unknown> = async () => ({ state: "ready" })) {
  const values: any[] = [];
  let index = 0;
  let pending = false;
  let completion: Promise<void> | undefined;
  const loaded = load("components/admin/support-admin-controls.tsx", {
    react: {
      useState: (initial: unknown) => { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], (value: unknown) => { values[slot] = value; }]; },
      useTransition: () => [pending, (callback: () => Promise<void>) => { pending = true; completion = Promise.resolve(callback()).finally(() => { pending = false; }); }]
    },
    "@/app/admin/support/actions": { transitionSupportAction: action },
    "@/lib/support/presentation": { supportStatusLabels }
  });
  return {
    render: () => { index = 0; return loaded.SupportAdminControls({ ticket: { id, status, assigned_to: null }, admins: [] }); },
    done: () => completion
  };
}

function statusButtons(tree: any) { return tree.props.children[0].props.children[1]; }

for (const status of states) {
  test(`admin UI ${status}: exact Spanish status and only allowed actions`, async () => {
    const calls: unknown[][] = [];
    const ui = controls(status, async (...args) => { calls.push(args); return { state: "ready" }; });
    const tree = ui.render();
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes(`Estado: ${supportStatusLabels[status]}`));
    assert.deepEqual(Array.from(statusButtons(tree), (button: any) => button.props.children), expected[status].map(([, label]) => label));
    for (const [index, [target]] of expected[status].entries()) {
      statusButtons(tree)[index].props.onClick();
      assert.ok(statusButtons(ui.render()).every((button: any) => button.props.disabled));
      await ui.done();
      assert.deepEqual(calls.at(-1), [id, status, target]);
    }
  });
}

test("unknown status exposes no admin transitions", () => {
  assert.equal(statusButtons(controls("arbitrary").render()).length, 0);
});

for (const failure of ["invalid_transition", "error", "throws"]) {
  test(`admin status failure ${failure} is visible and releases pending controls`, async () => {
    const ui = controls("open", async () => { if (failure === "throws") throw new Error("PRIVATE_ERROR"); return { state: failure }; });
    statusButtons(ui.render())[0].props.onClick();
    await ui.done();
    const html = renderToStaticMarkup(ui.render());
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /PRIVATE_ERROR|disabled=""/);
    assert.match(html, /Estado: Abierto/);
  });
}

function server(from: string, denied = false, stale = false) {
  const calls: Array<{ fn: string; args: any }> = [];
  let guards = 0;
  let clients = 0;
  const admin = { rpc: async (fn: string, args: any) => {
    calls.push({ fn, args });
    return { data: stale ? [] : [{ event_id: "event", reference_code: "REFERENCE", created_by: "requester", status: args.p_to_status }], error: null };
  } };
  const loaded = load("lib/server/support/admin.ts", {
    "server-only": {},
    "@/lib/admin/require-platform-admin": { requirePlatformAdmin: async () => { guards++; if (denied) throw new Error("forbidden"); return { id: "admin" }; } },
    "@/lib/supabase/admin": { createAdminClient: () => { clients++; return admin; } },
    "@/lib/logger": { logger: { error: () => {} } },
    "@/lib/support/security": { isSupportUuid },
    "@/lib/support/tickets": {}
  });
  return { transition: loaded.transitionAdminSupportTicket, calls, guards: () => guards, clients: () => clients };
}

for (const from of states) for (const to of states) {
  test(`server transition ${from} -> ${to}`, async () => {
    const service = server(from);
    const allowed = expected[from].some(([target]) => target === to);
    assert.equal((await service.transition(id, from, to)).state, allowed ? "ready" : "invalid_transition");
    assert.equal(service.guards(), 1);
    if (!allowed) { assert.equal(service.calls.length, 0); return; }
    assert.deepEqual(JSON.parse(JSON.stringify(service.calls)), [{ fn: "transition_admin_support_ticket", args: {
      p_ticket_id: id, p_expected_status: from, p_to_status: to, p_actor_user_id: "admin"
    } }]);
  });
}

test("stale expected status is a safe no-op", async () => {
  const service = server("open", false, true);
  assert.equal((await service.transition(id, "open", "triaged")).state, "invalid_transition");
  assert.equal(service.calls.length, 1);
});

test("server rejects arbitrary client statuses before creating a database client", async () => {
  for (const to of ["arbitrary", "__proto__", "constructor", "", "Cerrado"]) {
    const service = server("open");
    assert.equal((await service.transition(id, "open", to)).state, "invalid_input");
    assert.equal(service.clients(), 0);
    assert.equal(service.calls.length, 0);
  }
});

test("platform admin authorization cannot be bypassed", async () => {
  const service = server("open", true);
  await assert.rejects(service.transition(id, "open", "triaged"), /forbidden/);
  assert.equal(service.clients(), 0);
  assert.equal(service.calls.length, 0);
});

test("tenant reads current status without importing admin controls or actions", () => {
  const page = readFileSync("app/dashboard/support/tickets/[id]/page.tsx", "utf8");
  const actions = readFileSync("app/dashboard/support/actions.ts", "utf8");
  const service = readFileSync("lib/server/support/tickets.ts", "utf8");
  assert.match(page, /supportStatusLabels\[ticket.status\]/);
  assert.match(page, /force-dynamic/);
  assert.doesNotMatch(page + actions, /SupportAdminControls|transitionSupportAction|transitionAdminSupportTicket|@\/.*admin/);
  assert.match(service, /\.eq\("clinic_id", contextResult.context.clinicId\)\.eq\("id", ticketId\)/);
  assert.match(service, /canClose: ticketRow.created_by === contextResult.context.userId && ticketRow.status === "resolved"/);
  const adminActions = readFileSync("app/admin/support/actions.ts", "utf8");
  assert.match(adminActions, /hasValidSupportMutationOrigin/);
  assert.ok(adminActions.includes('revalidatePath("/dashboard/support")'));
  assert.ok(adminActions.includes('revalidatePath(`/dashboard/support/tickets/${id}`)'));
});

for (const status of states) {
  test(`tenant renders updated ${status} without admin actions`, async () => {
    const ticket = {
      id, status, referenceCode: "LOCAL-TEST", subject: "Soporte local", summary: "Sin datos clínicos",
      category: "other", severity: "normal", createdAt: "2026-09-08T12:00:00.000Z"
    };
    const page = load("app/dashboard/support/tickets/[id]/page.tsx", {
      "next/link": { __esModule: true, default: ({ children }: any) => children },
      "next/navigation": { notFound: () => { throw new Error("not_found"); }, redirect: () => { throw new Error("redirect"); } },
      "lucide-react": { ArrowLeft: () => null },
      "@/components/dashboard/page-header": { PageHeader: () => null },
      "@/components/support/ticket-actions": { AddSupportTicketMessageForm: () => null, CloseSupportTicketForm: () => null },
      "@/lib/support/presentation": { supportStatusLabels, supportCategoryLabels: { other: "Otro" }, supportSeverityLabels: { normal: "Normal" }, formatSupportDate: () => "8 sep 2026" },
      "@/lib/server/support/tickets": { getSupportTicketDetail: async () => ({ state: "ready", data: {
        ticket, messages: [], events: [{ id: "event", event_type: "support_ticket_status_changed", to_status: status, created_at: ticket.createdAt }], canClose: false
      } }) }
    });
    const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }));
    assert.ok(html.includes(`>${supportStatusLabels[status]}</dd>`));
    assert.ok(html.includes(`Estado actualizado a ${supportStatusLabels[status]}`));
    assert.doesNotMatch(html, /<button|Estado del ticket|Asignarme|Nota interna/);
  });
}
