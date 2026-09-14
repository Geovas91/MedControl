import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../lib/server/professional-availability.ts", import.meta.url), "utf8");
const formSource = readFileSync(new URL("../../components/settings/professional-availability-form.tsx", import.meta.url), "utf8");

test("weekly availability lookup uses the effective-date RPC", () => {
  assert.match(source, /get_professional_availability_week/);
  assert.match(source, /p_effective_date:\s*today/);
  assert.doesNotMatch(source, /get_professional_availability_for_date/);
  assert.match(source, /week\[row\.weekday\]\.push/);
});

test("availability lookup keeps the clinic-member identity and safe error logging", () => {
  assert.match(source, /p_clinic_member_id:\s*allowed/);
  assert.match(source, /operation: "get_week"/);
  assert.match(source, /code: result\.error\.code/);
});

test("successful saves refresh the client router so persisted intervals are reloaded", () => {
  assert.match(formSource, /useRouter/);
  assert.match(formSource, /state\.state === "success"/);
  assert.match(formSource, /router\.refresh\(\)/);
});
