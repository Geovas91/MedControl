import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../lib/server/appointment-lifecycle.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/0046_appointment_lifecycle.sql", import.meta.url), "utf8");

test("lifecycle helper calls the guarded RPC with the active tenant", () => {
  assert.match(source, /mutate_appointment_lifecycle_for_current_user/);
  assert.match(source, /p_clinic_id: context\.tenant\.clinic\.id/);
  assert.match(source, /p_appointment_id: input\.appointmentId/);
  assert.match(source, /p_expected_status: input\.expectedStatus/);
});

test("lifecycle helper exposes safe conflict and stale-state outcomes", () => {
  assert.match(source, /code === "23P01"/);
  assert.match(source, /code === "40001"/);
  assert.match(source, /error_code: result\.error\.code/);
  assert.doesNotMatch(source, /message: result\.error\.message/);
});

test("lifecycle migration records only minimal scheduling events", () => {
  assert.match(migration, /event_type in \('created', 'confirmed', 'cancelled', 'rescheduled'\)/);
  assert.match(migration, /old_starts_at/);
  assert.match(migration, /new_ends_at/);
  assert.match(migration, /revoke all on table public\.appointment_events from public, anon, authenticated/);
});
