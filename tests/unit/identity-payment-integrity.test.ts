import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0036_identity_payments_integrity.sql", "utf8");
const members = readFileSync("lib/supabase/clinic-members.ts", "utf8");
const paymentWriter = readFileSync("lib/server/create-payment.ts", "utf8");

test("runtime no longer exposes the profile-email legacy enrollment helper", () => {
  assert.doesNotMatch(members, /add_clinic_member_by_email_for_current_user|addClinicMemberByEmailToClinic/);
  assert.match(members, /create_clinic_member_invitation_for_current_user/);
});

test("0036 disables legacy enrollment and uses verified auth identity for modern acceptance", () => {
  assert.match(migration, /revoke all on function public\.add_clinic_member_by_email_for_current_user[\s\S]*from public, anon, authenticated/i);
  const modern = migration.slice(migration.indexOf("create or replace function public.create_clinic_member_invitation"));
  assert.doesNotMatch(modern, /join public\.profiles/);
  assert.match(modern, /join auth\.users/);
  assert.match(modern, /u\.email_confirmed_at/);
  assert.match(modern, /v_email_confirmed_at is null/);
});

test("0036 prechecks historical inconsistencies and installs composite tenant FKs", () => {
  for (const code of ["appointment_patient_cross_clinic", "payment_patient_cross_clinic", "payment_appointment_cross_clinic", "payment_patient_appointment_mismatch"]) {
    assert.match(migration, new RegExp(code));
  }
  assert.match(migration, /foreign key \(clinic_id,patient_id\)[\s\S]*references public\.patients\(clinic_id,id\)/i);
  assert.match(migration, /foreign key \(clinic_id,appointment_id,patient_id\)[\s\S]*references public\.appointments\(clinic_id,id,patient_id\)/i);
  assert.doesNotMatch(migration, /(?:alter|insert into|update|delete from) public\.clinic_subscriptions|paypal_billing_intents/i);
});

test("clinical payment writer derives clinic server-side and keeps SQL errors generic", () => {
  assert.match(paymentWriter, /const clinicId = context\.tenant\.clinic\.id/);
  assert.match(paymentWriter, /\.eq\("clinic_id", clinicId\)/);
  assert.match(paymentWriter, /clinic_id: clinicId/);
  assert.match(paymentWriter, /code: insertResult\.error\.code/);
  assert.match(paymentWriter, /No fue posible registrar el pago\. Intenta nuevamente\./);
  assert.doesNotMatch(paymentWriter, /insertResult\.error\.message/);
});
