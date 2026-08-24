import { NextResponse, type NextRequest } from "next/server";
import {
  GOOGLE_CALENDAR_OAUTH_STATE_TTL_MS,
  buildGoogleCalendarSettingsRedirectPath,
  buildGoogleCalendarAuthorizationUrl,
  createGoogleCalendarOAuthState as createOAuthState
} from "@/lib/calendar/google-oauth";
import { getPublicAppOrigin } from "@/lib/auth/public-origin";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getGoogleCalendarConfiguration, getGoogleCalendarRedirectOrigin } from "@/lib/server/google-calendar-config";
import { getGoogleCalendarSessionHash } from "@/lib/server/google-calendar-session";
import { createGoogleCalendarOAuthState } from "@/lib/server/google-calendar-store";
import { getRuntimePublicSiteUrl } from "@/lib/server/public-site-url";

function settingsRedirect(request: NextRequest, outcome: string) {
  const origin = getGoogleCalendarRedirectOrigin() ?? getPublicAppOrigin(request, getRuntimePublicSiteUrl());
  return NextResponse.redirect(new URL(buildGoogleCalendarSettingsRedirectPath(outcome), origin));
}

export async function GET(request: NextRequest) {
  const context = await getActiveTenantContext();
  if (context.state === "unauthenticated") {
    return NextResponse.redirect(new URL("/login", getPublicAppOrigin(request, getRuntimePublicSiteUrl())));
  }
  if (context.state !== "ready" || !["owner", "admin", "doctor"].includes(context.tenant.membership.role)) {
    return settingsRedirect(request, "forbidden");
  }
  const configuration = getGoogleCalendarConfiguration();
  if (configuration.state !== "ready") return settingsRedirect(request, "unavailable");
  const sessionHash = await getGoogleCalendarSessionHash();
  if (!sessionHash) return settingsRedirect(request, "error");
  const oauthState = createOAuthState();
  const created = await createGoogleCalendarOAuthState({
    clinicId: context.tenant.clinic.id,
    userId: context.user.id,
    sessionHash,
    stateHash: oauthState.stateHash,
    expiresAt: new Date(Date.now() + GOOGLE_CALENDAR_OAUTH_STATE_TTL_MS).toISOString()
  });
  if (created.error) return settingsRedirect(request, "error");
  return NextResponse.redirect(buildGoogleCalendarAuthorizationUrl({
    clientId: configuration.clientId,
    redirectUri: configuration.redirectUri,
    state: oauthState.state
  }));
}
