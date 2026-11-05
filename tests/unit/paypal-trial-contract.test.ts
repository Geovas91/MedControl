import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as policy from "../../lib/paypal/billing-policy.ts";
import { createBillingHandlers } from "../../lib/paypal/billing-handlers.ts";

test("expired owner keeps checkout and only provider ACTIVE requests SQL activation for its clinic", async () => {
  const calls: { name: string; args: any }[] = [];
  const exports: any = {};
  let subscription = { status: "trialing", current_period_end: "2000-01-01", provider_subscription_id: null };
  const client = {
    rpc: async (name: string, args: any) => { calls.push({ name, args }); return { data: true, error: null }; },
    from: (table: string) => {
      const q = { select: () => q, eq: () => q,
        then: (done: any) => Promise.resolve({ data: table === "clinic_subscriptions" ? subscription : [], error: null }).then(done),
        maybeSingle: async () => ({ data: subscription, error: null }) };
      return q;
    }
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({
      state: "ready", user: { id: "synthetic-owner" },
      tenant: { clinic: { id: "synthetic-clinic" }, membership: { clinic_id: "synthetic-clinic", role: "owner", status: "active" } }
    }) },
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/config/plans": { isPlanId: () => true },
    "./billing-policy": policy,
    "./billing-handlers": { createBillingHandlers: (deps: unknown) => deps },
    "./server": { createPaypalSubscription: () => { throw Error("provider forbidden"); },
      getPaypalPlanId: () => "synthetic-plan", getPaypalSubscriptionDetails: () => { throw Error("provider forbidden"); } }
  };
  runInNewContext(ts.transpileModule(readFileSync("lib/paypal/billing-server.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require: (key: string) => { assert.ok(Object.hasOwn(mocks, key), key); return mocks[key]; } });
  assert.equal((await exports.getPaypalBillingCreationAvailability()).code, "ready");
  const actor = await exports.requireBillingOwner();
  const intent = { id: "synthetic-intent", plan_id: "basic", provider_plan_id: "synthetic-plan", provider_subscription_id: "synthetic-sub" };
  for (const status of ["APPROVED", "APPROVAL_PENDING", "ACTIVE"]) {
    await exports.billingHandlers.complete(actor, intent, { status });
    const call = calls.at(-1)!;
    assert.equal(call.name, "complete_paypal_billing_intent");
    assert.equal(call.args.p_clinic, "synthetic-clinic");
    assert.equal(call.args.p_user, "synthetic-owner");
    assert.equal(call.args.p_status, status === "ACTIVE" ? "active" : "inactive");
  }
  subscription = { ...subscription, status: "active" };
  assert.equal((await exports.getPaypalBillingCreationAvailability()).code, "billing_subscription_exists");
});

test("browser approval without server confirmation never completes the billing operation", async () => {
  let completions = 0;
  const handlers = createBillingHandlers({
    authorize: async () => ({ userId: "owner", clinicId: "clinic" }),
    find: async () => ({ id: "35000000-0000-4000-8000-000000000001", user_id: "owner", clinic_id: "clinic",
      plan_id: "basic", provider_plan_id: "P-SYNTHETIC", provider_subscription_id: "I-SYNTHETIC123",
      status: "pending", expires_at: new Date(Date.now() + 60000).toISOString() }),
    details: async () => { throw Error("simulated provider unavailable"); },
    complete: async () => { completions++; }
  } as any);
  const response = await handlers.approve(new Request("http://localhost/api/paypal/subscription/approve", {
    method: "POST", body: JSON.stringify({ intentId: "35000000-0000-4000-8000-000000000001",
      planId: "basic", subscriptionId: "I-SYNTHETIC123" })
  }));
  assert.equal(response.status, 503);
  assert.equal(completions, 0);
});
