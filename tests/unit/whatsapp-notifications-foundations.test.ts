import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planIncludesFeature } from "../../config/plans.ts";
import { getWhatsAppConsentDecision, isWhatsAppOptedOut } from "../../lib/whatsapp/consent.ts";
import { parseWhatsAppOutboundEnabled } from "../../lib/whatsapp/config.ts";
import { isCanonicalE164, normalizeE164 } from "../../lib/whatsapp/e164.ts";
import {
  getWhatsAppTemplateDefinition,
  validateWhatsAppTemplateVariables
} from "../../lib/whatsapp/template-registry.ts";

const migration = readFileSync("supabase/migrations/0033_whatsapp_notifications_v1_foundations.sql", "utf8");
const provider = readFileSync("lib/server/whatsapp/meta-whatsapp-cloud-provider.ts", "utf8");
const providerBoundary = readFileSync("lib/server/whatsapp/provider.ts", "utf8");
const providerTypes = readFileSync("lib/whatsapp/types.ts", "utf8");
const runner = readFileSync("lib/server/appointment-automation-runner.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const liveDomain = readFileSync("lib/appointment-automation-live-status.ts", "utf8");

test("E.164 normalization accepts an explicit country code and canonicalizes separators", () => {
  assert.equal(normalizeE164(" +52 (55) 1234-5678 "), "+525512345678");
  assert.equal(normalizeE164("+14155552671"), "+14155552671");
  assert.equal(isCanonicalE164("+525512345678"), true);
});

test("E.164 validation rejects ambiguous and malformed phone values", () => {
  assert.equal(normalizeE164("5512345678"), null);
  assert.equal(normalizeE164("00525512345678"), null);
  assert.equal(normalizeE164("+0123456789"), null);
  assert.equal(normalizeE164("+52 55 1234 5678 ext 2"), null);
  assert.equal(normalizeE164("+123"), null);
});

test("consent fails closed for missing and opted-out preferences", () => {
  assert.deepEqual(getWhatsAppConsentDecision(null, "+525512345678"), { eligible: false, code: "consent_not_set" });
  const optedOut = {
    whatsappStatus: "opted_out" as const,
    phoneE164: "+525512345678",
    optInAt: "2026-09-01T10:00:00.000Z",
    optOutAt: "2026-09-01T11:00:00.000Z",
    source: "patient_portal" as const,
    termsVersion: "v1"
  };
  assert.equal(isWhatsAppOptedOut(optedOut), true);
  assert.deepEqual(getWhatsAppConsentDecision(optedOut, "+525512345678"), { eligible: false, code: "consent_opted_out" });
});

test("current explicit opt-in is eligible only for the consented phone", () => {
  const optedIn = {
    whatsappStatus: "opted_in" as const,
    phoneE164: "+525512345678",
    optInAt: "2026-09-01T10:00:00.000Z",
    optOutAt: null,
    source: "clinic_staff_written" as const,
    termsVersion: "v1"
  };
  assert.deepEqual(getWhatsAppConsentDecision(optedIn, "+52 55 1234 5678"), {
    eligible: true,
    phoneE164: "+525512345678"
  });
  assert.deepEqual(getWhatsAppConsentDecision(optedIn, "+14155552671"), { eligible: false, code: "phone_changed" });
});

test("template registry exposes only the approved logical shape", () => {
  assert.deepEqual(getWhatsAppTemplateDefinition("appointment_reminder", "es_MX")?.allowedVariables, [
    "appointment_date",
    "appointment_time"
  ]);
  assert.equal(getWhatsAppTemplateDefinition("arbitrary_template", "es_MX"), null);
  assert.equal(getWhatsAppTemplateDefinition("appointment_reminder", "en_US"), null);
});

test("template variables reject missing, arbitrary and control-text values", () => {
  assert.deepEqual(validateWhatsAppTemplateVariables("appointment_reminder", "es_MX", {
    appointment_date: "5 de septiembre",
    appointment_time: "10:00"
  }), { appointment_date: "5 de septiembre", appointment_time: "10:00" });
  assert.equal(validateWhatsAppTemplateVariables("appointment_reminder", "es_MX", {
    appointment_date: "5 de septiembre",
    appointment_time: "10:00",
    patient_name: "Paciente"
  }), null);
  assert.equal(validateWhatsAppTemplateVariables("appointment_reminder", "es_MX", {
    appointment_date: "5 de septiembre",
    appointment_time: "10:00\ntexto libre"
  }), null);
});

test("WhatsApp entitlement remains commercially disabled for every plan", () => {
  assert.equal(planIncludesFeature("basic", "whatsapp_notifications"), false);
  assert.equal(planIncludesFeature("plus", "whatsapp_notifications"), false);
  assert.equal(planIncludesFeature("pro", "whatsapp_notifications"), false);
});

test("outbound kill switch is exact and false by default", () => {
  assert.equal(parseWhatsAppOutboundEnabled(undefined), false);
  assert.equal(parseWhatsAppOutboundEnabled("false"), false);
  assert.equal(parseWhatsAppOutboundEnabled("TRUE"), false);
  assert.equal(parseWhatsAppOutboundEnabled("true"), true);
  assert.match(envExample, /^WHATSAPP_OUTBOUND_ENABLED=false$/m);
});

test("Meta provider skeleton is structurally fail-closed and contains no network call", () => {
  assert.match(provider, /provider_not_enabled/);
  assert.match(provider, /provider_not_configured/);
  assert.match(provider, /verifyWebhook[\s\S]+return false/);
  assert.match(provider, /parseWebhook[\s\S]+return \[\]/);
  assert.doesNotMatch(provider, /\bfetch\s*\(/);
  assert.doesNotMatch(provider, /graph\.facebook\.com/i);
});

test("provider contracts use allowlisted outcomes, statuses and error categories", () => {
  assert.match(providerBoundary, /import "server-only"/);
  assert.match(providerBoundary, /WhatsAppProvider/);
  assert.match(providerTypes, /state: "accepted"/);
  assert.match(providerTypes, /state: "rejected"/);
  assert.match(providerTypes, /state: "delivery_unknown"/);
  assert.match(providerTypes, /"sent"[\s\S]+"delivered"[\s\S]+"read"[\s\S]+"failed"/);
  assert.doesNotMatch(providerTypes, /messageBody|patientName|doctorName|specialty|appointmentType|url:/i);
});

test("migration creates private tenant-safe foundations without message content", () => {
  for (const table of [
    "whatsapp_provider_accounts",
    "whatsapp_integrations",
    "whatsapp_templates",
    "patient_communication_preferences",
    "whatsapp_message_deliveries"
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all privileges on table public\\.${table} from public, anon, authenticated`));
  }
  const deliveries = migration.match(/create table public\.whatsapp_message_deliveries \(([\s\S]+?)\n\);/)?.[1] ?? "";
  assert.doesNotMatch(deliveries, /\bphone_e164\b|message_body|template_variables|patient_name|webhook_payload/i);
  assert.match(deliveries, /foreign key \(clinic_id, job_id, appointment_id\)/i);
  assert.match(deliveries, /foreign key \(clinic_id, integration_id, provider_account_id\)/i);
  assert.match(migration, /old\.phone_e164 is not null and old\.phone_e164 is distinct from new\.phone_e164/i);
});

test("job extension preserves email types and adds channel-scoped WhatsApp dedupe", () => {
  assert.match(migration, /type in \('reminder_email', 'review_request_email', 'reminder_whatsapp'\)/);
  assert.match(migration, /channel in \('email', 'whatsapp'\)/);
  assert.match(migration, /type = 'reminder_whatsapp' and channel = 'whatsapp'/);
  assert.match(migration, /unique \(clinic_id, channel, dedupe_key\)/);
  const enqueue = migration.match(
    /create or replace function public\.enqueue_appointment_automation_jobs\(\)([\s\S]+?)\n\$\$;/
  )?.[1] ?? "";
  const rebuild = migration.match(
    /create or replace function public\.rebuild_clinic_reminder_jobs\(p_clinic_id uuid\)([\s\S]+?)\n\$\$;/
  )?.[1] ?? "";
  assert.match(enqueue, /'reminder_email'/);
  assert.match(enqueue, /'review_request_email'/);
  assert.doesNotMatch(enqueue, /'reminder_whatsapp'/);
  assert.equal((enqueue.match(/on conflict \(clinic_id, channel, dedupe_key\)/g) ?? []).length, 2);
  assert.equal((rebuild.match(/on conflict \(clinic_id, channel, dedupe_key\)/g) ?? []).length, 1);
  assert.doesNotMatch(migration, /on conflict \(clinic_id, dedupe_key\)/);
});

test("runner explicitly terminalizes foundation-only WhatsApp jobs before email context", () => {
  const whatsappGate = runner.indexOf('job.type === "reminder_whatsapp"');
  const contextLookup = runner.indexOf("loadCurrentContext(client, job, workerId)", whatsappGate);
  assert.ok(whatsappGate > 0 && contextLookup > whatsappGate);
  assert.match(runner.slice(whatsappGate, contextLookup), /provider_not_enabled/);
});

test("client-safe live projection adds only the generic WhatsApp job type", () => {
  assert.match(liveDomain, /"reminder_whatsapp"/);
  assert.doesNotMatch(liveDomain, /phone_e164|recipient|provider_message_id|message_body|template_variables|access_token/i);
});

test("all future WhatsApp secrets remain server-only in the environment contract", () => {
  for (const key of [
    "WHATSAPP_PROVIDER",
    "WHATSAPP_GRAPH_API_VERSION",
    "META_WHATSAPP_ACCESS_TOKEN",
    "META_WHATSAPP_APP_SECRET",
    "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "META_WHATSAPP_WABA_ID",
    "META_WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_TOKEN_ENCRYPTION_KEY"
  ]) {
    assert.match(envExample, new RegExp(`^${key}=$`, "m"));
    assert.doesNotMatch(envExample, new RegExp(`NEXT_PUBLIC_${key}`));
  }
});
