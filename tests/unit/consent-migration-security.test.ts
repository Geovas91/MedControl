import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration0022 = readFileSync(
  new URL("../../supabase/migrations/0022_consent_integrity_and_lifecycle.sql", import.meta.url),
  "utf8"
);
const resetDemo1 = readFileSync(new URL("../../supabase/seeds/reset_demo1_data.sql", import.meta.url), "utf8");

const forbiddenBypasses = /disable\s+trigger|enable\s+trigger|session_replication_role|alter\s+table[\s\S]{0,120}\sdisable\b/i;

test("demo1 reset blocks every immutable clinical state before deletes", () => {
  const guardEnd = resetDemo1.indexOf("Reset blocked: demo1 contains immutable clinical evidence.");
  const firstDelete = resetDemo1.search(/^delete\s+from/im);

  assert.ok(guardEnd >= 0, "immutable-evidence reset error is missing");
  assert.ok(firstDelete > guardEnd, "immutable-evidence guard must run before the first delete");
  assert.match(resetDemo1, /from public\.consent_signatures[\s\S]+consent_id = any\(consent_ids\)/i);
  assert.match(resetDemo1, /from public\.consents[\s\S]+status in \('signed', 'cancelled'\)/i);
  assert.match(resetDemo1, /from public\.medical_notes[\s\S]+status = 'finalized'/i);
  assert.match(resetDemo1, /Use a full local Supabase reset to regenerate the demo dataset\./);
});

test("demo1 reset retains a deletion path for mutable-only datasets", () => {
  assert.match(resetDemo1, /delete from public\.consents/i);
  assert.match(resetDemo1, /delete from public\.medical_notes/i);
  assert.match(resetDemo1, /delete from public\.patients/i);
  assert.doesNotMatch(resetDemo1, forbiddenBypasses);
});

test("PR consent SQL introduces no trigger or replication bypass", () => {
  assert.doesNotMatch(migration0022, forbiddenBypasses);
  assert.doesNotMatch(resetDemo1, forbiddenBypasses);
});

test("0022 SECURITY DEFINER functions keep fixed search paths and explicit grants", () => {
  const definitions = [...migration0022.matchAll(/create or replace function\s+public\.([a-z0-9_]+)\([\s\S]*?\n\$\$;/gi)]
    .map((match) => ({ name: match[1], sql: match[0] }))
    .filter(({ sql }) => /security definer/i.test(sql));

  assert.equal(definitions.length, 5);
  for (const definition of definitions) {
    assert.match(definition.sql, /set search_path = public, pg_temp/i, `${definition.name} lacks a fixed search_path`);
  }

  for (const name of [
    "create_consent_for_current_user",
    "issue_consent_signing_link_for_current_user",
    "revoke_consent_signing_link_for_current_user",
    "cancel_consent_for_current_user"
  ]) {
    assert.match(migration0022, new RegExp(`revoke all on function public\\.${name}\\(`, "i"));
    assert.match(migration0022, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]+to authenticated`, "i"));
  }

  assert.match(migration0022, /revoke all on function public\.sign_public_consent\([\s\S]+from public/i);
  assert.match(migration0022, /grant execute on function public\.sign_public_consent\([\s\S]+to anon, authenticated/i);
});


test("0058 private clinical RPCs require patient scope and public signing is unchanged", () => {
  const sql = readFileSync("supabase/migrations/0058_align_ics_consent_authority.sql", "utf8");
  const clinical = sql.slice(0, sql.indexOf("create or replace function public.mutate_appointment_lifecycle"));
  assert.equal((clinical.match(/has_patient_professional_scope\(p_clinic_id, p_patient_id\)/g) ?? []).length, 6);
  assert.doesNotMatch(clinical, /has_clinic_role|has_clinic_professional/);
  assert.doesNotMatch(sql, /create or replace function public\.(get_public_consent_for_signing|sign_public_consent)|alter table.*disable/);
});
