import assert from 'node:assert/strict';
import test from 'node:test';
import { liveReadPlan } from '../../scripts/qa/assistant-live-gates.ts';
import { runOpenAiSmoke } from '../../scripts/qa/assistant-openai-smoke.ts';

test('live browser gate is closed by default and cannot opt into unsupported mutations', () => {
  assert.equal(liveReadPlan({}).reason, 'opt_in_required');
  assert.equal(liveReadPlan({ ASSISTANT_QA_STAGING_LIVE: '1', ASSISTANT_QA_LIVE_MODE: 'mutate' }).status, 'BLOCKED');
  assert.equal(liveReadPlan({ ASSISTANT_QA_STAGING_LIVE: '1', ASSISTANT_QA_LIVE_MODE: 'read_only' }).reason, 'dedicated_qa_account_required');
});
test('live read gate accepts only a matching QA identity, password and expected clinic', () => {
  const env = { ASSISTANT_QA_STAGING_LIVE: '1', ASSISTANT_QA_LIVE_MODE: 'read_only', ASSISTANT_QA_EMAIL: 'qa.owner.norte@clinicontrol.mx', ASSISTANT_QA_PASSWORD: 'synthetic-unit-only', ASSISTANT_QA_CLINIC: 'CliniControl QA Norte' };
  assert.equal(liveReadPlan(env).status, 'READY');
  assert.equal(liveReadPlan({ ...env, ASSISTANT_QA_CLINIC: 'CliniControl QA Sur' }).status, 'BLOCKED');
  assert.equal(liveReadPlan({ ...env, ASSISTANT_QA_PASSWORD: '' }).status, 'BLOCKED');
  assert.equal(liveReadPlan({ ...env, ASSISTANT_QA_EMAIL: 'unapproved@example.test' }).status, 'BLOCKED');
});
test('OpenAI smoke without explicit flag or key performs zero fetches', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  assert.equal((await runOpenAiSmoke({}, fetcher)).reason, 'opt_in_required');
  assert.equal((await runOpenAiSmoke({ ASSISTANT_QA_OPENAI_LIVE: '1' }, fetcher)).reason, 'api_key_required');
  assert.equal(calls, 0);
});
const env = { ASSISTANT_QA_OPENAI_LIVE: '1', OPENAI_API_KEY: 'unit-only-not-a-real-key', APPOINTMENT_ASSISTANT_LLM_MODEL: 'unit-model' };
const draft = { intent: 'search_appointments', patientQuery: null, professionalQuery: null, appointmentQuery: null, date: 'mañana', time: null, duration: null, dateRange: null, status: null };
function response(value: unknown) {
  return new Response(JSON.stringify({ status: 'completed', model: 'unit-model', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
}
test('OpenAI smoke requires actual validated provider success and emits only safe summary fields', async () => {
  let calls = 0;
  const result = await runOpenAiSmoke(env, async () => { calls++; return response(draft); });
  assert.deepEqual(result, { status: 'PASS', reason: 'provider_success', plannerInvoked: true, plannerSuccess: true, plannerFallback: false, providerFailure: false, requests: 1 });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes(env.OPENAI_API_KEY), false);
});
for (const kind of ['timeout', 'http_error', 'invalid_json', 'invalid_schema'] as const) test(`OpenAI smoke ${kind} is never reported as live success and is not retried`, async () => {
  let calls = 0;
  const result = await runOpenAiSmoke(env, async () => {
    calls++;
    if (kind === 'timeout') throw new DOMException('PRIVATE timeout detail', 'TimeoutError');
    if (kind === 'http_error') return new Response('PRIVATE provider response', { status: 503 });
    if (kind === 'invalid_json') return new Response('{PRIVATE invalid');
    return response({ inventedPatientId: 'PRIVATE_REFERENCE' });
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.plannerInvoked, true);
  assert.equal(result.plannerSuccess, false);
  assert.equal(result.plannerFallback, true);
  assert.equal(result.providerFailure, kind !== 'invalid_schema');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
