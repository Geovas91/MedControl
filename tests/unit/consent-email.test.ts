import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCreateConsent } from "../../lib/clinical-record/permissions.ts";
import { getConsentEmailAvailability } from "../../lib/consents/email.ts";
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

test("delivery stays tenant-scoped, server-resolves recipient and preserves current permissions", () => {
  const service = readFileSync(new URL("../../lib/server/consent-email.ts", import.meta.url), "utf8");
  assert.match(service, /getActiveTenantContext\(\)/);
  assert.match(service, /canCreateConsent\(context\.tenant\.membership\.role\)/);
  assert.match(service, /getClinicEntitlements\(context\.tenant\.clinic\.id\)/);
  assert.match(service, /from\("patients"\)[\s\S]*?\.eq\("id", input\.patientId\)\.eq\("clinic_id", clinicId\)/);
  assert.match(service, /from\("consents"\)[\s\S]*?\.eq\("id", input\.consentId\)\.eq\("patient_id", input\.patientId\)\.eq\("clinic_id", clinicId\)/);
  assert.match(service, /patientEmail: patient\.email/);
  assert.equal(canCreateConsent("assistant"), false);
});

test("client cannot select recipient and server verifies the URL token hash", () => {
  const actions = readFileSync(new URL("../../app/dashboard/patients/[id]/consents/[consentId]/actions.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../../lib/server/consent-email.ts", import.meta.url), "utf8");
  const sendAction = actions.slice(actions.indexOf("export async function sendConsentEmailAction"), actions.indexOf("export async function generateConsentDocumentAction"));
  assert.match(sendAction, /formData\.get\("signing_url"\)/);
  assert.doesNotMatch(sendAction, /formData\.get\("recipient"\)|formData\.get\("email"\)|formData\.get\("token"\)/);
  assert.match(service, /extractConsentSigningToken\(input\.signingUrl, canonicalBaseUrl\)/);
  assert.match(service, /candidateHash = token \? hashSigningToken\(token\) : ""/);
  assert.match(service, /timingSafeEqual\(Buffer\.from\(candidateHash\), Buffer\.from\(consent\.signing_token_hash\)\)/);
});

test("email uses the same session URL as copy and QR without issuing or revoking a link", () => {
  const controls = readFileSync(new URL("../../components/clinical-record/consent-signing-link-controls.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../../lib/server/consent-email.ts", import.meta.url), "utf8");
  assert.match(controls, /createConsentSigningQr\(qrAvailability\.signingUrl\)/);
  assert.match(controls, /navigator\.clipboard\.writeText\(state\.url!\)/);
  assert.match(controls, /name="signing_url" value=\{state\.url \?\? ""\}/);
  assert.doesNotMatch(service, /issue_consent_signing_link|revoke_consent_signing_link|\.update\(/);
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
