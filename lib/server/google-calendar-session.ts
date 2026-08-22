import "server-only";

import { hashGoogleCalendarSessionBinding } from "@/lib/calendar/google-oauth";
import { createClient } from "@/lib/supabase/server";

export async function getGoogleCalendarSessionHash() {
  try {
    const result = await (await createClient()).auth.getClaims();
    const claims = result.data?.claims as Record<string, unknown> | undefined;
    const sessionId = claims?.session_id;
    return typeof sessionId === "string" ? hashGoogleCalendarSessionBinding(sessionId) : null;
  } catch {
    return null;
  }
}
