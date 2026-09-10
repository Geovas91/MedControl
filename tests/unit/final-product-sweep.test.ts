import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reviewActions = readFileSync("app/reviews/actions.ts", "utf8");
const reviewServer = readFileSync("lib/server/reviews.ts", "utf8");
const settingsPage = readFileSync("app/dashboard/settings/page.tsx", "utf8");
const plans = readFileSync("config/plans.ts", "utf8");

test("reviews use the token-only public flow without a service-role Server Action", () => {
  assert.doesNotMatch(reviewActions, /TrustedFlow|createVerifiedDoctorReview/);
  assert.doesNotMatch(reviewServer, /createAdminClient|create_verified_doctor_review/);
  assert.match(reviewActions, /submitPublicVerifiedReview/);
  assert.match(reviewActions, /reviewToken, rating, comment/);
});

test("settings only presents configuration destinations backed by real routes", () => {
  assert.match(settingsPage, /href: "\/dashboard\/settings\/clinical-templates"/);
  assert.match(settingsPage, /href: "\/dashboard\/members"/);
  assert.match(settingsPage, /href: "\/dashboard\/settings\/integrations"/);
  assert.doesNotMatch(settingsPage, /Perfil de clínica|Notificaciones|Controles de privacidad|próximas fases/);
});

test("commercial plans avoid unsupported premium claims", () => {
  assert.doesNotMatch(plans, /Bot premium|Recordatorios avanzados|Reportes (?:básicos|ampliados)|Configuración avanzada de horarios|Gestión avanzada de roles|Soporte prioritario|Soporte preferente/);
});
