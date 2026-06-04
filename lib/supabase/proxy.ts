import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  const { url, key, missing } = getSupabaseConfig();

  if (missing.length > 0) {
    return NextResponse.next({
      request
    });
  }

  let supabaseResponse = NextResponse.next({
    request
  });

  const supabase = createServerClient<Database>(
    url!,
    key!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  // Use getClaims() for server-side auth checks and token refresh once protected routes are enabled.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
