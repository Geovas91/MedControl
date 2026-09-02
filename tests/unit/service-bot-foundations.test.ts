import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { planIncludesFeature } from "../../config/plans.ts";
import { DeterministicSupportAssistantProvider, classifySupportIntent } from "../../lib/support/assistant.ts";
import { validateSupportArticleMarkdown } from "../../lib/support/content.ts";
import { createStaticDiagnosticRegistry, executeRegisteredDiagnostic, safeDiagnosticResult } from "../../lib/support/diagnostics.ts";
import { buildSupportLogContext } from "../../lib/support/security.ts";
import { classifySupportSeverity, parseSupportTicketInput, supportRateLimitPolicies, toSupportTicketSafeProjection } from "../../lib/support/tickets.ts";
import { supportDiagnosticIds, type SafeDiagnosticResult, type SupportContext } from "../../lib/support/types.ts";

const migration = readFileSync("supabase/migrations/0034_service_bot_v1_foundations.sql", "utf8");
const serverDiagnostics = readFileSync("lib/server/support/diagnostics.ts", "utf8");
const ticketService = readFileSync("lib/server/support/tickets.ts", "utf8");
const supportContext: SupportContext = {
  userId: "10000000-0000-4000-8000-000000000001",
  clinicId: "20000000-0000-4000-8000-000000000001",
  role: "doctor",
  planId: "plus",
  effectiveSubscriptionStatus: "active",
  entitlements: { service_bot_tier1: true, google_calendar: true, whatsapp_notifications: false }
};

function articleSource(overrides: Partial<Record<string, string>> = {}, body = "# Ayuda\n\nAbre [Citas](/dashboard/appointments).") {
  const values = {
    slug: "ayuda-operativa", title: "Ayuda operativa", category: "citas", version: "1", status: "published",
    audience_roles: "[owner, admin, doctor, assistant]", required_features: "[]", clinical_content: "false", ...overrides
  };
  return `---\n${Object.entries(values).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n${body}`;
}

test("all canonical Spanish support articles pass the strict Markdown validator", () => {
  const names = readdirSync("content/support/es").filter((name) => name.endsWith(".md"));
  assert.equal(names.length, 5);
  for (const name of names) assert.equal(validateSupportArticleMarkdown(readFileSync(`content/support/es/${name}`, "utf8")).ok, true, name);
});

test("Markdown validator rejects raw HTML, remote images and unsafe URLs", () => {
  assert.deepEqual(validateSupportArticleMarkdown(articleSource({}, "<script>alert(1)</script>")), { ok: false, code: "raw_html_not_allowed" });
  assert.deepEqual(validateSupportArticleMarkdown(articleSource({}, "![remote](https://example.test/image.png)")), { ok: false, code: "unsafe_url" });
  assert.deepEqual(validateSupportArticleMarkdown(articleSource({}, "[bad](javascript:alert(1))")), { ok: false, code: "unsafe_url" });
  assert.deepEqual(validateSupportArticleMarkdown(articleSource({}, "[external](https://example.test/help)")), { ok: false, code: "unsafe_url" });
});

test("Markdown validator rejects clinical content and unknown frontmatter", () => {
  assert.deepEqual(validateSupportArticleMarkdown(articleSource({ clinical_content: "true" })), { ok: false, code: "clinical_content_not_allowed" });
  assert.deepEqual(validateSupportArticleMarkdown(articleSource({ extra: "value" })), { ok: false, code: "invalid_frontmatter_fields" });
});

test("diagnostic registry is a complete static allowlist and rejects arbitrary IDs", async () => {
  const handler = async (_context: SupportContext, verifiedAt: string): Promise<SafeDiagnosticResult> => ({ diagnosticId: "session_status", status: "healthy", code: "session_authenticated", verifiedAt, suggestedArticleSlugs: [] });
  const registry = createStaticDiagnosticRegistry(Object.fromEntries(supportDiagnosticIds.map((id) => [id, async (context: SupportContext, verifiedAt: string) => ({ ...(await handler(context, verifiedAt)), diagnosticId: id })])) as Parameters<typeof createStaticDiagnosticRegistry>[0]);
  assert.deepEqual(Object.keys(registry), [...supportDiagnosticIds]);
  assert.equal(await executeRegisteredDiagnostic(registry, "drop_table", supportContext), null);
  assert.equal((await executeRegisteredDiagnostic(registry, "session_status", supportContext))?.code, "session_authenticated");
});

test("safe diagnostic shape rejects raw provider errors and normalizes its timestamp", () => {
  assert.throws(() => safeDiagnosticResult({ diagnosticId: "session_status", status: "unavailable", code: "Provider error user@example.test", verifiedAt: new Date().toISOString(), suggestedArticleSlugs: [] }));
  const result = safeDiagnosticResult({ diagnosticId: "session_status", status: "healthy", code: "session_authenticated", verifiedAt: "2026-09-02T10:00:00Z", suggestedArticleSlugs: ["crear-una-cita", "../unsafe"] });
  assert.deepEqual(result.suggestedArticleSlugs, ["crear-una-cita"]);
  assert.equal(result.verifiedAt, "2026-09-02T10:00:00.000Z");
});

test("Calendar diagnostic uses the safe page projection and cannot return identities or secrets", () => {
  const section = serverDiagnostics.slice(serverDiagnostics.indexOf("google_calendar_status:"), serverDiagnostics.indexOf("appointment_automation_status:"));
  assert.match(section, /getGoogleCalendarIntegrationPageData/);
  assert.doesNotMatch(section, /token|email|user_id|provider_id|doctorName|patient/i);
});

test("Appointment Assistant diagnostic reduces live state to aggregate status only", () => {
  const section = serverDiagnostics.slice(serverDiagnostics.indexOf("appointment_automation_status:"), serverDiagnostics.indexOf("email_provider_readiness:"));
  assert.match(section, /scheduler\.label/);
  assert.doesNotMatch(section, /\.jobs|appointmentId|patient|recipient|message|token/i);
});

test("deterministic intent classification is allowlisted and stable", () => {
  assert.equal(classifySupportIntent("¿Cómo reprogramo una cita?").intent, "reschedule_appointment");
  assert.equal(classifySupportIntent("Google Calendar no sincroniza").intent, "google_calendar_problem");
  assert.equal(classifySupportIntent("una petición fuera del catálogo").intent, "unresolved");
});

test("clinical questions are rejected deterministically without diagnostics or escalation", async () => {
  const provider = new DeterministicSupportAssistantProvider();
  const answer = await provider.answer({ question: "¿Qué medicamento y dosis debo tomar?", articles: [], diagnostics: [] });
  assert.equal(answer.intent, "clinical_question");
  assert.equal(answer.status, "answered");
  assert.equal(answer.messageCode, "support_clinical_question");
  assert.equal(answer.diagnostics.length, 0);
  assert.equal(answer.offerTicket, false);
});

test("deterministic provider answers from supplied safe evidence and offers escalation", async () => {
  const provider = new DeterministicSupportAssistantProvider();
  const answer = await provider.answer({
    question: "No puedo crear una cita",
    articles: [{ slug: "crear-una-cita", title: "Crear una cita", summary: "Pasos", version: 1 }],
    diagnostics: [{ diagnosticId: "appointment_write_readiness", status: "degraded", code: "appointment_write_subscription_restricted", verifiedAt: new Date().toISOString(), suggestedArticleSlugs: ["crear-una-cita"] }]
  });
  assert.equal(answer.intent, "create_appointment");
  assert.equal(answer.offerTicket, true);
  assert.equal(answer.diagnostics.length, 1);
});

test("severity is calculated only from allowlisted category and impact", () => {
  assert.equal(classifySupportSeverity("how_to", "informational"), "low");
  assert.equal(classifySupportSeverity("configuration", "single_user_blocked"), "normal");
  assert.equal(classifySupportSeverity("authentication", "multiple_users_blocked"), "high");
  assert.equal(classifySupportSeverity("authentication", "access_blocked"), "high");
  assert.equal(parseSupportTicketInput({ category: "other", impact: "critical", subject: "Subject", summary: "Summary" }), null);
});

test("support logger context has no free-text fields and ticket service never logs ticket text", () => {
  assert.deepEqual(buildSupportLogContext({ operation: "ticket_create", status: "success", code: "ticket_created" }), { component: "support_bot", operation: "ticket_create", status: "success", code: "ticket_created" });
  assert.doesNotMatch(ticketService, /logger\.(?:info|warn|error)\([^\n]+(?:subject|summary|body|question|answer)/i);
  assert.doesNotMatch(migration.match(/insert into public\.audit_logs[\s\S]+?return true;/)?.[0] ?? "", /subject|summary|body|question|answer|email|phone|patient/i);
});

test("Service Bot Tier 1 entitlement is enabled for Basic, Plus and Pro", () => {
  for (const plan of ["basic", "plus", "pro"] as const) assert.equal(planIncludesFeature(plan, "service_bot_tier1"), true);
});

test("ticket projection excludes clinic and assignee identities", () => {
  const projection = toSupportTicketSafeProjection({
    id: "ticket", reference_code: "AAAABBBBCCCCDDDD", category: "other", severity: "normal", status: "open",
    subject: "Subject", summary: "Summary", diagnostic_codes: [], created_by: "user",
    last_activity_at: "2026-09-02T10:00:00Z", created_at: "2026-09-02T10:00:00Z", updated_at: "2026-09-02T10:00:00Z", resolved_at: null, closed_at: null
  });
  assert.equal("clinicId" in projection, false);
  assert.equal("assignedTo" in projection, false);
  assert.equal("assigned" in projection, false);
});

test("rate-limit policies are durable server-defined foundations", () => {
  assert.deepEqual(supportRateLimitPolicies.ticket_create, { limit: 3, windowSeconds: 3600 });
  assert.deepEqual(supportRateLimitPolicies.message_create, { limit: 20, windowSeconds: 3600 });
  assert.deepEqual(supportRateLimitPolicies.diagnostic, { limit: 10, windowSeconds: 60 });
  assert.match(migration, /create table public\.support_rate_limit_counters/);
  assert.match(migration, /on conflict \(clinic_id,user_id,operation,window_started_at\) do update/i);
  assert.doesNotMatch(ticketService, /new Map|setInterval|globalThis/);
});

test("migration keeps support isolated from clinical and Appointment Assistant tables", () => {
  const createdTables = Array.from(migration.matchAll(/create table public\.([a-z0-9_]+)/g), (match) => match[1]);
  assert.equal(createdTables.every((table) => table.startsWith("support_")), true);
  assert.doesNotMatch(migration, /references public\.(?:patients|appointments|medical_notes|consents|bot_settings|bot_logs|appointment_automation_jobs)/i);
});
