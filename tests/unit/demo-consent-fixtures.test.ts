import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seedPath = new URL("../../supabase/seeds/demo1_data.sql", import.meta.url);
const resetPath = new URL("../../supabase/seeds/reset_demo1_data.sql", import.meta.url);
const repairPath = new URL("../../supabase/seeds/repair_demo1_legacy_consent_fixtures.sql", import.meta.url);
const migrationPath = new URL("../../supabase/migrations/0023_consent_signed_documents.sql", import.meta.url);

test("demo consent seed contains no artificial signed evidence", async () => {
  const seed = await readFile(seedPath, "utf8");
  const consentSection = seed.slice(seed.indexOf("insert into public.consents"), seed.indexOf("insert into public.bot_settings"));

  assert.doesNotMatch(consentSection, /insert into public\.consent_signatures/i);
  assert.doesNotMatch(consentSection, /'signed'/i);
  assert.doesNotMatch(consentSection, /signature_data/i);
  assert.equal((consentSection.match(/\(consent_ids\[\d\][^\n]*'pending'/g) ?? []).length, 4);
});

test("demo reset preserves immutable-evidence guards without bypasses", async () => {
  const reset = await readFile(resetPath, "utf8");

  assert.match(reset, /Reset blocked: demo1 contains immutable clinical evidence/);
  assert.match(reset, /from public\.consent_signatures[\s\S]*consent_id = any\(consent_ids\)/);
  assert.doesNotMatch(reset, /disable\s+trigger/i);
  assert.doesNotMatch(reset, /session_replication_role/i);
  assert.doesNotMatch(reset, /alter\s+table[\s\S]*enable\s+trigger/i);
});

test("scoped demo repair validates identity and restores immutable functions", async () => {
  const repair = await readFile(repairPath, "utf8");

  assert.match(repair, /tenant_type = 'demo'/);
  assert.match(repair, /deterministic consent rows do not match/);
  assert.match(repair, /consent UUID ownership does not match/);
  assert.match(repair, /signature_data is null/);
  assert.match(repair, /CliniControl fictional seed/);
  assert.match(repair, /execute v_lifecycle_definition/);
  assert.match(repair, /execute v_signature_definition/);
  assert.doesNotMatch(repair, /disable\s+trigger/i);
  assert.doesNotMatch(repair, /session_replication_role/i);
});

test("0023 still rejects signed evidence without signature data", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /where consent\.status = 'signed'[\s\S]*signature\.signature_data is null/);
  assert.doesNotMatch(migration, /26000000-0000-4000-8000-00000000000[14]/);
});
