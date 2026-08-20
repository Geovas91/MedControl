import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCreateConsent } from "../../lib/clinical-record/permissions.ts";
import { loadConsentEmailData, runConsentEmailDelivery, type ConsentEmailDeliveryDependencies } from "../../lib/consents/email-delivery.ts";
import { getConsentEmailActionOutcome, getConsentEmailAvailability, getConsentEmailDialogView } from "../../lib/consents/email.ts";
import { hashSigningToken } from "../../lib/consents/signing-token.ts";
import { extractConsentSigningToken } from "../../lib/consents/signing-url.ts";
import { buildConsentSigningEmail } from "../../lib/email/templates/consent-signing.ts";

const token = "0123456789abcdef-0123456789abcdef_012345678";
const signingUrl = `https://staging.clinicontrol.mx/consent/sign/${token}`;
const active = {
  status: "pending" as const,
  patientEmail: "paciente@example.com",
  signingUrl,
  signingTokenExpiresAt: "2030-01-02T12:00:00.000Z",
  signingTokenUsedAt: null,
  signingTokenRevokedAt: null,
  now: new Date("2030-01-01T12:00:00.000Z")
};

function createDeliveryHarness(overrides: Partial<ConsentEmailDeliveryDependencies> = {}) {
  const logs: Array<{ level: string; code: string; supabaseErrorCode?: string }> = [];
  const audits: Array<{ action: string; errorCode?: string }> = [];
  const messages: Array<Record<string, unknown>> = [];
  const context = {
    state: "ready" as const,
    clinicId: "10000000-0000-4000-8000-000000000001",
    actorId: "20000000-0000-4000-8000-000000000001",
    clinicName: "Clínica Centro",
    timeZone: "America/Mexico_City"
  };
  const dependencies: ConsentEmailDeliveryDependencies = {
    resolveContext: async () => context,
    loadData: async () => ({
      state: "ready",
      data: {
        patientEmail: "paciente@example.com",
        consent: {
          id: "30000000-0000-4000-8000-000000000001",
          status: "pending",
          consentType: "Procedimiento informado",
          signingTokenHash: hashSigningToken(token),
          signingTokenExpiresAt: "2030-01-02T12:00:00.000Z",
          signingTokenUsedAt: null,
          signingTokenRevokedAt: null
        }
      }
    }),
    getCanonicalBaseUrl: () => "https://staging.clinicontrol.mx",
    providerReady: () => true,
    send: async (message) => { messages.push(message); return { ok: true }; },
    audit: async (_context, action, errorCode) => { audits.push({ action, errorCode }); },
    log: (level, code, safeContext) => { logs.push({ level, code, supabaseErrorCode: safeContext?.supabaseErrorCode }); },
    ...overrides
  };
  return { dependencies, logs, audits, messages };
}

test("pending consent with a current URL and patient email allows delivery", () => {
  assert.deepEqual(getConsentEmailAvailability(active), { available: true, recipient: "paciente@example.com", signingUrl });
});

test("missing patient email blocks delivery with the explicit reason", () => {
  assert.deepEqual(getConsentEmailAvailability({ ...active, patientEmail: null }), { available: false, reason: "missing_email" });
});

test("signed, cancelled, revoked, used and expired links block delivery", () => {
  assert.deepEqual(getConsentEmailAvailability({ ...active, status: "signed" }), { available: false, reason: "signed" });
  assert.deepEqual(getConsentEmailAvailability({ ...active, status: "cancelled" }), { available: false, reason: "cancelled" });
  assert.deepEqual(getConsentEmailAvailability({ ...active, signingTokenRevokedAt: "2029-12-31T00:00:00Z" }), { available: false, reason: "revoked" });
  assert.deepEqual(getConsentEmailAvailability({ ...active, signingTokenUsedAt: "2029-12-31T00:00:00Z" }), { available: false, reason: "used" });
  assert.deepEqual(getConsentEmailAvailability({ ...active, signingTokenExpiresAt: "2029-12-31T00:00:00Z" }), { available: false, reason: "expired" });
});

test("email requires the URL emitted in the current session", () => {
  assert.deepEqual(getConsentEmailAvailability({ ...active, signingUrl: undefined }), { available: false, reason: "missing_url" });
});

test("dialog behavior covers idle, confirmation, sending, visible error and sent", () => {
  assert.deepEqual(getConsentEmailDialogView({ open: false, pending: false, emailState: {} }), {
    phase: "idle", error: undefined, submitDisabled: false, submitLabel: "Confirmar envío", shouldClose: false
  });
  assert.equal(getConsentEmailDialogView({ open: true, pending: false, emailState: {} }).phase, "confirming");
  assert.deepEqual(getConsentEmailDialogView({ open: true, pending: true, emailState: {} }), {
    phase: "sending", error: undefined, submitDisabled: true, submitLabel: "Enviando…", shouldClose: false
  });
  assert.deepEqual(getConsentEmailDialogView({ open: true, pending: false, emailState: { error: "Fallo seguro" } }), {
    phase: "error", error: "Fallo seguro", submitDisabled: false, submitLabel: "Confirmar envío", shouldClose: false
  });
  assert.equal(getConsentEmailDialogView({ open: true, pending: false, emailState: { sentTo: "paciente@example.com" } }).shouldClose, true);
});

test("server action outcome maps every delivery state to a safe UX", () => {
  assert.deepEqual(getConsentEmailActionOutcome({ state: "missing_recipient" }), { kind: "state", state: { error: "Este paciente no tiene correo electrónico registrado." } });
  assert.deepEqual(getConsentEmailActionOutcome({ state: "invalid_link" }), { kind: "state", state: { error: "El enlace de firma ya no es válido. Genera un enlace nuevo e intenta nuevamente." } });
  assert.deepEqual(getConsentEmailActionOutcome({ state: "invalid_state" }), { kind: "state", state: { error: "Este consentimiento ya no puede enviarse por correo." } });
  assert.deepEqual(getConsentEmailActionOutcome({ state: "forbidden" }), { kind: "state", state: { error: "No tienes permisos para enviar este consentimiento." } });
  for (const state of ["provider_unavailable", "query_failed", "delivery_failed"] as const) {
    assert.deepEqual(getConsentEmailActionOutcome({ state }), { kind: "state", state: { error: "No pudimos enviar el consentimiento. Intenta nuevamente." } });
  }
  assert.deepEqual(getConsentEmailActionOutcome({ state: "sent", recipient: "paciente@example.com" }), { kind: "state", state: { sentTo: "paciente@example.com" } });
  assert.deepEqual(getConsentEmailActionOutcome({ state: "unauthenticated" }), { kind: "redirect_login" });
  assert.deepEqual(getConsentEmailActionOutcome({ state: "not_found" }), { kind: "not_found" });
});

test("authenticated data loading identifies the failed query and preserves the safe Supabase code", async () => {
  let tokenQueryCalls = 0;
  const patientFailure = await loadConsentEmailData({
    patient: async () => ({ data: null, errorCode: "42501" }),
    consent: async () => ({ data: null }),
    consentTokenHash: async () => { tokenQueryCalls += 1; return { data: null }; }
  });
  assert.deepEqual(patientFailure, { state: "query_failed", query: "patient", supabaseErrorCode: "42501" });
  assert.equal(tokenQueryCalls, 0);

  const consentFailure = await loadConsentEmailData({
    patient: async () => ({ data: { email: "paciente@example.com" } }),
    consent: async () => ({ data: null, errorCode: "PGRST204" }),
    consentTokenHash: async () => { tokenQueryCalls += 1; return { data: null }; }
  });
  assert.deepEqual(consentFailure, { state: "query_failed", query: "consent", supabaseErrorCode: "PGRST204" });
  assert.equal(tokenQueryCalls, 0);
});

test("authenticated patient and consent reads complete before the scoped token lookup", async () => {
  const calls: string[] = [];
  const loaded = await loadConsentEmailData({
    patient: async () => { calls.push("patient"); return { data: { email: "paciente@example.com" } }; },
    consent: async () => { calls.push("consent"); return { data: { id: "30000000-0000-4000-8000-000000000001", status: "pending", consentType: "Procedimiento", signingTokenExpiresAt: "2030-01-02T12:00:00.000Z", signingTokenUsedAt: null, signingTokenRevokedAt: null } }; },
    consentTokenHash: async () => { calls.push("consent_token"); return { data: { signingTokenHash: hashSigningToken(token) } }; }
  });
  assert.equal(loaded.state, "ready");
  assert.deepEqual(calls.slice(0, 2).sort(), ["consent", "patient"]);
  assert.equal(calls.at(-1), "consent_token");
});

test("backend distinguishes query, link, state, recipient, provider and Resend failures", async () => {
  const cases: Array<{
    expected: string;
    auditCode: string;
    overrides: Partial<ConsentEmailDeliveryDependencies>;
    url?: string;
  }> = [
    { expected: "query_failed", auditCode: "patient_query_failed", overrides: { loadData: async () => ({ state: "query_failed", query: "patient", supabaseErrorCode: "42501" }) } },
    { expected: "query_failed", auditCode: "consent_query_failed", overrides: { loadData: async () => ({ state: "query_failed", query: "consent", supabaseErrorCode: "PGRST204" }) } },
    { expected: "query_failed", auditCode: "consent_token_query_failed", overrides: { loadData: async () => ({ state: "query_failed", query: "consent_token", supabaseErrorCode: "42501" }) } },
    { expected: "invalid_link", auditCode: "invalid_link", overrides: {}, url: `https://evil.example/consent/sign/${token}` },
    { expected: "invalid_state", auditCode: "invalid_state", overrides: { loadData: async () => ({ state: "ready", data: { patientEmail: "paciente@example.com", consent: { id: "30000000-0000-4000-8000-000000000001", status: "signed", consentType: "Procedimiento", signingTokenHash: hashSigningToken(token), signingTokenExpiresAt: "2030-01-02T12:00:00.000Z", signingTokenUsedAt: null, signingTokenRevokedAt: null } } }) } },
    { expected: "missing_recipient", auditCode: "missing_recipient", overrides: { loadData: async () => ({ state: "ready", data: { patientEmail: null, consent: { id: "30000000-0000-4000-8000-000000000001", status: "pending", consentType: "Procedimiento", signingTokenHash: hashSigningToken(token), signingTokenExpiresAt: "2030-01-02T12:00:00.000Z", signingTokenUsedAt: null, signingTokenRevokedAt: null } } }) } },
    { expected: "provider_unavailable", auditCode: "provider_unavailable", overrides: { providerReady: () => false } },
    { expected: "delivery_failed", auditCode: "resend_delivery_failed", overrides: { send: async () => ({ ok: false }) } }
  ];

  for (const scenario of cases) {
    const harness = createDeliveryHarness(scenario.overrides);
    const result = await runConsentEmailDelivery({ signingUrl: scenario.url ?? signingUrl }, harness.dependencies);
    assert.equal(result.state, scenario.expected);
    assert.equal(harness.audits.at(-1)?.errorCode, scenario.auditCode);
    assert.equal(harness.logs.at(-1)?.code, scenario.auditCode);
    if (scenario.expected === "query_failed") assert.ok(harness.logs.at(-1)?.supabaseErrorCode);
  }
});

test("backend success sends once and audit/log payloads contain no secret material", async () => {
  const harness = createDeliveryHarness();
  const result = await runConsentEmailDelivery({ signingUrl }, harness.dependencies);
  assert.deepEqual(result, { state: "sent", recipient: "paciente@example.com" });
  assert.equal(harness.messages.length, 1);
  assert.deepEqual(harness.audits, [{ action: "consent_email_sent", errorCode: undefined }]);

  const invalid = createDeliveryHarness();
  await runConsentEmailDelivery({ signingUrl: `${signingUrl}?signing_url=${token}&email=paciente@example.com` }, invalid.dependencies);
  const telemetry = JSON.stringify({ logs: invalid.logs, audits: invalid.audits });
  assert.doesNotMatch(telemetry, new RegExp(token));
  assert.doesNotMatch(telemetry, /signing_url|paciente@example\.com|RESEND_API_KEY|consent_text/i);
});

test("only an exact canonical consent signing URL yields a token", () => {
  assert.equal(extractConsentSigningToken(signingUrl, "https://staging.clinicontrol.mx"), token);
  assert.equal(extractConsentSigningToken(`https://evil.example/consent/sign/${token}`, "https://staging.clinicontrol.mx"), null);
  assert.equal(extractConsentSigningToken(`${signingUrl}?recipient=otro@example.com`, "https://staging.clinicontrol.mx"), null);
  assert.equal(extractConsentSigningToken(`${signingUrl}#fragment`, "https://staging.clinicontrol.mx"), null);
  assert.equal(extractConsentSigningToken(`https://staging.clinicontrol.mx/dashboard/${token}`, "https://staging.clinicontrol.mx"), null);
});

test("Spanish email contains only the required summary and button URL", () => {
  const template = buildConsentSigningEmail({
    clinicName: "Clínica Centro",
    consentType: "Procedimiento informado",
    expiresAt: "2030-01-02T12:00:00.000Z",
    timeZone: "America/Mexico_City",
    signingUrl
  });
  assert.equal(template.subject, "Consentimiento pendiente de firma — Clínica Centro");
  assert.match(template.html, /Revisar y firmar consentimiento/);
  assert.match(template.html, new RegExp(`href="${signingUrl}"`));
  assert.match(template.html, /Este enlace es personal\. No lo reenvíes\./);
  assert.doesNotMatch(template.text, new RegExp(token));
  assert.doesNotMatch(`${template.html}${template.text}`, /diagnóstico|nota clínica|consent_text|firma gráfica|PDF/i);
});

test("production adapter stays tenant-scoped and preserves current permissions", () => {
  const service = readFileSync(new URL("../../lib/server/consent-email.ts", import.meta.url), "utf8");
  assert.match(service, /getActiveTenantContext\(\)/);
  assert.match(service, /canCreateConsent\(context\.tenant\.membership\.role\)/);
  assert.match(service, /getClinicEntitlements\(context\.tenant\.clinic\.id\)/);
  assert.match(service, /from\("patients"\)[\s\S]*?\.eq\("id", input\.patientId\)\.eq\("clinic_id", context\.clinicId\)/);
  assert.match(service, /from\("consents"\)[\s\S]*?\.eq\("id", input\.consentId\)\.eq\("patient_id", input\.patientId\)\.eq\("clinic_id", context\.clinicId\)/);
  const authenticatedConsentSelect = service.match(/from\("consents"\)\.select\("([^"]+)"\)/)?.[1] ?? "";
  assert.doesNotMatch(authenticatedConsentSelect, /signing_token_hash/);
  assert.match(service, /createAdminClient\(\)\.from\("consents"\)\.select\("signing_token_hash"\)\.eq\("id", input\.consentId\)\.eq\("patient_id", input\.patientId\)\.eq\("clinic_id", context\.clinicId\)/);
  assert.match(service, /return \{ data: patient \? \{ email: patient\.email \} : null \}/);
  assert.equal(canCreateConsent("assistant"), false);
});

test("client cannot select recipient", () => {
  const actions = readFileSync(new URL("../../app/dashboard/patients/[id]/consents/[consentId]/actions.ts", import.meta.url), "utf8");
  const sendAction = actions.slice(actions.indexOf("export async function sendConsentEmailAction"), actions.indexOf("export async function generateConsentDocumentAction"));
  assert.match(sendAction, /formData\.get\("signing_url"\)/);
  assert.doesNotMatch(sendAction, /formData\.get\("recipient"\)|formData\.get\("email"\)|formData\.get\("token"\)/);
});

test("backend rejects a canonical URL when its token hash is not the active hash", async () => {
  const differentToken = "abcdefghij0123456789-abcdefghij0123456789_abc";
  const harness = createDeliveryHarness({
    loadData: async () => ({
      state: "ready",
      data: {
        patientEmail: "paciente@example.com",
        consent: {
          id: "30000000-0000-4000-8000-000000000001",
          status: "pending",
          consentType: "Procedimiento",
          signingTokenHash: hashSigningToken(differentToken),
          signingTokenExpiresAt: "2030-01-02T12:00:00.000Z",
          signingTokenUsedAt: null,
          signingTokenRevokedAt: null
        }
      }
    })
  });
  const result = await runConsentEmailDelivery({ signingUrl }, harness.dependencies);
  assert.deepEqual(result, { state: "invalid_link" });
  assert.equal(harness.messages.length, 0);
});

test("email uses the same session URL as copy and QR without issuing or revoking a link", () => {
  const controls = readFileSync(new URL("../../components/clinical-record/consent-signing-link-controls.tsx", import.meta.url), "utf8");
  const delivery = readFileSync(new URL("../../lib/consents/email-delivery.ts", import.meta.url), "utf8");
  assert.match(controls, /createConsentSigningQr\(qrAvailability\.signingUrl\)/);
  assert.match(controls, /navigator\.clipboard\.writeText\(state\.url!\)/);
  assert.match(controls, /name="signing_url" value=\{state\.url \?\? ""\}/);
  assert.doesNotMatch(delivery, /issue_consent_signing_link|revoke_consent_signing_link|\.update\(/);
});

test("provider failures are audited safely and do not invalidate the consent link", () => {
  const service = readFileSync(new URL("../../lib/server/consent-email.ts", import.meta.url), "utf8");
  const audit = service.slice(service.indexOf("async function recordAudit"), service.indexOf("export async function deliverConsentSigningEmail"));
  assert.match(audit, /consent_email_sent/);
  assert.match(audit, /consent_email_failed/);
  assert.match(audit, /provider: "resend"/);
  assert.doesNotMatch(audit, /signingUrl|signing_token|tokenHash|recipient|html|consentText/);
  assert.doesNotMatch(service, /revokeConsent|cancelConsent|issueConsent/);
});
