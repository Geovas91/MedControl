import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { appointmentOutboundPolicy } from '../../lib/outbound-policy.ts';

const isolated = { APP_ENV: 'staging', APP_BASE_URL: 'https://staging.clinicontrol.mx', APPOINTMENT_OUTBOUND_MODE: 'isolated' };
// Execute actual TS modules, substituting network/DB edges only. No credentials/network.
function harness(env: Record<string, string> = isolated, networkResponse?: () => Response, retainedImplementation = false) {
  let calls = 0;
  let database = 0;
  const cache = new Map<string, Record<string, any>>();
  const native = createRequire(import.meta.url);
  function load(file: string): Record<string, any> {
    if (cache.has(file)) return cache.get(file)!;
    const exports: Record<string, any> = {};
    cache.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, {
      exports, Buffer, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
      process: { env }, fetch: async () => { calls++; return networkResponse ? networkResponse() : Response.json({ id: 'event1', access_token: 'test' }); },
      require: (name: string) => {
        // Retained transport coverage only; default uses the real fixed MVP policy.
        if (name === '@/lib/release-boundary' && retainedImplementation) return { releaseAllows: () => true };
        if (name === 'server-only') return {};
        if (name === 'resend') return { Resend: class { emails = { send: async () => { calls++; return { data: { id: 'email1' } }; } }; } };
        if (name === '@/lib/supabase/admin') return { createAdminClient: () => { database++; throw new Error('unexpected database'); } };
        if (name === '@/lib/logger') return { logger: { info() {}, error() {}, warn() {} } };
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), path.extname(name) ? name : name + '.ts'));
        return native(name);
      }
    });
    return exports;
  }
  return { load, calls: () => calls, database: () => database };
}

test('outbound policy preserves production defaults and rejects incomplete, unknown or wrong-scope QA configuration', () => {
  assert.equal(appointmentOutboundPolicy({ APP_ENV: 'production' }), 'normal');
  assert.equal(appointmentOutboundPolicy({}), 'normal'); // legacy non-Staging default
  assert.equal(appointmentOutboundPolicy(isolated), 'isolated');
  for (const env of [
    { ...isolated, APPOINTMENT_OUTBOUND_MODE: 'false' }, { ...isolated, APPOINTMENT_OUTBOUND_MODE: '' },
    { APP_ENV: 'staging' }, { ...isolated, APP_ENV: 'production' },
    { ...isolated, APP_BASE_URL: 'https://staging.clinicontrol.mx/' },
    { ...isolated, APP_ENV: undefined }, { ...isolated, APP_ENV: 'unknown' }
  ]) assert.equal(appointmentOutboundPolicy(env), 'blocked');
  assert.equal(appointmentOutboundPolicy({ ...isolated, APPOINTMENT_OUTBOUND_MODE: 'normal' }), 'normal');
});

for (const mode of ['isolated', 'invalid']) {
  test(`Resend and every Google transport make zero provider requests in ${mode} mode`, async () => {
    const h = harness({ ...isolated, APPOINTMENT_OUTBOUND_MODE: mode });
    const email = await h.load('lib/email/resend-provider.ts').sendWithResend({ apiKey: 'mock', from: 'test@example.test' }, { to: 'test@example.test', subject: 'synthetic', html: '', text: '' });
    assert.equal(email.ok, false);
    const google = h.load('lib/server/google-calendar-provider.ts');
    const input = { accessToken: 'mock', refreshToken: 'mock', code: 'mock', clientId: 'mock', clientSecret: 'mock', redirectUri: 'https://example.test', eventId: 'event1', payload: {} };
    for (const method of ['exchangeGoogleCalendarAuthorizationCode', 'refreshGoogleCalendarAccessToken', 'createGoogleCalendarEvent', 'updateGoogleCalendarEvent', 'deleteGoogleCalendarEvent']) {
      assert.equal((await google[method](input)).ok, false);
    }
    assert.equal(await google.revokeGoogleCalendarToken('mock'), false);
    const WhatsApp = h.load('lib/server/whatsapp/meta-whatsapp-cloud-provider.ts').MetaWhatsAppCloudProvider;
    assert.equal((await new WhatsApp().sendTemplateMessage({})).state, 'rejected');
    assert.equal(h.calls(), 0);
  });
}

test('Cron runner cannot claim jobs, invoke providers or bypass isolation, even with active settings/credentials', async () => {
  const h = harness({ ...isolated, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'mock', WHATSAPP_OUTBOUND_ENABLED: 'true' });
  const result = await h.load('lib/server/appointment-automation-runner.ts').runAppointmentAutomations();
  assert.equal(result.claimed, 0);
  assert.equal(h.calls(), 0);
  assert.equal(h.database(), 0);
  const invalid = harness({ ...isolated, APPOINTMENT_OUTBOUND_MODE: 'typo' });
  await assert.rejects(invalid.load('lib/server/appointment-automation-runner.ts').runAppointmentAutomations(), /outbound_configuration_blocked/);
  assert.equal(invalid.calls(), 0);
  assert.equal(invalid.database(), 0);
});

test('email readiness distinguishes intentional isolation from malformed configuration without exposing credentials', () => {
  assert.equal(harness({ ...isolated, EMAIL_REQUIRED: 'true', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'mock' }).load('lib/email/config.ts').getInvitationEmailConfiguration().state, 'disabled');
  assert.equal(harness({ ...isolated, APPOINTMENT_OUTBOUND_MODE: 'typo' }).load('lib/email/config.ts').getInvitationEmailConfiguration().state, 'required_unavailable');
});

test('MVP preserves essential production email while excluding Google transport', async () => {
  const h = harness({ APP_ENV: 'production' });
  assert.equal((await h.load('lib/email/resend-provider.ts').sendWithResend({ apiKey: 'mock', from: 'test@example.test' }, { to: 'test@example.test', subject: '', html: '', text: '' })).ok, true);
  assert.equal((await h.load('lib/server/google-calendar-provider.ts').deleteGoogleCalendarEvent({ accessToken: 'mock', eventId: 'event1' })).ok, false);
  assert.equal(h.calls(), 1);
});

test('retained OpenAI transport under a test-only future-release fixture uses a synthetic HTTP double', async () => {
  const draft = { intent: 'search_appointments', patientQuery: null, professionalQuery: null, appointmentQuery: null, date: 'mañana', time: null, duration: null, dateRange: null, status: null };
  const h = harness({ ...isolated, OPENAI_API_KEY: 'synthetic', APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED: 'true' }, () => Response.json({ status: 'completed', model: 'synthetic', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] }), true);
  const result = await h.load('lib/assistant/llm/provider.ts').openAiPlannerProvider({ message: 'Citas mañana', today: '2030-01-01', activeIntent: null, resolvedSlots: [], missingSlots: [], role: 'owner', isProfessional: false, timeZone: 'America/Mexico_City' });
  assert.equal(result.intent, 'search_appointments');
  assert.equal(h.calls(), 1);
});
