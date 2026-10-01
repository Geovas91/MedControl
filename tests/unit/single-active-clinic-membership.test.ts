import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(source, { exports, URL, require: (name: string) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) });
  return exports;
}

const member = { id: "member", user_id: "actor", clinic_id: "clinic", role: "owner", status: "active", is_professional: false };
function client(members: unknown[], error: unknown = null) {
  const calls: string[] = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) },
    rpc: async () => { calls.push("rpc"); return { data: "created", error: null }; },
    from: (table: string) => {
      calls.push(table);
      const rows = table === "clinic_members" ? members : table === "profiles" ? [{ id: "actor", full_name: "Synthetic User" }] : [{ id: "clinic", name: "Synthetic Clinic" }];
      const query = {
        select: () => query, eq: () => query,
        limit: async () => ({ data: rows, error }),
        maybeSingle: async () => ({ data: rows.length === 1 ? rows[0] : null, error: error ?? (rows.length > 1 ? { code: "PGRST116" } : null) })
      };
      return query;
    }
  };
  return { supabase, calls };
}

for (const [name, members, expected] of [
  ["none", [], "no_active_membership"],
  ["one", [member], "ready"],
  ["multiple", [member, { ...member, clinic_id: "other" }], "error"]
] as const) test(`active tenant resolves ${name} without a cookie or subscription lookup`, async () => {
  const { supabase, calls } = client([...members]);
  const loaded = load("lib/server/active-tenant.ts", {
    "server-only": {}, "react": { cache: (fn: unknown) => fn },
    "next/headers": { cookies: () => { throw Error("cookie must be ignored"); } },
    "@/lib/logger": { logger: { error: () => {} } },
    "@/lib/supabase/config": { hasSupabaseConfig: () => true },
    "@/lib/supabase/server": { createClient: async () => supabase }
  });
  const result = await loaded.getActiveTenantContext();
  assert.equal(result.state, expected);
  if (expected === "ready") {
    assert.equal(result.tenant.clinic.id, "clinic");
    assert.equal("availableClinics" in result.tenant, false);
  } else assert.equal(calls.includes("clinics"), false);
  assert.equal(calls.includes("clinic_subscriptions"), false);
});

test("onboarding fails closed for multiple memberships and never invokes a creation RPC", async () => {
  const { supabase, calls } = client([member, { ...member, clinic_id: "other" }]);
  const loaded = load("lib/onboarding.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/supabase/config": { hasSupabaseConfig: () => true }
  });
  assert.equal((await loaded.getOnboardingStatus()).state, "error");
  assert.ok((await loaded.completeClinicOnboardingForCurrentUser({})).error);
  assert.equal(calls.includes("rpc"), false);
});

test("one active membership completes onboarding even without subscription", async () => {
  const { supabase, calls } = client([member]);
  const loaded = load("lib/onboarding.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/supabase/config": { hasSupabaseConfig: () => true }
  });
  assert.equal((await loaded.getOnboardingStatus()).state, "complete");
  assert.equal((await loaded.completeClinicOnboardingForCurrentUser({})).clinicId, "clinic");
  assert.equal(calls.includes("rpc"), false);
  assert.equal(calls.includes("clinic_subscriptions"), false);
});

test("invitation action redirects only after successful acceptance without writing clinic cookies", async () => {
  let denied = false;
  const loaded = load("app/invite/[token]/actions.ts", {
    "next/navigation": { redirect: (path: string) => { throw Error(path); } },
    "next/headers": { cookies: () => { throw Error("cookie must be ignored"); } },
    "@/lib/server/member-invitations": { acceptPublicMemberInvitation: async () => denied ? { data: null, error: {} } : { data: "clinic", error: null } }
  });
  await assert.rejects(loaded.acceptInvitationAction("synthetic-token"), /\/dashboard/);
  denied = true;
  await assert.rejects(loaded.acceptInvitationAction("synthetic-token"), /\/invite\/synthetic-token\?error=1/);
});

test("billing resolves the sole active owner without cookies or subscription prerequisites", async () => {
  let role = "owner";
  const policy = await import("../../lib/paypal/billing-policy.ts");
  const loaded = load("lib/paypal/billing-server.ts", {
    "server-only": {}, "next/headers": { cookies: () => { throw Error("cookie must be ignored"); } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", user: { id: "actor" }, tenant: { clinic: { id: "clinic" }, membership: { ...member, role } } }) },
    "@/lib/supabase/admin": { createAdminClient: () => { throw Error("no privileged access expected"); } },
    "@/config/plans": {}, "./billing-policy": policy,
    "./billing-handlers": { createBillingHandlers: () => ({}) }, "./server": {}
  });
  assert.deepEqual({ ...await loaded.requireBillingOwner() }, { userId: "actor", clinicId: "clinic" });
  for (role of ["admin", "doctor", "assistant"]) await assert.rejects(loaded.requireBillingOwner(), /billing_owner_required/);
});

test("migration and dashboard retain the single-membership authority and privacy boundaries", () => {
  const migration = readFileSync("supabase/migrations/0056_single_active_clinic_membership.sql", "utf8");
  assert.match(migration, /lock table public\.clinic_members in share row exclusive mode/);
  assert.match(migration, /create unique index clinic_members_one_active_per_user_idx/);
  assert.equal((migration.match(/hashtextextended\(v_user_id::text,\s*0\)/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /delete from public\.clinic_members|set status\s*=\s*'suspended'/);
  const layout = readFileSync("app/dashboard/layout.tsx", "utf8");
  assert.doesNotMatch(layout, /ClinicSwitcher|availableClinics/);
  assert.match(layout, /tenantContext\.state !== "ready"/);
});

test("technical membership failures never become missing-clinic onboarding", async () => {
  const { supabase, calls } = client([], { code: "PGRST500" });
  const loaded = load("lib/onboarding.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/supabase/config": { hasSupabaseConfig: () => true }
  });
  assert.equal((await loaded.getOnboardingStatus()).state, "error");
  assert.ok((await loaded.completeClinicOnboardingForCurrentUser({})).error);
  assert.equal(calls.includes("rpc"), false);
});

test("auth callback fails closed on duplicate or unavailable membership reads", async () => {
  const { supabase } = client([member, { ...member, clinic_id: "other" }]);
  Object.assign(supabase.auth, { exchangeCodeForSession: async () => ({ data: { user: { id: "actor" } }, error: null }) });
  const loaded = load("app/auth/callback/route.ts", {
    "next/server": { NextResponse: { redirect: (url: URL) => ({ location: url.toString() }) } },
    "@/lib/supabase/config": { getSupabaseConfigError: () => null },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/logger": { logger: { warn: () => {} } },
    "@/lib/auth/redirects": {
      getSafeLocalPath: () => "", buildAuthRedirect: () => "/login?error=unavailable",
      getPostAuthRedirect: () => { throw Error("must not select onboarding after failed lookup"); }
    },
    "@/lib/auth/profile": { syncAuthUserProfile: async () => ({ profile: { full_name: "Synthetic", email: "synthetic@example.test" }, error: null }) },
    "@/lib/auth/public-origin": { getPublicAppOrigin: () => "https://qa.example.test" },
    "@/lib/server/public-site-url": { getRuntimePublicSiteUrl: () => "https://qa.example.test" },
    "@/lib/security/public-errors": { getSafeDiagnosticCode: () => "membership_query_error" }
  });
  assert.equal((await loaded.GET({ url: "https://qa.example.test/auth/callback?code=synthetic" })).location, "https://qa.example.test/login?error=unavailable");
});

test("dashboard renders clinic identity without a selector and refuses a failed tenant resolution", async () => {
  let state = "ready";
  const react = require("react");
  const loaded = load("app/dashboard/layout.tsx", {
    "@/components/dashboard/dashboard-shell": { DashboardShell: ({ children, footer }: any) => react.createElement("main", null, children, footer) },
    "@/app/(auth)/actions": { signOutAction: () => {} },
    "@/lib/onboarding": { getOnboardingStatus: async () => ({ state: "complete", profile: { full_name: "Synthetic Owner" }, user: { email: "synthetic@example.test" }, membership: member }) },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state, tenant: state === "ready" ? { clinic: { id: "clinic", name: "Synthetic Clinic" }, membership: member } : null }) },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({ state: "missing" }), getEntitlementNotice: () => "Sin plan configurado", planIncludesFeature: () => false },
    "next/navigation": { redirect: () => { throw Error("must not create another clinic"); } }
  });
  const html = renderToStaticMarkup(await loaded.default({ children: react.createElement("p", null, "Billing") }));
  assert.match(html, /Synthetic Clinic/);
  assert.doesNotMatch(html, /<select|Clínica activa/);
  state = "error";
  await assert.rejects(loaded.default({ children: null }), /Clinic access is temporarily unavailable/);
});

test("platform administration authenticates without resolving any clinical membership", async () => {
  const loaded = load("lib/admin/require-platform-admin.ts", {
    "next/navigation": { redirect: () => { throw Error("unexpected redirect"); }, notFound: () => { throw Error("unexpected denial"); } },
    "@/lib/supabase/config": { getSupabaseConfigError: () => null },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "platform-admin" } }, error: null }) },
      rpc: async (name: string) => { assert.equal(name, "is_platform_admin"); return { data: true, error: null }; },
      from: () => { throw Error("no clinical membership required"); }
    }) }
  });
  assert.equal((await loaded.requirePlatformAdmin()).id, "platform-admin");
});
