import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const ignoredDirectories = new Set(["node_modules", ".next", ".git", "dist", "out"]);

const oldBrandTerms = [
  ["Med", "Control"].join(""),
  ["med", "control"].join(""),
  ["MED", "CONTROL"].join(""),
  ["Med", " ", "Control"].join(""),
  ["med", "-", "control"].join(""),
  ["med", "_", "control"].join("")
];

const oldBrandPattern = new RegExp(oldBrandTerms.map(escapeRegExp).join("|"), "gi");

const repositoryUrl = ["https://github.com/Geovas91/", "Med", "Control.git"].join("");
const migrationFilename = ["0001_initial_", "med", "control", "_schema.sql"].join("");
const migrationPath = ["supabase/migrations/", migrationFilename].join("");
const syncDirectionValue = ["med", "control", "_to_provider"].join("");

const allowedPathReferences = [
  {
    path: migrationPath,
    reason: "Applied migration filename retained for historical compatibility."
  }
];

const allowedContentReferences = [
  {
    path: "docs/DONWEB_CLOUDPANEL_RUNBOOK.md",
    snippet: repositoryUrl,
    reason: "Real GitHub repository URL retained until the repository is renamed."
  },
  {
    path: "docs/STAGING_DEPLOY.md",
    snippet: migrationFilename,
    reason: "Historical migration filename retained for staging deployment checks."
  },
  {
    path: migrationPath,
    snippet: syncDirectionValue,
    reason: "Persisted integration direction value retained for compatibility."
  }
];

const violations = [];
const authorizedReferences = [];

for (const absolutePath of walk(rootDir)) {
  const relativePath = normalizePath(path.relative(rootDir, absolutePath));
  checkPath(relativePath);
  checkContent(relativePath, absolutePath);
}

if (violations.length > 0) {
  console.error("Brand audit failed. Unauthorized historical brand references found:");

  for (const violation of violations) {
    const location = violation.line ? `${violation.path}:${violation.line}` : violation.path;
    console.error(`- ${location} (${violation.type}) ${violation.value ?? ""}`);
  }

  process.exit(1);
}

console.log("Brand audit passed. No unauthorized historical brand references found.");

if (authorizedReferences.length > 0) {
  console.log("Authorized technical references:");

  for (const reference of authorizedReferences) {
    const location = reference.line ? `${reference.path}:${reference.line}` : reference.path;
    console.log(`- ${location}: ${reference.reason}`);
  }
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Supabase CLI writes the linked-project metadata here; it is ignored by Git and not application source.
      const isSupabaseTemporaryDirectory = entry.name === ".temp" && normalizePath(path.relative(rootDir, directory)) === "supabase";
      if (!ignoredDirectories.has(entry.name) && !isSupabaseTemporaryDirectory) {
        yield* walk(path.join(directory, entry.name));
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    const stats = statSync(absolutePath);

    if (stats.size > 10 * 1024 * 1024) {
      continue;
    }

    yield absolutePath;
  }
}

function checkPath(relativePath) {
  oldBrandPattern.lastIndex = 0;

  if (!oldBrandPattern.test(relativePath)) {
    return;
  }

  const allowed = allowedPathReferences.find((reference) => reference.path === relativePath);

  if (allowed) {
    authorizedReferences.push({
      type: "path",
      path: relativePath,
      reason: allowed.reason
    });
    return;
  }

  violations.push({
    type: "path",
    path: relativePath,
    value: relativePath
  });
}

function checkContent(relativePath, absolutePath) {
  const lines = readFileSync(absolutePath, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    oldBrandPattern.lastIndex = 0;

    if (!oldBrandPattern.test(line)) {
      return;
    }

    const allowed = allowedContentReferences.find((reference) => {
      return reference.path === relativePath && line.includes(reference.snippet);
    });

    if (allowed) {
      authorizedReferences.push({
        type: "content",
        path: relativePath,
        line: index + 1,
        reason: allowed.reason
      });
      return;
    }

    violations.push({
      type: "content",
      path: relativePath,
      line: index + 1,
      value: line.trim()
    });
  });
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
