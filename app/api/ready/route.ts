import { NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" }
  });
}

export async function GET() {
  const configuration = hasSupabaseConfig();
  if (!configuration) {
    return response({ status: "not_ready", checks: { configuration: false, database: false } }, 503);
  }

  try {
    const supabase = await createClient();
    // A successful empty result is still a connectivity success under RLS; only a transport/PostgREST error is not ready.
    const { error } = await supabase.from("clinics").select("id", { head: true }).limit(1);
    if (error) throw error;
    return response({ status: "ready", checks: { configuration: true, database: true } }, 200);
  } catch {
    logger.error("Readiness database check failed", { component: "readiness", status: "database_unavailable" });
    return response({ status: "not_ready", checks: { configuration: true, database: false } }, 503);
  }
}
