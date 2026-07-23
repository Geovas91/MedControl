import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfigError } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

function getSafeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/dashboard";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeRedirectPath(requestUrl.searchParams.get("next"));

  const configError = getSupabaseConfigError();
  if (configError) {
    logger.warn("Auth callback configuration unavailable", {
      component: "auth",
      status: "degraded"
    });

    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(configError)}`, requestUrl.origin)
    );
  }

  if (!code) {
    logger.warn("Auth callback missing code", {
      component: "auth",
      status: "invalid_callback"
    });

    return NextResponse.redirect(new URL("/login?error=Missing%20auth%20callback%20code.", requestUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn("Auth callback session exchange failed", {
      component: "auth",
      status: "exchange_failed"
    });

    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
