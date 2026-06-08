import fs from "node:fs";
import path from "node:path";

const ENV_LOCAL_PATH = path.join(process.cwd(), ".env.local");

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL_PATH)) {
    return;
  }

  const fileContents = fs.readFileSync(ENV_LOCAL_PATH, "utf8");

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function maskSecret(value) {
  if (!value) {
    return "(missing)";
  }

  if (value.length <= 12) {
    return `${value.slice(0, 3)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const publicKeyVariable = publishableKey
  ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  : anonKey
    ? "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    : undefined;
const publicKey = publishableKey || anonKey;
const errors = [];

if (!supabaseUrl) {
  errors.push("Missing NEXT_PUBLIC_SUPABASE_URL.");
} else {
  if (!supabaseUrl.startsWith("https://")) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must start with https://.");
  }

  if (!supabaseUrl.includes(".supabase.co")) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must contain .supabase.co.");
  }

  if (supabaseUrl.includes("/rest/v1")) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must be the project base URL, without /rest/v1.");
  }
}

if (!publicKey) {
  errors.push(
    "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

const projectType = supabaseUrl?.includes(".supabase.co")
  ? "online Supabase project"
  : "local or unknown project";

console.log(`Supabase URL: ${supabaseUrl || "(missing)"}`);
console.log(`Project type: ${projectType}`);
console.log(`Public key variable used: ${publicKeyVariable || "(missing)"}`);
console.log(`Masked public key: ${maskSecret(publicKey)}`);

if (errors.length > 0) {
  console.error("\nSupabase configuration errors:");

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exitCode = 1;
}
