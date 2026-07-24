import assert from "node:assert/strict";
import { getInvitationEmailConfiguration } from "../lib/email/config.ts";
import { buildMemberInvitationEmail, escapeHtml, getInvitationRoleLabel } from "../lib/email/templates/member-invitation.ts";
import { classifyResendError } from "../lib/email/resend-errors.ts";

const saved = { ...process.env };
function setEnvironment(values: Record<string, string | undefined>) {
  for (const key of ["EMAIL_REQUIRED", "EMAIL_PROVIDER", "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO", "APP_BASE_URL", "APP_ENV", "NEXT_PUBLIC_APP_ENV"]) {
    if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
  }
}

setEnvironment({ EMAIL_REQUIRED: "false" });
assert.equal(getInvitationEmailConfiguration().state, "disabled");
setEnvironment({ EMAIL_REQUIRED: "true" });
assert.equal(getInvitationEmailConfiguration().state, "required_unavailable");
setEnvironment({ EMAIL_REQUIRED: "false", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test_key", EMAIL_FROM: "CliniControl <invitaciones@example.com>", APP_BASE_URL: "https://staging.example.com", APP_ENV: "staging" });
assert.equal(getInvitationEmailConfiguration().state, "ready");
setEnvironment({ EMAIL_REQUIRED: "false", EMAIL_PROVIDER: "smtp", RESEND_API_KEY: "test_key", EMAIL_FROM: "invitaciones@example.com", APP_BASE_URL: "https://staging.example.com", APP_ENV: "staging" });
assert.equal(getInvitationEmailConfiguration().state, "disabled");
setEnvironment({ EMAIL_REQUIRED: "false", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test_key", EMAIL_FROM: "not-an-email", APP_BASE_URL: "https://staging.example.com", APP_ENV: "staging" });
assert.equal(getInvitationEmailConfiguration().state, "disabled");
setEnvironment({ EMAIL_REQUIRED: "false", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test_key", EMAIL_FROM: "invitaciones@example.com", APP_BASE_URL: "http://staging.example.com", APP_ENV: "staging" });
assert.equal(getInvitationEmailConfiguration().state, "disabled");

assert.equal(escapeHtml(`<script>&"'`), "&lt;script&gt;&amp;&quot;&#39;");
assert.equal(getInvitationRoleLabel("doctor"), "Médico");
assert.equal(classifyResendError({ statusCode: 429 }), "rate_limited");
assert.equal(classifyResendError({ statusCode: 401 }), "misconfigured");
assert.equal(classifyResendError(Object.assign(new Error("timeout"), { name: "TimeoutError" })), "timeout");
const template = buildMemberInvitationEmail({ clinicName: "Clínica <Demo>", role: "assistant", expiresAt: "2030-01-01T18:00:00.000Z", invitationUrl: "https://staging.example.com/invite/abc123" });
assert.match(template.html, /Clínica &lt;Demo&gt;/);
assert.match(template.text, /Asistente/);
assert.equal(/patient|diagnosis|payment|token_hash|service_role/i.test(`${template.subject}\n${template.html}\n${template.text}`), false);

for (const key of Object.keys(process.env)) {
  if (!(key in saved)) delete process.env[key];
}
Object.assign(process.env, saved);
console.log("Invitation email pure checks passed.");
