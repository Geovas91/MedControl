import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../lib/server/professional-slots.ts", import.meta.url), "utf8");

test("slot helper derives the clinic from the active authenticated tenant", () => {
  assert.match(source, /getActiveTenantContext/);
  assert.match(source, /p_clinic_id: context\.tenant\.clinic\.id/);
  assert.doesNotMatch(source, /createAdminClient|service_role/);
});

test("slot helper keeps date, duration, step and buffers explicit", () => {
  assert.match(source, /p_local_date: input\.localDate/);
  assert.match(source, /p_duration_minutes: input\.durationMinutes/);
  assert.match(source, /p_slot_interval_minutes: input\.slotIntervalMinutes/);
  assert.match(source, /p_buffer_before_minutes/);
  assert.match(source, /p_buffer_after_minutes/);
});
