import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

export function createClient() {
  const { url, key } = getSupabaseConfig();

  return createBrowserClient<Database>(url!, key!);
}
