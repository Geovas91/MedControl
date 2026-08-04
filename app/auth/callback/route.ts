import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfigError } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { buildAuthRedirect, getGoogleOAuthErrorMessage, getPostAuthRedirect, getSafeLocalPath } from "@/lib/auth/redirects";
import { syncAuthUserProfile } from "@/lib/auth/profile";

function loginRedirect(origin: string, next: string, error: string) {
  return NextResponse.redirect(new URL(buildAuthRedirect("/login", { next, error }), origin));
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeLocalPath(requestUrl.searchParams.get("next"), "");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    logger.warn("Auth callback received OAuth provider error", {
      component: "auth",
      status: "provider_error",
      provider_error: oauthError
    });

    return loginRedirect(
      requestUrl.origin,
      next,
      getGoogleOAuthErrorMessage(oauthError, requestUrl.searchParams.get("error_description"))
    );
  }

  if (!code) {
    logger.warn("Auth callback missing code", {
      component: "auth",
      status: "invalid_callback"
    });

    return loginRedirect(requestUrl.origin, next, "El callback de autenticación no es válido o ya expiró.");
  }

  const configError = getSupabaseConfigError();
  if (configError) {
    logger.warn("Auth callback configuration unavailable", {
      component: "auth",
      status: "degraded"
    });

    return loginRedirect(requestUrl.origin, next, configError);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn("Auth callback session exchange failed", {
      component: "auth",
      status: "exchange_failed"
    });

    return loginRedirect(requestUrl.origin, next, "No fue posible validar el acceso. Solicita un enlace nuevo o intenta nuevamente.");
  }

  const user = data.user ?? data.session?.user;
  if (!user) {
    logger.warn("Auth callback session has no user", {
      component: "auth",
      status: "invalid_session"
    });
    return loginRedirect(requestUrl.origin, next, "No fue posible completar la sesión de usuario.");
  }

  const { profile, error: profileError } = await syncAuthUserProfile(supabase, user);
  if (profileError || !profile) {
    logger.warn("Auth callback profile synchronization failed", {
      component: "auth",
      status: "profile_sync_failed",
      error_code: profileError?.code
    });
    return loginRedirect(requestUrl.origin, next, "No fue posible preparar tu perfil. Intenta nuevamente.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("clinic_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    logger.warn("Auth callback clinic lookup failed", {
      component: "auth",
      status: "clinic_lookup_failed",
      error_code: membershipError.code
    });
  }

  const destination = getPostAuthRedirect({
    next,
    profileComplete: Boolean(profile.full_name && profile.email),
    hasClinic: Boolean(membership) && !membershipError
  });

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
