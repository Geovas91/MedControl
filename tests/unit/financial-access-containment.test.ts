import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Actual services/pages execute against a recording SDK; pgTAP separately
// exercises direct PostgreSQL authority. No credentials or external requests.
const require = createRequire(import.meta.url);
const ids = { clinic: "61000000-0000-4000-8000-000000000100", patient: "61000000-0000-4000-8000-000000000201" };
const form = { patientId: ids.patient, concept: "Synthetic QA", amount: "100", currency: "MXN", paymentMethod: "cash", status: "pending", paidDate: "", paidTime: "" };
type Role = "owner" | "admin" | "doctor" | "assistant";

function harness(role: Role = "owner") {
  const queries: { table: string; select?: string; filters: [string, unknown][]; operation?: string; values?: unknown }[] = [];
  const logs: unknown[] = [];
  const state = { context: "ready", writable: true, paymentError: false, patientVisible: true, clientCalls: 0, aggregateCalls: 0 };
  const tenant = { clinic: { id: ids.clinic, name: "Synthetic QA", timezone: "America/Mexico_City" }, membership: { role, is_professional: role === "doctor", status: "active" } };
  const patient = { id: ids.patient, clinic_id: ids.clinic, full_name: "Synthetic QA", status: "active" };
  const payments = ["paid", "pending"].map((status, i) => ({ id: `synthetic-payment-${i}`, clinic_id: ids.clinic, patient_id: ids.patient, amount: (i + 1) * 100, currency: "MXN", status, payment_method: "cash", concept: "Synthetic QA", paid_at: null, created_at: "2026-01-01T00:00:00Z", patients: patient }));
  function from(table: string) {
    const record: (typeof queries)[number] = { table, filters: [] };
    queries.push(record);
    let head = false, single = false, range: number[] | null = null;
    const result = () => {
      if (table === "payments" && state.paymentError) return { data: null, count: null, error: { code: "XX000", message: "private raw financial error" } };
      let rows: Record<string, unknown>[] = table === "payments" ? payments : table === "patients" && state.patientVisible ? [patient] : [];
      for (const [key, value] of record.filters) if (!key.includes(".")) rows = rows.filter((row) => row[key] === value);
      const count = rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: record.operation === "insert" || head ? null : single ? rows[0] ?? null : rows, count, error: null };
    };
    const q: any = {
      select: (fields: string, options?: { head?: boolean }) => { record.select = fields; head = options?.head ?? false; return q; },
      eq: (key: string, value: unknown) => { record.filters.push([key, value]); return q; },
      in: () => q, not: () => q, gte: () => q, lt: () => q, order: () => q, limit: () => q, or: () => q, ilike: () => q,
      range: (start: number, end: number) => { range = [start, end]; return q; },
      maybeSingle: () => { single = true; return Promise.resolve(result()); },
      insert: (values: unknown) => { record.operation = "insert"; record.values = values; return q; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
    };
    return q;
  }
  const mocks: Record<string, any> = {
    "server-only": {},
    "@/lib/logger": { logger: { error: (...args: unknown[]) => logs.push(args) } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: state.context, tenant }) },
    "@/lib/supabase/server": { createClient: async () => { state.clientCalls++; return { from }; } },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({ state: state.writable ? "ready" : "subscription_missing" }), canCreateWithEntitlements: () => state.writable },
    "@/lib/server/patient-access": { canAccessClinicalPatientForActiveTenant: async () => ({ state: "ready", allowed: true }) },
    "next/link": { __esModule: true, default: ({ children, href, ...props }: any) => React.createElement("a", { ...props, href }, children) },
    "next/navigation": { redirect: (href: string) => { throw new Error(`redirect:${href}`); }, usePathname: () => "/dashboard" },
    "@/components/pwa/install-app-button": { InstallAppButton: () => null },
    "@/components/app-version-label": { AppVersionLabel: () => null }
  };
  const cache = new Map<string, Record<string, any>>();
  function load(file: string): Record<string, any> {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute)!;
    const exports: Record<string, any> = {};
    cache.set(absolute, exports);
    const source = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports, URL, FormData, require: (name: string) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name);
        const resolved = [base, base + ".ts", base + ".tsx"].find(existsSync);
        if (!resolved) throw new Error(`Missing test module: ${name}`);
        return load(resolved);
      }
      return require(name);
    } });
    if (absolute === path.resolve("lib/dashboard/metrics.ts")) {
      const aggregate = exports.aggregateMxnPayments;
      exports.aggregateMxnPayments = (...args: unknown[]) => { state.aggregateCalls++; return aggregate(...args); };
    }
    return exports;
  }
  return { load, mocks, queries, logs, state, tenant };
}

for (const role of ["doctor", "assistant"] as const) {
  test(`${role} financial list is forbidden before SDK, filters, methods or counts`, async () => {
    const h = harness(role);
    const result = await h.load("lib/server/payments.ts").getClinicalPaymentsForActiveTenant({ q: "Synthetic", patient: ids.patient, method: "cash", status: "paid" });
    assert.equal(result.state, "forbidden"); assert.equal(result.data, null);
    assert.equal(h.state.clientCalls, 0); assert.equal(h.queries.length, 0);
  });
  test(`${role} dashboard skips both financial query and calculation; real page hides financial widgets`, async () => {
    const h = harness(role);
    const result = await h.load("lib/server/dashboard.ts").getDashboardOverview();
    assert.equal(result.state, "ready");
    assert.equal(JSON.stringify(result.data.financial), '{"state":"forbidden"}');
    assert.equal(h.queries.filter((q) => q.table === "payments").length, 0);
    assert.equal(h.state.aggregateCalls, 0); assert.equal(result.data.patientCount, 1);
    const html = renderToStaticMarkup(await h.load("app/dashboard/page.tsx").default());
    assert.doesNotMatch(html, /Ingresos|Saldo pendiente|dashboard\/payments/);
    assert.match(html, /Pacientes/); assert.match(html, /Citas activas/); assert.match(html, /Agenda de hoy/); assert.match(html, /Actividad reciente/);
    assert.match(html, /xl:grid-cols-2/);
  });
  test(`${role} patient detail keeps clinical context but skips payment query and rows`, async () => {
    const h = harness(role);
    const result = await h.load("lib/server/patient-detail.ts").getPatientDetailForActiveTenant(ids.patient);
    assert.equal(result.state, "ready"); assert.equal(result.data.patient.id, ids.patient);
    assert.equal(JSON.stringify(result.data.financial), '{"state":"forbidden"}');
    assert.equal("payments" in result.data, false);
    assert.equal(h.queries.some((q) => q.table === "payments"), false);
    assert.equal(result.data.canAccessClinicalData, role === "doctor");
    assert.equal(h.queries.filter((q) => q.table === "appointments").length, 2);
  });
  test(`${role} direct financial routes render restriction without rows, inputs or form`, async () => {
    const h = harness(role);
    const props = { searchParams: Promise.resolve({ patient: ids.patient, status: "paid" }) };
    const listHtml = renderToStaticMarkup(await h.load("app/dashboard/payments/page.tsx").default(props));
    assert.match(listHtml, /Acceso restringido/); assert.match(listHtml, /únicamente para los roles administrativos/);
    assert.doesNotMatch(listHtml, /<form|<input|<select|<table|Registrar pago|Synthetic QA/);
    // Form module is intentionally not instantiated in the forbidden route.
    h.mocks["@/components/payments/create-clinical-payment-form"] = { CreateClinicalPaymentForm: () => { throw new Error("Forbidden form rendered"); } };
    const createHtml = renderToStaticMarkup(await h.load("app/dashboard/payments/new/page.tsx").default(props));
    assert.match(createHtml, /Acceso restringido/); assert.doesNotMatch(createHtml, /puede consultar|<form/);
    assert.equal(h.state.clientCalls, 0);
  });
  test(`${role} payment creation and alternate list helper cannot bypass containment`, async () => {
    const h = harness(role);
    const service = h.load("lib/server/create-payment.ts");
    assert.equal((await service.getClinicalPaymentCreationOptions()).state, "forbidden");
    assert.equal((await service.createClinicalPaymentForActiveTenant(form)).state, "forbidden");
    assert.equal((await h.load("lib/supabase/data-access.ts").listPaymentsForClinic(ids.clinic)).state, "forbidden");
    assert.equal(h.state.clientCalls, 0);
  });
}

for (const role of ["owner", "admin"] as const) {
  test(`${role} list preserves financial rows, methods, patients, summaries and tenant-scoped filters`, async () => {
    const h = harness(role);
    const result = await h.load("lib/server/payments.ts").getClinicalPaymentsForActiveTenant({ status: "paid", method: "cash", patient: ids.patient, q: "Synthetic", date_from: "2026-01-01", date_to: "2026-12-31" });
    assert.equal(result.state, "ready"); assert.equal(result.data.payments.length, 1);
    assert.equal(result.data.methods[0], "cash"); assert.equal(result.data.patients[0].id, ids.patient);
    assert.equal(result.data.summaries.length, 1); assert.equal(result.data.filteredTotal, 1);
    assert.equal(result.data.query.status, "paid"); assert.equal(result.data.query.patient, ids.patient);
    assert.equal(result.data.query.method, "cash"); assert.equal(result.data.query.search, "Synthetic");
    assert.ok(h.queries.every((q) => q.filters.some(([key, value]) => key === "clinic_id" && value === ids.clinic)));
    const html = renderToStaticMarkup(await h.load("app/dashboard/payments/page.tsx").default({ searchParams: Promise.resolve({}) }));
    assert.match(html, /Registrar pago/); assert.match(html, /<form/); assert.match(html, /aria-label="Listado de pagos clínicos"/);
  });
  test(`${role} dashboard preserves summaries and complete financial widget navigation`, async () => {
    const h = harness(role);
    const result = await h.load("lib/server/dashboard.ts").getDashboardOverview();
    assert.equal(result.data.financial.state, "visible");
    assert.equal(result.data.financial.paidMxn, 100); assert.equal(result.data.financial.pendingMxn, 200);
    assert.equal(h.state.aggregateCalls, 1);
    const html = renderToStaticMarkup(await h.load("app/dashboard/page.tsx").default());
    assert.match(html, /Ingresos/); assert.match(html, /Pendiente/);
    assert.match(html, /href="\/dashboard\/payments\?status=paid"/); assert.match(html, /href="\/dashboard\/payments\?status=pending"/);
    assert.match(html, /xl:grid-cols-4/);
  });
  test(`${role} patient detail retains scoped payments and creation retains server-derived clinic`, async () => {
    const h = harness(role);
    const result = await h.load("lib/server/patient-detail.ts").getPatientDetailForActiveTenant(ids.patient);
    assert.equal(result.state, "ready"); assert.equal(result.data.financial.state, "visible");
    assert.equal(result.data.financial.payments.length, 2);
    const query = h.queries.find((q) => q.table === "payments")!;
    assert.ok(query.filters.some(([key, value]) => key === "patient_id" && value === ids.patient));
    const creation = h.load("lib/server/create-payment.ts");
    assert.equal((await creation.getClinicalPaymentCreationOptions()).state, "ready");
    assert.equal((await creation.createClinicalPaymentForActiveTenant(form)).state, "success");
    const insert = h.queries.find((q) => q.operation === "insert")!;
    assert.equal((insert.values as { clinic_id: string }).clinic_id, ids.clinic);
  });
  test(`${role} missing/read-only entitlement preserves reads but denies creation`, async () => {
    const h = harness(role); h.state.writable = false;
    assert.equal((await h.load("lib/server/payments.ts").getClinicalPaymentsForActiveTenant({})).state, "ready");
    assert.equal((await h.load("lib/server/dashboard.ts").getDashboardOverview()).data.financial.state, "visible");
    const service = h.load("lib/server/create-payment.ts");
    assert.equal((await service.getClinicalPaymentCreationOptions()).state, "forbidden");
    assert.equal((await service.createClinicalPaymentForActiveTenant(form)).state, "forbidden");
    assert.equal(h.queries.some((q) => q.operation === "insert"), false);
  });
}

test("payment query errors remain technical errors without logging raw errors or amounts", async () => {
  const h = harness(); h.state.paymentError = true;
  assert.equal((await h.load("lib/server/payments.ts").getClinicalPaymentsForActiveTenant({})).state, "error");
  assert.equal((await h.load("lib/server/dashboard.ts").getDashboardOverview()).state, "error");
  assert.equal((await h.load("lib/server/patient-detail.ts").getPatientDetailForActiveTenant(ids.patient)).state, "error");
  assert.doesNotMatch(JSON.stringify(h.logs), /private raw financial error|amount|Synthetic QA/);
});

for (const state of ["unauthenticated", "no_active_membership", "error"]) test(`financial list retains ${state} before SDK access`, async () => {
  const h = harness(); h.state.context = state;
  assert.equal((await h.load("lib/server/payments.ts").getClinicalPaymentsForActiveTenant({})).state, state);
  assert.equal(h.state.clientCalls, 0);
});

test("alternate financial helper rejects a caller-provided foreign clinic before SDK access", async () => {
  const h = harness();
  assert.equal((await h.load("lib/supabase/data-access.ts").listPaymentsForClinic("foreign-clinic")).state, "forbidden");
  assert.equal(h.state.clientCalls, 0);
});

test("payment creation preserves tenant-safe patient validation", async () => {
  const h = harness(); h.state.patientVisible = false;
  assert.equal((await h.load("lib/server/create-payment.ts").createClinicalPaymentForActiveTenant(form)).state, "validation_error");
  assert.equal(h.queries.some((q) => q.operation === "insert"), false);
});

for (const visible of [false, true]) test(`financial navigation visibility=${visible} preserves Billing and other navigation`, () => {
  const h = harness();
  const Shell = h.load("components/dashboard/dashboard-shell.tsx").DashboardShell;
  const html = renderToStaticMarkup(React.createElement(Shell, { clinicalPaymentsAvailable: visible, appointmentAssistantAvailable: true }, "Synthetic content"));
  assert.equal(html.includes('href="/dashboard/payments"'), visible);
  assert.match(html, /href="\/dashboard\/billing"/); assert.match(html, /href="\/dashboard\/patients"/);
  assert.match(html, /href="\/dashboard\/bot"/); assert.match(html, /Abrir navegación/);
});
