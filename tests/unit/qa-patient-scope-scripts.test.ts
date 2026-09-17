import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("QA Patient Scope dataset defines two tenant-isolated groups with 18 manual assignments", () => {
  const output = execFileSync(process.execPath, ["scripts/qa/seed-patient-scope-demo.mjs", "--dry-run"], { encoding: "utf8" });
  assert.match(output, /20 synthetic patients; NO READS, NO WRITES/);
  assert.equal((output.match(/QA Patient [NS]-D[123]-\d{2}/g) ?? []).length, 18);
  assert.match(output, /QA Patient N-Unassigned -> unassigned/);
  assert.match(output, /QA Patient S-Unassigned -> unassigned/);
  assert.match(output, /clinic_members\.id, source=manual; no appointments are planned/);
});
