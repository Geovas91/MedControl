import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildReviewInvitationEmail } from "../../lib/email/templates/review-invitation.ts";
import { generateReviewToken, hashReviewToken, isReviewToken, REVIEW_INVITATION_TTL_DAYS, reviewTokenMatchesHash } from "../../lib/reviews/token.ts";
import { buildReviewUrl, extractReviewToken } from "../../lib/reviews/url.ts";

const migration = readFileSync("supabase/migrations/0030_verified_reviews.sql", "utf8");
const sqlTest = readFileSync("supabase/tests/0030_verified_reviews.sql", "utf8");
const actions = readFileSync("app/reviews/actions.ts", "utf8");
const publicPage = readFileSync("app/review/[token]/page.tsx", "utf8");
const directory = readFileSync("app/directorio/[slug]/page.tsx", "utf8");
const internalUi = readFileSync("components/appointments/review-invitation-controls.tsx", "utf8");
const appointmentPage = readFileSync("app/dashboard/appointments/[id]/page.tsx", "utf8");
const service = readFileSync("lib/server/review-invitations.ts", "utf8");
const logger = readFileSync("lib/logger.ts", "utf8");
const nextConfig = readFileSync("next.config.mjs", "utf8");

test("review tokens are 32-byte Base64URL values stored as SHA-256", () => {
  const first = generateReviewToken();
  const second = generateReviewToken();
  assert.equal(REVIEW_INVITATION_TTL_DAYS, 14);
  assert.equal(Buffer.from(first, "base64url").length, 32);
  assert.ok(isReviewToken(first));
  assert.notEqual(first, second);
  assert.match(hashReviewToken(first), /^[0-9a-f]{64}$/);
  assert.ok(reviewTokenMatchesHash(first, hashReviewToken(first)));
  assert.equal(reviewTokenMatchesHash(second, hashReviewToken(first)), false);
});

test("review URLs are canonical and contain only the one-time token", () => {
  const token = generateReviewToken();
  const url = buildReviewUrl("https://clinicontrol.test", token);
  assert.equal(url, `https://clinicontrol.test/review/${token}`);
  assert.equal(extractReviewToken(url, "https://clinicontrol.test"), token);
  assert.equal(extractReviewToken(`${url}?patient=secret`, "https://clinicontrol.test"), null);
  assert.equal(extractReviewToken(url, "https://other.test"), null);
});

test("0030 binds invitations tenant-safely and leaves legacy invitation_id nullable", () => {
  assert.match(migration, /create table public\.review_invitations/);
  assert.match(migration, /foreign key \(clinic_id, appointment_id, patient_id, doctor_user_id\)/);
  assert.match(migration, /foreign key \(clinic_id, doctor_public_profile_id, doctor_user_id\)/);
  assert.match(migration, /add column invitation_id uuid/);
  assert.doesNotMatch(migration, /alter column invitation_id set not null/);
  assert.match(migration, /interval '14 days'/);
  assert.match(migration, /extensions\.gen_random_bytes\(32\)/);
  assert.match(migration, /extensions\.digest\(convert_to\(v_token, 'UTF8'\), 'sha256'\)/);
});

test("historical ID RPCs remain explicitly revoked and unused", () => {
  for (const name of ["can_create_doctor_review_for_completed_appointment", "create_verified_doctor_review_for_completed_appointment"]) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}`));
    assert.doesNotMatch(service, new RegExp(name));
    assert.doesNotMatch(actions, new RegExp(name));
  }
});

test("public submit accepts only token rating and optional comment", () => {
  assert.match(migration, /submit_verified_review\(p_token text, p_rating integer, p_comment text default null\)/);
  const submitBlock = migration.slice(migration.indexOf("create or replace function public.submit_verified_review"), migration.indexOf("create or replace function public.list_public_doctor_reviews"));
  assert.doesNotMatch(submitBlock.split("returns boolean")[0], /clinic_id|patient_id|appointment_id|doctor_user_id|profile_id|p_verified|p_visible/);
  assert.match(submitBlock, /for update/);
  assert.match(submitBlock, /status <> 'completed'/);
  assert.match(submitBlock, /is_verified, is_visible/);
  assert.match(submitBlock, /true, true/);
  assert.match(submitBlock, /char_length\(v_comment\) > 1000/);
});

test("public directory RPC returns no internal evidence or PHI", () => {
  const block = migration.slice(migration.indexOf("create or replace function public.list_public_doctor_reviews"), migration.indexOf("-- Preserve historical signatures"));
  assert.match(block, /returns table \(rating integer, comment text, created_at timestamptz\)/);
  assert.doesNotMatch(block.split("language sql")[0], /patient_id|appointment_id|clinic_id|invitation_id|token_hash|email|metadata/);
  assert.match(block, /is_verified = true/);
  assert.match(block, /is_visible = true/);
  assert.match(directory, /whitespace-pre-wrap/);
  assert.doesNotMatch(directory, /dangerouslySetInnerHTML/);
});

test("internal UX is completed-only with generate copy email revoke and real status", () => {
  assert.match(appointmentPage, /appointment\.status === "completed"/);
  assert.match(appointmentPage, /tenant\.membership\.role === "doctor" && appointment\.doctor_id === currentUserId/);
  for (const label of ["Solicitar reseña", "Regenerar enlace", "Copiar", "Enviar email", "Revocar"]) assert.match(internalUi, new RegExp(label));
  for (const label of ["Pendiente", "Enviada", "Completada", "Revocada", "Expirada"]) assert.match(internalUi, new RegExp(label));
});

test("review email is neutral and excludes clinical or patient details", () => {
  const token = generateReviewToken();
  const message = buildReviewInvitationEmail({ clinicName: "Clínica Ficticia", doctorDisplayName: "Dra. Ejemplo", expiresAt: "2030-01-02T00:00:00Z", timeZone: "UTC", reviewUrl: buildReviewUrl("https://clinicontrol.test", token) });
  assert.match(message.html, /Clínica Ficticia/);
  assert.match(message.html, /Dra\. Ejemplo/);
  assert.match(message.html, new RegExp(token));
  assert.doesNotMatch(`${message.subject}${message.html}${message.text}`, /diagnóstico|nota médica|consentimiento|patient_id|appointment_id/i);
  assert.match(service, /failed without affecting the invitation/);
  const deliveryBlock = service.slice(service.indexOf("export async function deliverReviewInvitationEmail"));
  assert.doesNotMatch(deliveryBlock, /revokeReviewInvitation|\.delete\(/);
});

test("audit metadata and logger exclude review secrets and comments", () => {
  assert.match(migration, /review_invitation_created/);
  assert.match(migration, /review_invitation_revoked/);
  assert.match(migration, /review_email_sent/);
  assert.match(migration, /review_email_failed/);
  assert.match(migration, /verified_review_submitted/);
  assert.doesNotMatch(migration.match(/jsonb_build_object\([^;]+/g)?.join("\n") ?? "", /token|hash|comment|email/);
  assert.match(logger, /comment\|reviewText/);
});

test("SQL coverage includes real concurrent submission", () => {
  assert.match(sqlTest, /dblink_send_query/);
  assert.match(sqlTest, /dblink_get_result/);
  assert.match(sqlTest, /exactly one review/i);
  assert.match(sqlTest, /exactly one consumption/i);
});

test("public page validates the token and never requests login", () => {
  assert.match(publicPage, /getPublicReviewInvitation/);
  assert.match(publicPage, /StarRatingForm/);
  assert.doesNotMatch(publicPage, /redirect\("\/login"\)|patient|appointment title|email|phone/i);
  assert.match(nextConfig, /source: "\/review\/:path\*"/);
  assert.match(nextConfig, /Cache-Control", value: "private, no-store, max-age=0"/);
  assert.match(nextConfig, /Referrer-Policy", value: "no-referrer"/);
  assert.match(nextConfig, /X-Robots-Tag", value: "noindex, nofollow, noarchive"/);
  assert.doesNotMatch(publicPage, /searchParams|https?:\/\//);
});

test("public review failures do not disclose token lifecycle state", () => {
  const lookupBlock = migration.slice(migration.indexOf("create or replace function public.get_public_review_invitation"), migration.indexOf("create or replace function public.submit_verified_review"));
  const submitBlock = migration.slice(migration.indexOf("create or replace function public.submit_verified_review"), migration.indexOf("create or replace function public.list_public_doctor_reviews"));
  assert.doesNotMatch(lookupBlock, /select '(invalid|expired|revoked|used)'::text/);
  assert.match(lookupBlock, /'unavailable'::text/);
  assert.doesNotMatch(submitBlock, /Review link (is invalid|expired|was revoked|was already used)/);
  assert.match(submitBlock, /Review link is unavailable/);
  assert.doesNotMatch(publicPage, /venció|revocado|utilizada/);
  assert.doesNotMatch(actions, /23505|ya fue utilizado|venció|fue revocado/);
  assert.match(actions, /El enlace de reseña ya no está disponible/);
});
