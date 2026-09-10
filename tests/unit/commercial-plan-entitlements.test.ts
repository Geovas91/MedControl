import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPlanEntitlements, planIncludesFeature } from "../../config/plans.ts";

const plans = readFileSync("config/plans.ts", "utf8");
const subscriptions = readFileSync("lib/supabase/subscriptions.ts", "utf8");
const memberAction = readFileSync("app/dashboard/members/actions.ts", "utf8");
const memberPage = readFileSync("app/dashboard/members/page.tsx", "utf8");
const assistantServer = readFileSync("lib/server/appointment-assistant.ts", "utf8");
const assistantPage = readFileSync("app/dashboard/bot/page.tsx", "utf8");
const dashboardShell = readFileSync("components/dashboard/dashboard-shell.tsx", "utf8");
const landing = readFileSync("app/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/0039_commercial_plan_entitlements.sql", "utf8");

test("commercial entitlements match the approved Basic Plus Pro matrix", () => {
  assert.equal(planIncludesFeature("basic", "additional_staff"), false);
  assert.equal(planIncludesFeature("plus", "additional_staff"), true);
  assert.equal(planIncludesFeature("pro", "additional_staff"), true);
  assert.equal(planIncludesFeature("basic", "appointment_assistant"), false);
  assert.equal(planIncludesFeature("plus", "appointment_assistant"), true);
  assert.equal(planIncludesFeature("pro", "appointment_assistant"), true);
  assert.equal(planIncludesFeature("basic", "google_calendar"), false);
  assert.equal(planIncludesFeature("plus", "google_calendar"), true);
  assert.equal(planIncludesFeature("pro", "google_calendar"), true);
  for (const plan of ["basic", "plus", "pro"] as const) {
    assert.equal(planIncludesFeature(plan, "service_bot_tier1"), true);
    assert.equal(planIncludesFeature(plan, "whatsapp_notifications"), false);
  }
  assert.equal(getPlanEntitlements("basic").doctorLimit, 1);
  assert.equal(getPlanEntitlements("plus").doctorLimit, 5);
  assert.equal(getPlanEntitlements("pro").doctorLimit, null);
  assert.doesNotMatch(plans, /calendar_email_invitations|custom_consents/);
});

test("missing subscription is explicit and never represented as Basic", () => {
  assert.match(subscriptions, /state: "missing"/);
  assert.match(subscriptions, /if \(!subscription\)[\s\S]+return \{ state: "missing", data: null, error: null \}/);
  assert.doesNotMatch(subscriptions, /subscription\?\.plan_id\s*\?\?\s*"basic"/);
});

test("additional staff is gated in UI server actions and final SQL RPCs", () => {
  assert.match(memberPage, /canAddAdditionalStaff=\{canAddAdditionalStaff\}/);
  assert.match(memberAction, /role === "admin" \|\| role === "assistant"[\s\S]+additional_staff/);
  assert.match(migration, /create_clinic_member_invitation_for_current_user[\s\S]+v_role in \('admin','assistant'\)[\s\S]+additional_staff/);
  assert.match(migration, /accept_clinic_member_invitation_for_current_user[\s\S]+v_invitation\.role in \('admin','assistant'\)[\s\S]+additional_staff/);
  assert.doesNotMatch(migration, /delete from public\.clinic_members/);
});

test("Appointment Assistant is hidden and denied for Basic while existing jobs remain reconcilable", () => {
  assert.match(dashboardShell, /appointmentAssistantAvailable[\s\S]+item\.href !== "\/dashboard\/bot"/);
  assert.match(assistantServer, /planIncludesFeature\(entitlements, "appointment_assistant"\)/);
  assert.match(assistantServer, /canUseFeature\([\s\S]+"appointment_assistant"/);
  assert.match(assistantPage, /Disponible en Plus y Pro/);
  assert.match(migration, /save_appointment_assistant_settings_for_current_user[\s\S]+appointment_assistant/);
  assert.match(migration, /enqueue_appointment_automation_jobs[\s\S]+appointment_assistant/);
  assert.doesNotMatch(migration, /create or replace function public\.(claim_due_appointment_automation_jobs|finish_appointment_automation_job|mark_appointment_automation_delivery_accepted)/);
});

test("ICS consents Reviews and Service Bot remain independent from the Assistant entitlement", () => {
  assert.doesNotMatch(migration, /create or replace function public\.(prepare_appointment_email_invite|create_consent_for_current_user|issue_review_invitation_for_current_user|create_support_ticket_for_current_user)/);
  assert.match(plans, /Invitaciones de calendario ICS por email/);
  assert.match(plans, /Consentimientos personalizados por especialidad/);
  assert.match(plans, /Reseñas verificadas/);
  assert.match(plans, /Service Bot Tier 1/);
});

test("marketing removes unsupported claims and publishes the approved matrix", () => {
  assert.doesNotMatch(plans, /Gestión avanzada de roles|Reportes básicos|Soporte prioritario|Soporte preferente/);
  assert.match(landing, /Appointment Assistant/);
  assert.match(landing, /WhatsApp outbound/);
  assert.match(plans, /Sin Google Calendar/);
  assert.match(plans, /Sin Appointment Assistant/);
});
