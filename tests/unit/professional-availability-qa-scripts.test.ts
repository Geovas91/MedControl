import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(script: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, "--dry-run", ...args], { encoding: "utf8" });
}

test("professional availability QA seed dry-run is complete and write-free", () => {
  const result = run("scripts/qa/seed-professional-availability-demo.mjs");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /NO READS, NO WRITES/);
  assert.match(result.stdout, /6 doctors, 30 weekday rules, no weekends/);
  assert.equal((result.stdout.match(/CliniControl QA (Norte|Sur): qa\.doctor/g) ?? []).length, 6);
});

test("professional availability QA cleanup dry-run is exact and write-free", () => {
  const result = run("scripts/qa/cleanup-professional-availability-demo.mjs");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /NO READS, NO WRITES/);
  assert.match(result.stdout, /Cleanup refuses incompatible rules/);
  assert.match(result.stdout, /never touches appointments or exceptions/);
});

test("professional availability cleanup local dry-run is offline and target-labeled", () => {
  const result = run("scripts/qa/cleanup-professional-availability-demo.mjs", "--local");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /NO READS, NO WRITES/);
  assert.match(result.stdout, /CliniControl QA Norte/);
  assert.match(result.stdout, /CliniControl QA Sur/);
  assert.equal((result.stdout.match(/remove only exact/g) ?? []).length, 6);
});
