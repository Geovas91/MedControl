import { getCanonicalAppUrl } from "@/config/domains";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseConfig() {
  return {
    url: supabaseUrl,
    key: supabaseKey,
    missing: [
      !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
      !supabaseKey ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY" : null
    ].filter((value): value is string => Boolean(value))
  };
}

export function hasSupabaseConfig() {
  return getSupabaseConfig().missing.length === 0;
}

export function getSupabaseConfigError() {
  const { missing } = getSupabaseConfig();

  if (missing.length === 0) {
    return null;
  }

  return `Missing Supabase environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`;
}

export function getAppBaseUrl() {
  return getCanonicalAppUrl();
}
