import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canAddDoctorToPlan, getPlanById } from "../../config/plans.ts";

const require = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, unknown> = {}) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(source, { exports, require: (name: string) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) });
  return exports;
}
const wrap = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children);
const hooks = { useActionState: () => [{}, () => {}], useState: () => [false, () => {}] };
const controls = load("components/dashboard/member-professional-capability.tsx", {
  react: hooks,
  "@/app/dashboard/members/actions": {},
  "@/components/ui/button": { Button: ({ children, ...props }: any) => React.createElement("button", props, children) }
});
const invitations = load("components/dashboard/add-member-form.tsx", {
  react: hooks,
  "@/app/dashboard/members/actions": {},
  "@/components/auth/auth-submit-button": { AuthSubmitButton: () => React.createElement("button", null, "Crear invitación") },
  "@/components/ui/button": { Button: wrap },
  "@/components/ui/input": {
    Field: wrap,
    Input: (props: any) => React.createElement("input", props),
    Select: (props: any) => React.createElement("select", props)
  }
});

for (const [role, expected] of [["owner", true], ["admin", false]] as const) {
  test(`${role} self management visibility follows policy, including safe removal without entitlement`, () => {
    for (const isProfessional of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(controls.MemberProfessionalCapability, {
        memberId: "member", role, isCurrentMember: true, isProfessional, canManage: true,
        canGrantProfessionalCapability: !isProfessional
      }));
      assert.equal(html.includes("<form"), expected);
      if (expected) assert.match(html, isProfessional ? /Quitar profesional/ : /Marcar profesional/);
    }
  });
}
test("full capacity disables grants but preserves authorized reductions and fixed roles", () => {
  for (const isProfessional of [true, false]) {
    const props = { memberId: "member", role: "admin", isCurrentMember: false, isProfessional, canManage: true, canGrantProfessionalCapability: false };
    const html = renderToStaticMarkup(React.createElement(controls.MemberProfessionalCapability, props));
    assert.equal(html.includes("<form"), isProfessional);
    assert.doesNotMatch(html, /Marcar profesional/);
  }
  for (const [role, label] of [["doctor", "Obligatorio"], ["assistant", "No permitido"]]) {
    const html = renderToStaticMarkup(React.createElement(controls.MemberProfessionalCapability, {
      memberId: "member", role, isCurrentMember: false, isProfessional: role === "doctor", canManage: true, canGrantProfessionalCapability: true
    }));
    assert.match(html, new RegExp(label));
    assert.doesNotMatch(html, /<form/);
  }
});
test("Plus and Pro full capacity disables doctor only and selects an available staff role", () => {
  const html = renderToStaticMarkup(React.createElement(invitations.AddMemberForm, { canAddDoctor: false, canAddAdditionalStaff: true }));
  assert.match(html, /<option value="doctor" disabled=""/);
  assert.match(html, /<option value="admin" selected=""/);
  assert.doesNotMatch(html, /<option value="(?:admin|assistant)" disabled/);
  assert.match(html, /límite de profesionales/);
});
test("Basic invitation choices do not enable administrative staff", () => {
  const html = renderToStaticMarkup(React.createElement(invitations.AddMemberForm, { canAddDoctor: true, canAddAdditionalStaff: false }));
  assert.match(html, /<option value="doctor" selected=""/);
  assert.match(html, /<option value="admin" disabled=""/);
  assert.match(html, /<option value="assistant" disabled=""/);
});

for (const [plan, count, limit, label] of [
  ["basic", 5, 1, "5 de 1 profesionales"],
  ["plus", 8, 5, "8 de 5 profesionales"],
  ["pro", 8, null, "8 profesionales activos · sin límite"]
] as const) test(`Members and Settings show actual ${plan} professional usage without repair`, async () => {
  const context = { state: "ready", data: { planId: plan, plan: getPlanById(plan), subscription: { status: "active" }, currentDoctorCount: count, doctorLimit: limit, isUnlimitedDoctors: limit === null, canAddDoctor: canAddDoctorToPlan(plan, count) } };
  const tenant = { state: "ready", user: { id: "actor" }, tenant: { clinic: { id: "clinic" }, membership: { role: "owner" } } };
  const members = load("app/dashboard/members/page.tsx", {
    "next/navigation": { redirect: () => { throw Error("unexpected redirect"); } },
    "@/components/ui/badge": { Badge: wrap },
    "@/components/dashboard/add-member-form": invitations,
    "@/components/dashboard/invitation-actions": { InvitationActions: wrap },
    "@/components/dashboard/member-professional-capability": controls,
    "@/components/dashboard/page-header": { PageHeader: wrap },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => tenant },
    "@/lib/supabase/clinic-members": {
      listClinicMembersForClinic: async () => ({ data: [{ id: "member", user_id: "actor", role: "owner", status: "active", is_professional: false, created_at: "2026-01-01", full_name: "Synthetic owner", email: "synthetic@example.test" }] }),
      listClinicInvitations: async () => ({ data: [] })
    },
    "@/lib/supabase/subscriptions": { getClinicPlanContext: async () => context },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({}), canCreateWithEntitlements: () => true, planIncludesFeature: () => plan !== "basic" },
    "@/lib/utils": { formatDate: () => "date" }
  });
  const settings = load("app/dashboard/settings/page.tsx", {
    "@/components/ui/button": { ButtonLink: wrap },
    "@/components/dashboard/page-header": { PageHeader: wrap },
    "@/lib/onboarding": { getOnboardingStatus: async () => ({ state: "complete", membership: { clinic_id: "clinic" } }) },
    "@/lib/supabase/subscriptions": { getClinicPlanContext: async () => context }
  });
  for (const page of [members, settings]) {
    const html = renderToStaticMarkup(await page.default());
    assert.match(html, /Profesionales activos/);
    assert.ok(html.includes(label));
    assert.doesNotMatch(html, /Médicos registrados|Médicos ilimitados/);
  }
  const html = renderToStaticMarkup(await members.default());
  assert.equal(html.includes("Marcar profesional"), plan === "pro");
  assert.equal(html.includes("Crear invitación"), plan !== "basic");
});
test("plan limits remain numeric compatibility APIs and allow over-limit reads", () => {
  assert.equal(canAddDoctorToPlan("basic", 0), true);
  assert.equal(canAddDoctorToPlan("basic", 1), false);
  assert.equal(canAddDoctorToPlan("basic", 5), false);
  assert.equal(canAddDoctorToPlan("plus", 4), true);
  assert.equal(canAddDoctorToPlan("plus", 5), false);
  assert.equal(canAddDoctorToPlan("plus", 8), false);
  assert.equal(canAddDoctorToPlan("pro", 100), true);
});
test("0057 onboarding assigns new owner capability explicitly without a backfill", () => {
  const migration = readFileSync("supabase/migrations/0057_align_professional_plan_capacity.sql", "utf8");
  const onboarding = migration.slice(migration.indexOf("create or replace function public.complete_clinic_onboarding"));
  assert.match(onboarding, /'owner', 'active', p_plan_id = 'basic'/);
  assert.match(onboarding, /return v_existing_clinic_id/);
  assert.doesNotMatch(onboarding, /update public\.clinic_members/);
});
test("server action preserves same-tenant RPC authority and sanitizes cross-tenant failure", async () => {
  const calls: unknown[] = [];
  const actions = load("app/dashboard/members/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": {},
    "@/lib/supabase/config": {},
    "@/lib/server/invitation-email": {},
    "@/lib/logger": { logger: { error: () => {} } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", user: { id: "actor" }, tenant: { clinic: { id: "own-clinic" }, membership: { role: "owner" } } }) },
    "@/lib/server/entitlements": { getClinicEntitlements: async () => ({ state: "missing" }), canCreateWithEntitlements: () => false },
    "@/lib/supabase/clinic-members": { setClinicMemberProfessionalCapability: async (input: unknown) => { calls.push(input); return { data: null, error: { code: "22023", message: "private database text" } }; } }
  });
  const form = new FormData();
  form.set("member_id", "foreign-member"); form.set("clinic_id", "foreign-clinic"); form.set("is_professional", "false");
  const result = await actions.setClinicMemberProfessionalCapabilityAction({}, form);
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(calls), /own-clinic/);
  assert.doesNotMatch(JSON.stringify(calls), /foreign-clinic/);
  assert.ok(result.error);
  assert.doesNotMatch(result.error, /private database text/);
});
