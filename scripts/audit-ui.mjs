import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["app", "components"];
const ignored = new Set([".git", ".next", "dist", "node_modules", "out"]);
const clinicalDirectories = ["components/clinical-record", "components/consents", "components/payments"];
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
  const normalized = path.replaceAll("\\", "/");
  const clientComponent = /^\s*["']use client["'];/m.test(source);

  if (clinicalDirectories.some((directory) => normalized.startsWith(directory)) && /\bglass-(?:panel|nav|toolbar)\b/.test(source)) {
    failures.push(`${normalized}: glass utilities are prohibited on clinical, consent, and payment surfaces`);
  }
  if (clientComponent && /@\/lib\/supabase\/admin|@\/lib\/server\/(?:active-tenant|invitation-email|invitation-email-delivery-store)|SUPABASE_SERVICE_ROLE_KEY|createAdminClient/.test(source)) {
    failures.push(`${normalized}: Client Component references a server-only helper or service-role credential`);
  }
  if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(source)) {
    failures.push(`${normalized}: image is missing an alt attribute`);
  }
  if (/overflow-x-visible/.test(source)) {
    failures.push(`${normalized}: overflow-x-visible can reintroduce horizontal overflow`);
  }
  if (/metadata\s*=\s*{[^}]*\b(?:patient|diagnosis|consent|medical_note)\b/i.test(source)) {
    failures.push(`${normalized}: metadata appears to contain clinical data`);
  }
}

for (const root of roots) walk(root);

const globals = "app/globals.css";
if (!existsSync(globals)) failures.push("app/globals.css: Clinical Soft Glass tokens are missing");
else {
  const css = readFileSync(globals, "utf8");
  for (const token of ["--background", "--surface", "--clinic", "--shadow-glass", "--radius-md", ".glass-panel", "@media print"]) {
    if (!css.includes(token)) failures.push(`${globals}: missing required design token or fallback ${token}`);
  }
}

if (failures.length) {
  console.error("UI audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`UI audit passed for ${roots.map((root) => relative(".", root)).join(", ")}.`);
