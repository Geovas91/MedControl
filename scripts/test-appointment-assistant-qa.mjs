import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const unsupported = process.argv.slice(2).filter((arg) => arg !== "--unit");
if (unsupported.length) {
  console.error("Usage: node scripts/test-appointment-assistant-qa.mjs [--unit]");
  process.exit(2);
}

const suiteFiles = readdirSync("tests/unit")
  .filter((name) => /^appointment-assistant-.*\.test\.ts$/.test(name))
  .sort()
  .map((name) => `tests/unit/${name}`);

if (!suiteFiles.length) {
  console.error("No Appointment Assistant unit suites found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  "--import", "./scripts/test/register-typescript-imports.mjs",
  "--experimental-strip-types",
  "--test",
  ...suiteFiles
], { stdio: "inherit" });

process.exit(result.status ?? 1);
