import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const roots = ["app", "components"];
const ignored = new Set([".git", ".next", "dist", "node_modules", "out"]);
const forbidden = ["@/lib/supabase/admin", "SUPABASE_SERVICE_ROLE_KEY", "createAdminClient"];
const failures = [];

function walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) inspect(path);
  }
}

function inspect(path) {
  const source = readFileSync(path, "utf8");
  if (!/^\s*["']use client["'];/m.test(source)) return;
  for (const value of forbidden) {
    if (source.includes(value)) failures.push(`${path}: Client Component must not reference ${value}`);
  }
}

for (const root of roots) walk(root);

const adminHelper = "lib/supabase/admin.ts";
if (!existsSync(adminHelper) || !readFileSync(adminHelper, "utf8").includes('import "server-only"')) {
  failures.push(`${adminHelper}: must be protected with server-only`);
}

if (failures.length) {
  console.error("Server-only admin audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Server-only admin audit passed.");
