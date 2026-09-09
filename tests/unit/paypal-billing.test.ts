import test from "node:test";
import assert from "node:assert/strict";
import { authorizeBillingActor } from "../../lib/paypal/billing-policy.ts";
import type { BillingIntent } from "../../lib/paypal/billing-policy.ts";
import { createBillingHandlers } from "../../lib/paypal/billing-handlers.ts";
import { createPaypalWebhookHandler } from "../../lib/paypal/webhook-handler.ts";

const id = "35000000-0000-4000-8000-000000000001";
const actor = { userId: "owner", clinicId: "clinic-a" };
const owner = { userId: actor.userId, clinicId: actor.clinicId, membershipClinicId: actor.clinicId, membershipStatus: "active", role: "owner" };
const request = (body: unknown) => new Request("http://localhost/api/paypal", { method: "POST", body: JSON.stringify(body) });
const input = { intentId: id, subscriptionId: "I-SUBSCRIPTION1", planId: "basic", clinic_id: "untrusted-clinic" };
const pending = (): BillingIntent => ({ id, user_id: actor.userId, clinic_id: actor.clinicId, plan_id: "basic", provider_plan_id: "P-BASIC", provider_subscription_id: input.subscriptionId, status: "pending", expires_at: new Date(Date.now() + 60_000).toISOString() });

function billing() {
  const state = { intent: pending() as BillingIntent | null, writes: 0, reads: 0, providers: 0, role: owner, providerStatus: "ACTIVE", providerId: input.subscriptionId, providerPlan: "P-BASIC", custom: id, failedProvider: false };
  const handlers = createBillingHandlers({
    authorize: async () => authorizeBillingActor(state.role),
    plan: (plan) => plan === "basic" ? "P-BASIC" : null,
    begin: async (who, plan, providerPlan) => { assert.deepEqual(who, actor); assert.equal(plan, "basic"); assert.equal(providerPlan, "P-BASIC"); state.writes++; return { ...pending(), provider_subscription_id: null }; },
    create: async (intent) => ({ id: input.subscriptionId, plan_id: intent.provider_plan_id, custom_id: intent.id }),
    bind: async () => { state.writes++; },
    find: async () => { state.reads++; return state.intent; },
    details: async () => { state.providers++; if (state.failedProvider) throw new Error("SECRET_PROVIDER_EMAIL_TOKEN"); return { id: state.providerId, plan_id: state.providerPlan, custom_id: state.custom, status: state.providerStatus }; },
    complete: async (who, intent, details) => {
      assert.deepEqual(who, actor);
      if (intent.status === "completed") { assert.equal(details, null); return; }
      assert.equal(details?.custom_id, id);
      state.writes++; intent.status = "completed";
    }
  });
  return { state, handlers };
}

test("owner can initiate and approve; client clinic_id never supplies tenant", async () => {
  const { state, handlers } = billing();
  assert.equal((await handlers.initiate(request(input))).status, 200);
  assert.equal((await handlers.approve(request(input))).status, 200);
  assert.equal(state.writes, 3);
});
for (const role of ["admin", "doctor", "assistant"]) test(`${role} cannot initiate or approve and cannot reach service operations`, async () => {
  const { state, handlers } = billing(); state.role = { ...owner, role };
  assert.equal((await handlers.initiate(request(input))).status, 403);
  assert.equal((await handlers.approve(request(input))).status, 403);
  assert.equal(state.writes + state.reads + state.providers, 0);
});
for (const [name, patch, status] of [
  ["unauthenticated", { userId: "" }, 401],
  ["no membership", { membershipClinicId: "" }, 403],
  ["suspended membership", { membershipStatus: "suspended" }, 403],
  ["wrong clinic", { membershipClinicId: "clinic-b" }, 403],
  ["ambiguous active clinic", { multiple: true }, 403],
  ["unverified clinic selection", { selectedClinicId: "clinic-b" }, 403]
] as const) test(`${name} denied before privileged access`, async () => {
  const { state, handlers } = billing(); state.role = { ...owner, ...patch };
  assert.equal((await handlers.approve(request(input))).status, status);
  assert.equal(state.writes + state.reads + state.providers, 0);
});
test("explicit active clinic selected and verified by server is allowed", () => {
  assert.deepEqual(authorizeBillingActor({ ...owner, multiple: true, selectedClinicId: actor.clinicId }), actor);
});
for (const [name, patch] of [
  ["another user", { user_id: "other" }], ["another clinic", { clinic_id: "clinic-b" }],
  ["different plan", { plan_id: "pro" }], ["different subscription", { provider_subscription_id: "I-ANOTHER1" }],
  ["expired", { expires_at: new Date(0).toISOString() }], ["invalid expiry", { expires_at: "invalid" }]
] as const) test(`intent ${name} denied without provider access or writes`, async () => {
  const { state, handlers } = billing(); state.intent = { ...pending(), ...patch };
  assert.equal((await handlers.approve(request(input))).status, 403);
  assert.equal(state.writes + state.providers, 0);
});
test("orphan approval rejected", async () => {
  const { state, handlers } = billing(); state.intent = null;
  assert.equal((await handlers.approve(request(input))).status, 403);
  assert.equal(state.writes, 0);
});
for (const patch of [{ providerStatus: "APPROVAL_PENDING" }, { providerPlan: "P-OTHER" }, { custom: "unbound" }, { providerId: "I-OTHER123" }]) test(`provider mismatch ${JSON.stringify(patch)} never writes`, async () => {
  const { state, handlers } = billing(); Object.assign(state, patch);
  assert.equal((await handlers.approve(request(input))).status, 409);
  assert.equal(state.writes, 0);
});
test("legitimate duplicate is a no-op, including after expiry", async () => {
  const { state, handlers } = billing();
  assert.equal((await handlers.approve(request(input))).status, 200);
  state.intent!.expires_at = new Date(0).toISOString();
  assert.equal((await handlers.approve(request(input))).status, 200);
  assert.equal(state.providers, 1); assert.equal(state.writes, 1);
});
test("provider errors sanitized and no approval writes", async () => {
  const { state, handlers } = billing(); state.failedProvider = true;
  const response = await handlers.approve(request(input));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /SECRET_PROVIDER/); assert.equal(state.writes, 0);
});

function webhook() {
  const state = { status: "received", token: 0, lease: 0, now: 1000, attempts: 0, mutations: 0, valid: true, providerFails: false, databaseFails: false, failureMarkerFails: false, missingSubscription: false, providerState: "ACTIVE", appliedStatus: "", claims: 0, providerCalls: 0 };
  const handler = createPaypalWebhookHandler({
    verify: async () => state.valid,
    claim: async () => {
      state.claims++;
      if (state.status === "processed") return { state: "processed" };
      if (state.status === "processing" && state.lease > state.now) return { state: "busy" };
      state.status = "processing"; state.lease = state.now + 120; state.attempts++;
      return { state: "claimed", token: String(++state.token) };
    },
    details: async () => { state.providerCalls++; if (state.providerFails) throw new Error("RAW_PROVIDER_SECRET_EMAIL"); return { id: input.subscriptionId, plan_id: "P-BASIC", status: state.providerState }; },
    finish: async (_id, token, status) => {
      assert.equal(token, String(state.token));
      if (state.databaseFails) throw new Error("RAW_DATABASE_SECRET");
      if (state.missingSubscription) { state.status = "failed"; return "failed"; }
      if (status) { state.mutations++; state.appliedStatus = status; }
      state.status = "processed"; return "processed";
    },
    fail: async () => { if (state.failureMarkerFails) throw new Error("RAW_DATABASE_SECRET"); state.status = "failed"; }
  });
  const deliver = (type = "BILLING.SUBSCRIPTION.ACTIVATED") => handler(request({ id: "WH-EVENT1", event_type: type, resource: { id: input.subscriptionId } }));
  return { state, deliver };
}
test("first delivery succeeds and duplicate never mutates again", async () => {
  const { state, deliver } = webhook();
  assert.equal((await deliver()).status, 200); assert.equal(state.status, "processed");
  assert.equal((await deliver()).status, 200); assert.equal(state.mutations, 1); assert.equal(state.providerCalls, 1);
});
for (const failure of ["providerFails", "databaseFails"] as const) test(`${failure}: failed event retries successfully, errors private`, async () => {
  const { state, deliver } = webhook(); state[failure] = true;
  const response = await deliver(); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /RAW_|SECRET|EMAIL/); assert.equal(state.status, "failed"); assert.equal(state.mutations, 0);
  state[failure] = false;
  assert.equal((await deliver()).status, 200); assert.equal(state.attempts, 2); assert.equal(state.mutations, 1);
});
test("concurrent deliveries only claim and mutate once", async () => {
  const { state, deliver } = webhook();
  const responses = await Promise.all([deliver(), deliver()]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 503]); assert.equal(state.mutations, 1);
});
test("stale lease recovers after failure marker database outage", async () => {
  const { state, deliver } = webhook(); state.databaseFails = true; state.failureMarkerFails = true;
  assert.equal((await deliver()).status, 503); assert.equal(state.status, "processing");
  assert.equal((await deliver()).status, 503); assert.equal(state.attempts, 1);
  state.now += 121; state.databaseFails = false;
  assert.equal((await deliver()).status, 200); assert.equal(state.attempts, 2);
});
test("invalid signature never stores a receipt", async () => {
  const { state, deliver } = webhook(); state.valid = false;
  assert.equal((await deliver()).status, 400); assert.equal(state.claims, 0);
});
test("unknown event is recorded as processed without provider access or mutation", async () => {
  const { state, deliver } = webhook();
  assert.equal((await deliver("UNKNOWN.EVENT")).status, 200); assert.equal(state.mutations + state.providerCalls, 0);
});
test("webhook before local approval is retryable", async () => {
  const { state, deliver } = webhook(); state.missingSubscription = true;
  assert.equal((await deliver()).status, 503); assert.equal(state.status, "failed");
  state.missingSubscription = false; assert.equal((await deliver()).status, 200); assert.equal(state.mutations, 1);
});
test("cancellation uses current provider state", async () => {
  const { state, deliver } = webhook(); state.providerState = "CANCELLED";
  assert.equal((await deliver("BILLING.SUBSCRIPTION.CANCELLED")).status, 200); assert.equal(state.mutations, 1);
  assert.equal(state.appliedStatus, "cancelled");
});
test("payment failure preserves past_due without reviving cancelled subscriptions", async () => {
  const first = webhook();
  assert.equal((await first.deliver("BILLING.SUBSCRIPTION.PAYMENT.FAILED")).status, 200);
  assert.equal(first.state.appliedStatus, "past_due");
  const cancelled = webhook(); cancelled.state.providerState = "CANCELLED";
  await cancelled.deliver("BILLING.SUBSCRIPTION.PAYMENT.FAILED");
  assert.equal(cancelled.state.appliedStatus, "cancelled");
});
