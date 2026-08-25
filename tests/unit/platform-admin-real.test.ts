import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ADMIN_PAGE_SIZE,
  buildAdminListHref,
  clampAdminPage,
  escapeAdminIlike,
  getAdminPageRange,
  getBillingProviderLabel,
  parseAdminClinicQuery,
  parseAdminMembershipQuery,
  parseAdminSubscriptionQuery
} from "../../lib/admin/query.ts";

const layout = readFileSync("app/admin/layout.tsx", "utf8");
const guard = readFileSync("lib/admin/require-platform-admin.ts", "utf8");
const server = readFileSync("lib/server/platform-admin.ts", "utf8");
const home = readFileSync("app/admin/page.tsx", "utf8");
const clinics = readFileSync("app/admin/clinics/page.tsx", "utf8");
const memberships = readFileSync("app/admin/doctors/page.tsx", "utf8");
const subscriptions = readFileSync("app/admin/subscriptions/page.tsx", "utf8");
const adminShell = readFileSync("components/admin/admin-shell.tsx", "utf8");
const platformMigration = readFileSync("supabase/migrations/0002_platform_admins.sql", "utf8");

test("platform admin access matrix is independent from every clinic role", async (t) => {
  const platformAdminFunction = platformMigration.match(/create or replace function public\.is_platform_admin\(\)[\s\S]*?\$\$;/i)?.[0] ?? "";

  assert.match(layout, /await requirePlatformAdmin\(\)/);
  assert.match(guard, /auth\.getUser\(\)/);
  assert.match(guard, /rpc\("is_platform_admin"\)/);
  assert.match(guard, /if \(!isPlatformAdmin\)[\s\S]*redirect\("\/dashboard"\)/);
  assert.match(platformAdminFunction, /from public\.platform_admins/);
  assert.match(platformAdminFunction, /where platform_admins\.user_id = auth\.uid\(\)/);
  assert.doesNotMatch(platformAdminFunction, /clinic_members|has_clinic_role|\brole\b/);
  assert.match(platformMigration, /Internal CliniControl platform administrators[\s\S]+independent from clinic owner, doctor, assistant, and admin roles/i);
  assert.doesNotMatch(guard, /has_clinic_role|clinic_members/);

  await t.test("platform_admin is allowed by the dedicated RPC", () => {
    assert.match(platformAdminFunction, /select exists/);
    assert.match(guard, /if \(!isPlatformAdmin\)/);
  });

  for (const role of ["owner", "admin", "doctor", "assistant"] as const) {
    await t.test(`${role} without platform_admin is blocked`, () => {
      assert.doesNotMatch(platformAdminFunction, new RegExp(`\\b${role}\\b`, "i"));
      assert.match(guard, /if \(!isPlatformAdmin\)[\s\S]*redirect\("\/dashboard"\)/);
    });
  }
});

test("service role is used only after the platform admin guard", () => {
  const exportedDataFunctions = Array.from(server.matchAll(/export async function (getPlatformAdmin\w+)/g), (match) => match[1]);

  assert.match(server, /^import "server-only";/);
  const guardIndex = server.indexOf("await requirePlatformAdmin()");
  const adminClientIndex = server.indexOf("return createAdminClient()", guardIndex);
  assert.ok(guardIndex >= 0 && adminClientIndex > guardIndex);
  assert.equal((server.match(/createAdminClient\(\)/g) ?? []).length, 1);
  assert.equal((server.match(/const admin = await authorizedAdminClient\(\)/g) ?? []).length, 4);
  assert.deepEqual(exportedDataFunctions, [
    "getPlatformAdminOverview",
    "getPlatformAdminClinics",
    "getPlatformAdminMemberships",
    "getPlatformAdminSubscriptions"
  ]);
  assert.doesNotMatch(server, /(?:skip|bypass|trusted|authorized|adminClient)\s*[?:]/i);
  assert.match(adminShell, /^"use client";/);
  assert.doesNotMatch(adminShell, /lib\/server\/platform-admin/);
  assert.doesNotMatch([home, clinics, memberships, subscriptions].join("\n"), /^"use client";/m);
});

test("admin projections are restricted to administrative tables and safe profile fields", () => {
  const tables = Array.from(server.matchAll(/\.from\("([^"]+)"\)/g), (match) => match[1]);
  assert.deepEqual([...new Set(tables)].sort(), ["clinic_members", "clinic_subscriptions", "clinics", "profiles"]);
  assert.match(server, /profiles"\)\.select\("id, full_name, email"\)/);
  assert.doesNotMatch(server, /select\(\s*["']\*/);
  assert.doesNotMatch(server, /auth\.users|auth\.admin|\.from\("users"\)/);
  assert.doesNotMatch(server, /\.from\("(?:patients|appointments|medical_notes|consents|consent_signatures|clinical_payments|payments|audit_logs|bot_logs)"\)/);
  assert.doesNotMatch([home, clinics, memberships, subscriptions].join("\n"), /provider_subscription_id|provider_plan_id|token|secret|metadata|diagnosis|clinical_impression/i);
});

test("dashboard and lists use real exact counts and bounded pagination", () => {
  assert.match(home, /getPlatformAdminOverview\(\)/);
  assert.match(clinics, /getPlatformAdminClinics\(query\)/);
  assert.match(memberships, /getPlatformAdminMemberships\(query\)/);
  assert.match(subscriptions, /getPlatformAdminSubscriptions\(query\)/);
  assert.match(server, /count: "exact", head: true/);
  assert.match(server, /statusDistribution/);
  assert.match(home, /result\.data\.statusDistribution/);
  assert.match(server, /\.range\(from, to\)/);
  assert.equal(ADMIN_PAGE_SIZE, 20);
  assert.deepEqual(getAdminPageRange(2), { from: 20, to: 39 });
  assert.equal(clampAdminPage(99, 21), 2);
});

test("query parameter manipulation is normalized and filters remain allowlisted", () => {
  assert.deepEqual(parseAdminClinicQuery({ page: "-2", q: "  Clínica   Norte  ", tenant: "hacked" }), {
    page: 1,
    search: "Clínica Norte",
    tenantType: null
  });
  assert.deepEqual(parseAdminMembershipQuery({ page: "2", role: "owner", status: "active" }), {
    page: 2,
    role: "owner",
    status: "active"
  });
  assert.deepEqual(parseAdminSubscriptionQuery({ page: "3", plan: "pro", status: "past_due", provider: "paypal" }), {
    page: 3,
    plan: "pro",
    status: "past_due",
    provider: "paypal"
  });
  assert.deepEqual(parseAdminClinicQuery({ page: "999999999999", q: "   ", tenant: "demo" }), {
    page: 10_000,
    search: "",
    tenantType: "demo"
  });
  assert.deepEqual(parseAdminMembershipQuery({ page: "0", role: "platform_admin", status: "deleted" }), {
    page: 1,
    role: null,
    status: null
  });
  assert.deepEqual(parseAdminSubscriptionQuery({ plan: "enterprise", status: "active' OR true --", provider: "stripe" }), {
    page: 1,
    plan: null,
    status: null,
    provider: null
  });
  assert.equal(buildAdminListHref("/admin/clinics", { q: "Norte", tenant: "demo" }, 2), "/admin/clinics?q=Norte&tenant=demo&page=2");
  assert.equal(escapeAdminIlike("Clínica%_\\Norte"), "Clínica\\%\\_\\\\Norte");
  assert.equal(clampAdminPage(10_000, 39), 2);
});

test("multi-clinic users are represented as explicit memberships", () => {
  assert.match(memberships, /Cada fila representa una relación usuario-clínica/);
  assert.match(server, /clinic_members"\)\.select\("id, clinic_id, user_id, role, status, created_at"\)/);
  assert.match(memberships, /membership\.clinicName/);
  assert.match(memberships, /memberRoleLabels\[membership\.role\]/);
});

test("subscription provider is honest and provider identifiers never reach the page", () => {
  assert.equal(getBillingProviderLabel("paypal", true), "PayPal");
  assert.equal(getBillingProviderLabel("paypal", false), "Sin proveedor asociado");
  assert.equal(getBillingProviderLabel("manual", false), "Provisionamiento manual");
  assert.equal(getBillingProviderLabel("demo", false), "Demo controlada");
  assert.match(server, /providerLabel: getBillingProviderLabel/);
  assert.doesNotMatch(server, /select\("[^"]*provider_subscription_id/);
  assert.match(server, /\.not\("provider_subscription_id", "is", null\)/);
  assert.doesNotMatch(subscriptions, /provider_subscription_id|provider_plan_id|paymentMethod|cardNumber|cardLastFour/i);
});

test("admin v1 is read-only with accessible empty and error states", () => {
  const pages = [home, clinics, memberships, subscriptions].join("\n");
  assert.match(pages, /role="alert"/);
  assert.match(clinics, /No se encontraron clínicas/);
  assert.match(memberships, /No se encontraron membresías/);
  assert.match(subscriptions, /No se encontraron suscripciones/);
  assert.doesNotMatch(pages, /Nueva clínica|Nuevo médico|Ver detalle|Ver suscripción|Impersonar|Eliminar clínica/);
  assert.doesNotMatch(pages, /action=\{|Server Action|createAdminClient|mock|demo conectado|próximamente|proximamente|coming soon/i);
  assert.doesNotMatch(pages, /<form[^>]*(?:action=|method=["']post["'])/i);
  assert.doesNotMatch(server, /\.(?:insert|update|upsert|delete)\(/);
});

test("demo tenants are identified without treating tenant_type as authorization", () => {
  const authorizationHelper = server.match(/async function authorizedAdminClient\(\)[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(server, /label: "Clínicas demo"/);
  assert.match(clinics, /tenantTypeLabels\[clinic\.tenantType\]/);
  assert.match(memberships, /tenantTypeLabels\[membership\.tenantType\]/);
  assert.match(subscriptions, /tenantTypeLabels\[subscription\.tenantType\]/);
  assert.match(authorizationHelper, /requirePlatformAdmin/);
  assert.doesNotMatch(authorizationHelper, /tenant_type|tenantType/);
});
