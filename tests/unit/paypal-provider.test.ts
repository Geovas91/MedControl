import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the real server adapter with isolated environment and fetch; no provider calls.
function provider() {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const responses: Response[] = [];
  const exports: Record<string, (...args: any[]) => Promise<any>> = {};
  const source = ts.transpileModule(readFileSync("lib/paypal/server.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(source, {
    exports, Buffer, AbortSignal,
    process: { env: { PAYPAL_CLIENT_ID: "mock-client", PAYPAL_CLIENT_SECRET: "mock-secret", PAYPAL_WEBHOOK_ID: "mock-webhook", PAYPAL_ENV: "sandbox" } },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@/config/plans") return { paypalPlanEnvKeysByPlan: {} };
      throw new Error(`Unexpected adapter import: ${name}`);
    },
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      const response = responses.shift();
      assert.ok(response, "every network request must be mocked");
      return response;
    }
  });
  return { api: exports, requests, responses };
}
const headers = { authAlgo: "SHA256withRSA", certUrl: "https://untrusted.example/certificate", transmissionId: "transmission", transmissionSig: "signature", transmissionTime: "2026-09-09T00:00:00Z" };

test("signature verification still sends required headers and original event to fixed PayPal endpoint", async () => {
  const { api, requests, responses } = provider();
  responses.push(Response.json({ access_token: "mock-token" }), Response.json({ verification_status: "SUCCESS" }));
  const event = { id: "WH-1", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-TEST123" } };
  assert.equal(await api.verifyPaypalWebhookSignature(headers, event), true);
  assert.deepEqual(requests.map(r => r.url), ["https://api-m.sandbox.paypal.com/v1/oauth2/token", "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature"]);
  assert.deepEqual(JSON.parse(String(requests[1].init.body)), { auth_algo: headers.authAlgo, cert_url: headers.certUrl, transmission_id: headers.transmissionId, transmission_sig: headers.transmissionSig, transmission_time: headers.transmissionTime, webhook_id: "mock-webhook", webhook_event: event });
  assert.ok(requests.every(r => r.init.signal));
});
test("missing signature header makes no request", async () => {
  const { api, requests } = provider();
  assert.equal(await api.verifyPaypalWebhookSignature({ ...headers, transmissionSig: null }, {}), false);
  assert.equal(requests.length, 0);
});
test("provider signature FAILURE is rejected", async () => {
  const { api, responses } = provider();
  responses.push(Response.json({ access_token: "mock-token" }), Response.json({ verification_status: "FAILURE" }));
  assert.equal(await api.verifyPaypalWebhookSignature(headers, {}), false);
});
test("signature verification API outage is retryable instead of invalid signature", async () => {
  const { api, responses } = provider();
  responses.push(Response.json({ access_token: "mock-token" }), new Response("RAW_SECRET", { status: 500 }));
  await assert.rejects(api.verifyPaypalWebhookSignature(headers, {}), /paypal_verification_unavailable/);
});
test("server creation carries plan and intent binding with idempotency key, then reads authoritative details", async () => {
  const { api, requests, responses } = provider();
  const intent = { id: "35000000-0000-4000-8000-000000000001", provider_plan_id: "P-BASIC" };
  responses.push(Response.json({ access_token: "mock-token" }), Response.json({ id: "I-TEST123" }), Response.json({ access_token: "mock-token" }), Response.json({ id: "I-TEST123", custom_id: intent.id, plan_id: intent.provider_plan_id }));
  const result = await api.createPaypalSubscription(intent);
  assert.equal(result.custom_id, intent.id);
  assert.deepEqual(JSON.parse(String(requests[1].init.body)), { plan_id: "P-BASIC", custom_id: intent.id });
  assert.equal((requests[1].init.headers as Record<string, string>)["PayPal-Request-Id"], intent.id);
  assert.equal(requests[3].url, "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-TEST123");
});
test("provider creation error body never escapes", async () => {
  const { api, responses } = provider();
  responses.push(Response.json({ access_token: "mock-token" }), new Response("RAW_PAYER_EMAIL_SECRET", { status: 500 }));
  await assert.rejects(api.createPaypalSubscription({ id: "intent", provider_plan_id: "P-BASIC" }), /paypal_creation_failed/);
});
