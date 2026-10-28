import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createBillingHandlers } from "../../lib/paypal/billing-handlers.ts";
import { BillingError, authorizeBillingActor, billingCreationAvailability } from "../../lib/paypal/billing-policy.ts";
import type { BillingIntent } from "../../lib/paypal/billing-policy.ts";
import { createBillingSubmissionClient } from "../../lib/paypal/creation-client.ts";
import * as policy from "../../lib/paypal/billing-policy.ts";
import { commercialPlans } from "../../config/plans.ts";

const id = "67000000-0000-4000-8000-000000000001";
const actor = { userId: "synthetic-owner", clinicId: "synthetic-clinic" };
const request = (planId = "basic") => new Request("https://example.test/api/paypal/subscription/create", { method: "POST", body: JSON.stringify({ planId, clinicId: "untrusted-clinic", retry: true }) });

// Atomic DB-edge model for HTTP orchestration/failure tests. This is NOT a
// PostgreSQL concurrency test; the SQL suite/script are prepared separately.
function harness() {
  const intent: BillingIntent = { id, user_id: actor.userId, clinic_id: actor.clinicId, plan_id: "basic", provider_plan_id: "P-BASIC", provider_subscription_id: null, status: "pending", expires_at: new Date(Date.now() + 60_000).toISOString(), creation_dispatched_at: null };
  const state = { posts: 0, gets: 0, claims: 0, binds: 0, active: false, status: "APPROVAL_PENDING", mismatch: false, failBeforeClaim: false, failAfterPost: false, failBind: false, bindResponseLost: false, failGet: false, missingMigration: false, role: "owner", clinic: actor.clinicId, deny: false, claimResponseLost: false };
  const handlers = createBillingHandlers({
    authorize: async () => authorizeBillingActor({ userId: actor.userId, clinicId: actor.clinicId, membershipClinicId: state.clinic, role: state.role, membershipStatus: "active" }),
    plan: plan => plan === "basic" ? "P-BASIC" : "P-PRO",
    begin: async (who, plan, providerPlan) => {
      assert.deepEqual(who, actor);
      if (state.active) throw new BillingError(409, "billing_subscription_exists");
      if (plan !== intent.plan_id || providerPlan !== intent.provider_plan_id) throw new BillingError(409, "billing_intent_in_progress");
      const snapshot = { ...intent };
      if (state.missingMigration) delete snapshot.creation_dispatched_at;
      return snapshot;
    },
    claim: async (who, claimed) => {
      assert.deepEqual(who, actor); assert.equal(claimed.id, id); state.claims++;
      if (state.deny || intent.creation_dispatched_at || state.active) return false;
      intent.creation_dispatched_at = new Date().toISOString();
      if (state.claimResponseLost) throw Error("PRIVATE claim acknowledgement lost");
      return true;
    },
    create: async (_intent, claim) => {
      if (state.failBeforeClaim) throw Error("synthetic OAuth failure");
      await claim(); state.posts++;
      await Promise.resolve();
      if (state.failAfterPost) throw Error("PRIVATE provider response lost");
      return { id: "I-SYNTHETIC123" };
    },
    bind: async (_intent, subscription) => {
      state.binds++;
      if (state.failBind) throw Error("PRIVATE database failure");
      intent.provider_subscription_id = subscription;
      if (state.bindResponseLost) throw Error("PRIVATE bind response lost");
    },
    details: async subscription => {
      state.gets++;
      assert.equal(intent.provider_subscription_id, subscription, "ID is durable before GET");
      if (state.failGet) throw Error("PRIVATE provider GET failure");
      return { id: subscription, plan_id: state.mismatch ? "P-WRONG" : "P-BASIC", custom_id: id, status: state.status };
    },
    find: async () => ({ ...intent }), complete: async () => { throw Error("initiate must never complete approval"); }
  });
  return { state, intent, handlers };
}

test("sequential requests reuse the same persisted subscription and preserve intent identity", async () => {
  const h = harness();
  const first = await h.handlers.initiate(request()); const second = await h.handlers.initiate(request());
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(h.state.posts, 1); assert.equal(h.state.claims, 1); assert.equal(h.state.gets, 2);
});

test("multiple tabs race through the real handler but only one DB permit can reach a POST", async () => {
  const h = harness();
  const responses = await Promise.all(Array.from({ length: 8 }, () => h.handlers.initiate(request())));
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status === 409).length, 7);
  assert.equal(h.state.posts, 1);
  assert.equal((await h.handlers.initiate(request())).status, 200);
  assert.equal(h.state.posts, 1);
});

test("a different plan conflicts rather than replacing a pending operation", async () => {
  const h = harness();
  const result = await h.handlers.initiate(request("pro"));
  assert.equal(result.status, 409); assert.equal((await result.json()).code, "billing_intent_in_progress");
  assert.equal(h.state.posts + h.state.gets + h.state.claims, 0);
});

test("active clinic is rejected before provider calls", async () => {
  const h = harness(); h.state.active = true;
  const result = await h.handlers.initiate(request());
  assert.equal(result.status, 409); assert.match((await result.json()).error, /ya tiene una suscripción/);
  assert.equal(h.state.posts + h.state.gets + h.state.claims, 0);
});

for (const failure of ["failAfterPost", "failBind"] as const) test(`${failure}: unknown outcome stays blocked after expiry and never produces a second POST`, async () => {
  const h = harness(); h.state[failure] = true;
  const result = await h.handlers.initiate(request());
  assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /PRIVATE/);
  h.state[failure] = false; h.intent.expires_at = new Date(0).toISOString();
  const retry = await h.handlers.initiate(request());
  assert.equal(retry.status, 409); assert.equal((await retry.json()).code, "billing_creation_unknown");
  assert.equal(h.state.posts, 1); assert.equal(h.state.gets, 0);
});

for (const failure of ["bindResponseLost", "failGet"] as const) test(`${failure}: retries recover through the known ID without another creation`, async () => {
  const h = harness(); h.state[failure] = true;
  assert.equal((await h.handlers.initiate(request())).status, 503);
  h.state[failure] = false;
  assert.equal((await h.handlers.initiate(request())).status, 200);
  assert.equal(h.state.posts, 1); assert.equal(h.state.binds, 1);
});

test("pre-POST failure leaves the same unsent operation available for a safe retry", async () => {
  const h = harness(); h.state.failBeforeClaim = true;
  assert.equal((await h.handlers.initiate(request())).status, 503);
  assert.equal(h.state.claims + h.state.posts, 0);
  h.state.failBeforeClaim = false;
  assert.equal((await h.handlers.initiate(request())).status, 200);
  assert.equal(h.state.posts, 1);
});

test("lost claim acknowledgement fails closed without a POST or a replacement permit", async () => {
  const h = harness(); h.state.claimResponseLost = true;
  assert.equal((await h.handlers.initiate(request())).status, 503);
  h.state.claimResponseLost = false;
  assert.equal((await h.handlers.initiate(request())).status, 409);
  assert.equal(h.state.posts, 0); assert.equal(h.state.claims, 1);
});

test("expired known provider result cannot be offered as a new successful checkout", async () => {
  const h = harness(); h.intent.provider_subscription_id = "I-SYNTHETIC123";
  h.intent.expires_at = new Date(0).toISOString();
  assert.equal((await h.handlers.initiate(request())).status, 409);
  assert.equal(h.state.posts + h.state.gets, 0);
});

for (const status of ["ACTIVE", "APPROVED", "CANCELLED", "EXPIRED", "SUSPENDED", "UNKNOWN"]) test(`existing ${status} provider subscription cannot start another checkout`, async () => {
  const h = harness(); h.intent.provider_subscription_id = "I-SYNTHETIC123"; h.state.status = status;
  assert.equal((await h.handlers.initiate(request())).status, 409);
  assert.equal(h.state.posts, 0);
});

test("provider mismatch is rejected after storing the identity, never reported as success", async () => {
  const h = harness(); h.state.mismatch = true;
  assert.equal((await h.handlers.initiate(request())).status, 409);
  assert.equal((await h.handlers.initiate(request())).status, 409);
  assert.equal(h.state.posts, 1); assert.equal(h.intent.provider_subscription_id, "I-SYNTHETIC123");
});

for (const condition of ["missingMigration", "deny"] as const) test(`${condition}: unavailable database enforcement cannot fall back to creating`, async () => {
  const h = harness(); h.state[condition] = true;
  assert.notEqual((await h.handlers.initiate(request())).status, 200);
  assert.equal(h.state.posts, 0);
});

for (const role of ["admin", "doctor", "assistant"]) test(`${role} cannot reach a creation claim`, async () => {
  const h = harness(); h.state.role = role;
  assert.equal((await h.handlers.initiate(request())).status, 403);
  assert.equal(h.state.posts + h.state.claims + h.state.gets, 0);
});
test("cross-tenant membership fails before all billing IO", async () => {
  const h = harness(); h.state.clinic = "other-clinic";
  assert.equal((await h.handlers.initiate(request())).status, 403);
  assert.equal(h.state.posts + h.state.claims + h.state.gets, 0);
});

test("browser repeated clicks share one request and conflicting cards cannot submit concurrently", async () => {
  let calls = 0; let resolve!: (response: Response) => void;
  const submit = createBillingSubmissionClient(async () => { calls++; return new Promise(done => { resolve = done; }); });
  const first = submit("basic"), second = submit("basic");
  assert.equal(first, second);
  await assert.rejects(submit("pro"), /billing_intent_in_progress/);
  assert.equal(calls, 1);
  resolve(Response.json({ intentId: id, subscriptionId: "I-SYNTHETIC123" }));
  assert.deepEqual(await first, await second);
});

test("browser errors remain errors and do not cause an automatic POST retry", async () => {
  let calls = 0;
  const submit = createBillingSubmissionClient(async () => { calls++; return Response.json({ code: "billing_creation_unknown" }, { status: 409 }); });
  await assert.rejects(submit("basic"), /billing_creation_unknown/);
  assert.equal(calls, 1);
});

test("presentation disables active, unresolved, conflicting and expired provider operations", () => {
  const h = harness();
  for (const status of ["active", "past_due"]) assert.equal(billingCreationAvailability({ status, provider_subscription_id: null }, []).code, "billing_subscription_exists");
  assert.equal(billingCreationAvailability({ status: "cancelled", provider_subscription_id: "I-SYNTHETIC123" }, []).code, "billing_subscription_exists");
  assert.equal(billingCreationAvailability(null, [h.intent]).resumePlan, "basic");
  assert.equal(billingCreationAvailability(null, [h.intent, h.intent]).code, "billing_reconciliation_required");
  h.intent.creation_dispatched_at = new Date().toISOString();
  assert.equal(billingCreationAvailability(null, [h.intent]).code, "billing_creation_unknown");
  h.intent.provider_subscription_id = "I-SYNTHETIC123";
  assert.equal(billingCreationAvailability(null, [h.intent]).resumePlan, "basic");
  h.intent.expires_at = new Date(0).toISOString();
  assert.equal(billingCreationAvailability(null, [h.intent]).code, "billing_creation_unknown");
});

test("actual disabled PayPal component does not render or load a checkout", () => {
  const exports: Record<string, any> = {}; const native = createRequire(import.meta.url);
  runInNewContext(ts.transpileModule(readFileSync("components/dashboard/paypal-subscription-button.tsx", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, require(name: string) {
    if (name === "@/components/ui/button") return { Button: () => { throw Error("Unexpected checkout"); } };
    if (name === "@/lib/paypal/creation-client") return { createBillingSubmissionClient: () => () => { throw Error("Unexpected request"); } };
    if (name === "@/lib/paypal/billing-policy") return {};
    if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    return native(name);
  } });
  const html = renderToStaticMarkup(React.createElement(exports.PaypalSubscriptionButton, { planId: "basic", paypalPlanId: "P-BASIC", clientId: "synthetic", label: "Subscribe", disabledReason: "Ya existe una suscripción" }));
  assert.match(html, /Ya existe una suscripción/); assert.doesNotMatch(html, /paypal-subscription-|<button/);
});

function loadModule(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {}, native = createRequire(import.meta.url);
  runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { ...globals, exports, process: { env: {} }, require(name: string) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return native(name);
  } });
  return exports;
}

test("actual billing server rechecks owner, scopes availability reads and sanitizes SQL conflicts", async () => {
  let role = "owner", reads = 0;
  const server = loadModule("lib/paypal/billing-server.ts", {
    "server-only": {}, "./billing-policy": policy,
    "./billing-handlers": { createBillingHandlers },
    "./server": { getPaypalPlanId: () => "P-BASIC" }, "@/config/plans": { isPlanId: () => true },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", user: { id: actor.userId }, tenant: { clinic: { id: actor.clinicId }, membership: { clinic_id: actor.clinicId, role, status: "active" } } }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({
      from: (table: string) => ({ select: () => ({ eq: (key: string, value: string) => {
        reads++; assert.equal(key, "clinic_id"); assert.equal(value, actor.clinicId);
        const result = { data: table === "paypal_billing_intents" ? [] : { status: "active", provider_subscription_id: "I-SYNTHETIC123" }, error: null };
        return { maybeSingle: async () => result, then: (resolve: (value: unknown) => void) => resolve(result) };
      } }) }),
      rpc: async () => ({ data: null, error: { code: "23505", message: "billing_subscription_exists", details: "PRIVATE" } })
    }) }
  });
  assert.equal((await server.getPaypalBillingCreationAvailability()).code, "billing_subscription_exists");
  assert.equal(reads, 2);
  role = "admin";
  assert.equal((await server.getPaypalBillingCreationAvailability()).code, "billing_unavailable");
  assert.equal(reads, 2);
  const response = await server.billingHandlers.initiate(request());
  assert.equal(response.status, 403);
  role = "owner";
  const conflict = await server.billingHandlers.initiate(request());
  assert.equal(conflict.status, 409); assert.doesNotMatch(await conflict.text(), /PRIVATE/);
});

test("real PayPal callbacks keep a checkout blocked after a conflict, including SDK error/cancel callbacks", async () => {
  const cells: any[] = ["idle", null]; let cell = 0, refreshed = 0;
  let effect: (() => void) | undefined; let callbacks: any;
  const component = loadModule("components/dashboard/paypal-subscription-button.tsx", {
    react: {
      useState: () => { const index = cell++; return [cells[index], (value: any) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }]; },
      useRef: (value: unknown) => ({ current: value === null ? {} : value }), useId: () => "synthetic",
      useEffect: (callback: () => void) => { effect = callback; }
    },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshed++; } }) },
    "@/components/ui/button": {}, "@/lib/paypal/billing-policy": policy,
    "@/lib/paypal/creation-client": { createBillingSubmissionClient: () => async () => { throw new BillingError(409, "billing_creation_unknown"); } }
  }, { window: { paypal: { Buttons(options: unknown) { callbacks = options; return { render: async () => {} }; } } } });
  component.PaypalSubscriptionButton({ clientId: "synthetic", paypalPlanId: "P-BASIC", planId: "basic", label: "Subscribe" });
  assert.ok(effect); effect();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(callbacks);
  await assert.rejects(callbacks.createSubscription(), /billing_creation_unknown/);
  assert.equal(cells[0], "blocked"); assert.equal(refreshed, 1);
  callbacks.onError(new Error("PRIVATE SDK")); callbacks.onCancel();
  assert.equal(cells[0], "blocked"); assert.match(cells[1], /pendiente de verificación/); assert.doesNotMatch(cells[1], /PRIVATE/);
});

test("actual billing page offers no checkout for an active clinic and keeps all prices", async () => {
  const wrap = ({ children }: any) => React.createElement("div", null, children);
  const page = loadModule("app/dashboard/billing/page.tsx", {
    "next/navigation": { redirect: () => { throw Error("unexpected redirect"); } },
    "@/components/ui/badge": { Badge: wrap }, "@/components/dashboard/page-header": { PageHeader: wrap },
    "@/components/dashboard/paypal-subscription-button": { PaypalSubscriptionButton: ({ disabledReason }: any) => { assert.ok(disabledReason); return React.createElement("p", null, disabledReason); } },
    "@/config/plans": { commercialPlans }, "@/lib/format": { formatMXN: (value: number) => String(value) },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", tenant: { clinic: { id: actor.clinicId }, membership: { role: "owner" } } }) },
    "@/lib/paypal/billing-policy": policy,
    "@/lib/paypal/billing-server": { getPaypalBillingCreationAvailability: async () => ({ code: "billing_subscription_exists", resumePlan: null }) },
    "@/lib/paypal/server": { getPaypalEnvironment: () => "sandbox", getPaypalPlanIdForPlan: () => "P-SYNTHETIC", hasPaypalPublicConfig: () => true },
    "@/lib/supabase/subscriptions": { getClinicPlanContext: async () => ({ state: "ready", data: { plan: commercialPlans[0], planId: "basic", subscription: { status: "active" } } }) }
  });
  const html = renderToStaticMarkup(await page.default());
  assert.match(html, /ya tiene una suscripción/); assert.doesNotMatch(html, /Cambiar a|Mantener/);
  for (const amount of [349, 799, 1299]) assert.ok(html.includes(String(amount)));
});
