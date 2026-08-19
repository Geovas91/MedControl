import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPatientConsentsHref } from "../../lib/consents/navigation.ts";
import { isDashboardNavItemActive } from "../../lib/dashboard/navigation.ts";
import { buildPatientListHref, normalizePatientListQuery } from "../../lib/patients/query.ts";

const patientId = "10000000-0000-4000-8000-000000000001";

test("consent index is a real tenant patient-selection page", () => {
  const page = readFileSync(new URL("../../app/dashboard/consents/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getPatientsForActiveTenant\(query\)/);
  assert.match(page, /title="Consentimientos"/);
  assert.match(page, /Selecciona un paciente para crear, revisar o gestionar sus consentimientos\./);
  assert.match(page, /Ver consentimientos/);
  assert.doesNotMatch(page, /redirect\("\/dashboard\/patients"\)/);
  assert.doesNotMatch(page, /demo-token|app\.clinicontrol\.local|Mock consent link and QR generation/);
});

test("patient source is constrained to the authenticated active tenant", () => {
  const service = readFileSync(new URL("../../lib/server/patients.ts", import.meta.url), "utf8");
  assert.match(service, /getActiveTenantContext\(\)/);
  assert.match(service, /const clinicId = context\.tenant\.clinic\.id/);
  assert.match(service, /filteredQuery = query\.eq\("clinic_id", clinicId\)/);
  assert.match(service, /applyPatientFilters\([\s\S]+clinicId,[\s\S]+filters[\s\S]+\.order\("full_name"/);
});

test("patient action points to the exact real consent module", () => {
  assert.equal(buildPatientConsentsHref(patientId), `/dashboard/patients/${patientId}/consents`);
  assert.throws(() => buildPatientConsentsHref("cross-tenant-patient"));
});

test("consent patient pagination stays inside the consent section", () => {
  const query = normalizePatientListQuery({ q: "Ana", page: "2" });
  assert.equal(buildPatientListHref(query, 3, "/dashboard/consents"), "/dashboard/consents?q=Ana&page=3");
});

test("sidebar keeps Consentimientos active throughout the real patient consent flow", () => {
  assert.equal(isDashboardNavItemActive("/dashboard/consents", "/dashboard/consents"), true);
  assert.equal(isDashboardNavItemActive(`/dashboard/patients/${patientId}/consents`, "/dashboard/consents"), true);
  assert.equal(isDashboardNavItemActive(`/dashboard/patients/${patientId}/consents/new`, "/dashboard/consents"), true);
  assert.equal(isDashboardNavItemActive(`/dashboard/patients/${patientId}/consents`, "/dashboard/patients"), false);
});

test("new consent entry returns to patient selection without mock content", () => {
  const page = readFileSync(new URL("../../app/dashboard/consents/new/page.tsx", import.meta.url), "utf8");
  assert.match(page, /redirect\("\/dashboard\/consents"\)/);
  assert.doesNotMatch(page, /demo-token|app\.clinicontrol\.local|Generate patient consent|Mock consent link and QR generation/);
});
