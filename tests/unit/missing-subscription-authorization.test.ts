import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);

function load(path: string, mocks: Record<string, unknown> = {}, jsx = false) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: jsx ? ts.JsxEmit.ReactJSX : undefined }
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(source, { exports, require: (name: string) => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith("@/") ? {} : require(name) });
  return exports;
}

const readyTenant = { state: "ready", user: { id: "actor" }, tenant: { clinic: { id: "clinic" }, membership: { role: "owner" } } };
const missing = { state: "missing", message: "Sin plan configurado" };
const failed = { state: "error", message: "No fue posible verificar" };

test("canonical subscription reads distinguish missing from technical failure and never construct Basic", async () => {
  let queryError: { code: string } | null = null;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: queryError }) };
  const subscriptions = load("lib/supabase/subscriptions.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) },
    "@/lib/supabase/admin": { createAdminClient: () => { throw Error("no admin access expected"); } },
    "@/config/plans": { getPlanById: () => { throw Error("no plan expected"); } }
  });
  assert.equal((await subscriptions.getClinicPlanContext("clinic")).state, "missing");
  queryError = { code: "PGRST500" };
  assert.equal((await subscriptions.getClinicPlanContext("clinic")).state, "error");

  const entitlements = load("lib/server/entitlements.ts", {
    "server-only": {},
    "@/lib/logger": { logger: { error: () => {} } },
    "@/lib/supabase/subscriptions": { getClinicSubscription: async () => ({ data: null, error: null }) }
  });
  const result = await entitlements.getClinicEntitlements("clinic");
  assert.equal(result.state, "missing");
  assert.equal("entitlements" in result, false);
  assert.equal(entitlements.canCreateWithEntitlements(result), false);
  assert.equal(entitlements.planIncludesFeature(result, "appointment_assistant"), false);
  assert.equal(entitlements.canUseFeature(result, "google_calendar"), false);
});

test("member action denies new professional grants before RPC but permits authorized removal", async () => {
  let rpcCalls = 0;
  const actions = load("app/dashboard/members/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw Error("unexpected redirect"); } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => readyTenant },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => missing, canCreateWithEntitlements: () => false },
    "@/lib/supabase/clinic-members": { setClinicMemberProfessionalCapability: async () => { rpcCalls++; return { data: true, error: null }; } }
  });
  const grant = new FormData();
  grant.set("member_id", "member");
  grant.set("is_professional", "true");
  assert.match((await actions.setClinicMemberProfessionalCapabilityAction({}, grant)).error, /suscripción/);
  assert.equal(rpcCalls, 0);
  grant.set("is_professional", "false");
  assert.match((await actions.setClinicMemberProfessionalCapabilityAction({}, grant)).message, /desactivada/);
  assert.equal(rpcCalls, 1);
});

test("Assistant returns explicit missing before clinical queries while technical errors remain errors", async () => {
  let entitlement = missing;
  const access = load("lib/server/appointment-assistant-access.ts", {
    "server-only": {},
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => readyTenant },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => entitlement }
  });
  const assistant = load("lib/server/appointment-assistant.ts", {
    "@/lib/server/appointment-assistant-access": access,
    "server-only": {},
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => readyTenant },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => entitlement },
    "@/lib/supabase/server": { createClient: () => { throw Error("unexpected clinical query"); } }
  });
  assert.equal((await assistant.getAppointmentAssistantForActiveTenant({})).state, "subscription_missing");
  entitlement = failed;
  assert.equal((await assistant.getAppointmentAssistantForActiveTenant({})).state, "error");
});

test("Calendar preserves missing state and safe disconnect visibility without granting connection", async () => {
  let entitlement = missing;
  const calendar = load("lib/server/google-calendar-integration.ts", {
    "server-only": {},
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => readyTenant },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => entitlement, planIncludesFeature: () => false, canUseFeature: () => false },
    "@/lib/server/google-calendar-config": { getGoogleCalendarConfiguration: () => ({ state: "missing" }) },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async () => ({ data: [{ user_id: "actor", status: "connected" }], error: null }) }) }
  });
  const result = await calendar.getGoogleCalendarIntegrationPageData();
  assert.equal(result.state, "subscription_missing");
  assert.equal(result.data.canUseGoogleCalendar, false);
  assert.equal(result.data.hasOwnDisconnectableIntegration, true);
  assert.equal(result.data.own, null);
  entitlement = failed;
  assert.equal((await calendar.getGoogleCalendarIntegrationPageData()).state, "error");
});

test("missing pages show billing action and professional removal remains available", async () => {
  const header = ({ title }: { title: string }) => require("react").createElement("header", null, title);
  const buttonLink = ({ href, children }: { href: string; children: unknown }) => require("react").createElement("a", { href }, children);
  const bot = load("app/dashboard/bot/page.tsx", {
    "next/link": buttonLink,
    "next/navigation": { redirect: () => { throw Error("unexpected redirect"); } },
    "@/components/dashboard/page-header": { PageHeader: header },
    "@/components/ui/button": { ButtonLink: buttonLink },
    "@/lib/server/appointment-assistant": { getAppointmentAssistantForActiveTenant: async () => ({ state: "subscription_missing", data: null }) }
  }, true);
  const botHtml = renderToStaticMarkup(await bot.default({ searchParams: Promise.resolve({}) }));
  assert.match(botHtml, /Sin plan configurado/);
  assert.match(botHtml, /href="\/dashboard\/billing"/);
  assert.doesNotMatch(botHtml, /Disponible en Plus y Pro|No fue posible cargar/);

  const integrations = load("app/dashboard/settings/integrations/page.tsx", {
    "next/navigation": { redirect: () => { throw Error("unexpected redirect"); } },
    "@/components/dashboard/page-header": { PageHeader: header },
    "@/components/ui/badge": { Badge: ({ children }: { children: unknown }) => require("react").createElement("span", null, children) },
    "@/components/ui/button": {
      ButtonLink: buttonLink,
      Button: ({ children }: { children: unknown }) => require("react").createElement("button", null, children)
    },
    "@/lib/server/google-calendar-integration": { getGoogleCalendarIntegrationPageData: async () => ({
      state: "subscription_missing", data: { role: "owner", configurationReady: false, planIncludesGoogleCalendar: false,
        canUseGoogleCalendar: false, canConnectOwn: true, hasOwnDisconnectableIntegration: true, own: null, clinicSummary: null }
    }) }
  }, true);
  const calendarHtml = renderToStaticMarkup(await integrations.default({ searchParams: Promise.resolve({ google: "connected" }) }));
  assert.match(calendarHtml, /Sin plan configurado/);
  assert.match(calendarHtml, /href="\/dashboard\/billing"/);
  assert.match(calendarHtml, /Desconectar mi cuenta/);
  assert.doesNotMatch(calendarHtml, /Disponible en Plus y Pro|No fue posible cargar las integraciones/);

  const control = load("components/dashboard/member-professional-capability.tsx", {
    "react": { useActionState: () => [{}, () => {}] },
    "@/components/ui/button": { Button: ({ children, ...props }: { children: unknown }) => require("react").createElement("button", props, children) }
  }, true);
  const props = { memberId: "member", role: "owner", isCurrentMember: false, canManage: true, canGrantProfessionalCapability: false };
  assert.doesNotMatch(renderToStaticMarkup(require("react").createElement(control.MemberProfessionalCapability, { ...props, isProfessional: false })), /Marcar profesional/);
  assert.match(renderToStaticMarkup(require("react").createElement(control.MemberProfessionalCapability, { ...props, isProfessional: true })), /Quitar profesional/);
});

test("Billing and Settings retain explicit missing presentation and first billing intent can insert a row", () => {
  const billing = readFileSync("app/dashboard/billing/page.tsx", "utf8");
  const settings = readFileSync("app/dashboard/settings/page.tsx", "utf8");
  const paypal = readFileSync("supabase/migrations/0035_paypal_billing_hardening.sql", "utf8");
  assert.match(billing, /planContextResult\.state === "missing"[\s\S]+Sin plan configurado/);
  assert.match(settings, /planContext\.state === "missing"[\s\S]+Sin plan configurado/);
  assert.match(paypal, /previous_subscription_id\)[\s\S]+select provider_subscription_id from public\.clinic_subscriptions/);
  assert.match(paypal, /insert into public\.clinic_subscriptions[\s\S]+on conflict\(clinic_id\) do update/);
});


test("consent states distinguish missing, read-only and technical failures without plan fallback", () => {
  const access = load("lib/consents/access.ts");
  assert.equal(access.getConsentWriteState(missing), "subscription_missing");
  assert.equal(access.getConsentWriteState(failed), "error");
  for (const effectiveStatus of ["active", "trialing", "trial_expired", "past_due", "inactive", "cancelled"]) {
    assert.equal(access.getConsentWriteState({ state: "ready", entitlements: { effectiveStatus } }), ["active", "trialing"].includes(effectiveStatus) ? "ready" : "subscription_read_only");
  }
  assert.match(access.getConsentAccessMessage("subscription_missing"), /Sin plan configurado/);
  assert.doesNotMatch(access.getConsentAccessMessage("subscription_missing"), /Basic|Básico|Plus|Pro/);
});

test("consent pages show billing CTA only for missing or read-only subscriptions", () => {
  const list = readFileSync("app/dashboard/patients/[id]/consents/page.tsx", "utf8");
  const detail = readFileSync("app/dashboard/patients/[id]/consents/[consentId]/page.tsx", "utf8");
  const billingCondition = /(?:writeState|consent\.writeState) === "subscription_missing" \|\| (?:writeState|consent\.writeState) === "subscription_read_only" \? <Link href="\/dashboard\/billing"/;

  assert.match(list, billingCondition);
  assert.match(detail, billingCondition);
  assert.match(list, /getConsentAccessMessage\(writeState\)/);
  assert.match(detail, /getConsentAccessMessage\(consent\.writeState\)/);
});
