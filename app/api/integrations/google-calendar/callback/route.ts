import { NextResponse, type NextRequest } from "next/server";
import { getPublicAppOrigin } from "@/lib/auth/public-origin";
import {
  hashGoogleCalendarOAuthState,
  isValidGoogleAuthorizationCode,
  isValidGoogleCalendarOAuthState
} from "@/lib/calendar/google-oauth";
import { encryptCalendarRefreshToken } from "@/lib/calendar/token-encryption";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getGoogleCalendarConfiguration } from "@/lib/server/google-calendar-config";
import { getGoogleCalendarSessionHash } from "@/lib/server/google-calendar-session";
import { exchangeGoogleCalendarAuthorizationCode, revokeGoogleCalendarToken } from "@/lib/server/google-calendar-provider";
import {
  auditGoogleCalendarEvent,
  consumeGoogleCalendarOAuthState,
  saveGoogleCalendarIntegration
} from "@/lib/server/google-calendar-store";
import { getRuntimePublicSiteUrl } from "@/lib/server/public-site-url";

function settingsRedirect(request: NextRequest, outcome: string) {
  const origin = getPublicAppOrigin(request, getRuntimePublicSiteUrl());
  return NextResponse.redirect(new URL(`/dashboard/settings/integrations?google=${outcome}`, origin));
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("error")) return settingsRedirect(request, "cancelled");
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  if (!isValidGoogleCalendarOAuthState(state) || !isValidGoogleAuthorizationCode(code)) return settingsRedirect(request, "invalid_callback");
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
  if (!sessionHash) return settingsRedirect(request, "invalid_state");
  const now = new Date().toISOString();
  const consumed = await consumeGoogleCalendarOAuthState({
    clinicId: context.tenant.clinic.id,
    userId: context.user.id,
    sessionHash,
    stateHash: hashGoogleCalendarOAuthState(state!),
    now
  });
  if (consumed.error || !consumed.consumed) return settingsRedirect(request, "invalid_state");
  const exchanged = await exchangeGoogleCalendarAuthorizationCode({
    code: code!,
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    redirectUri: configuration.redirectUri
  });
  if (!exchanged.ok) {
    if (exchanged.refreshTokenToRevoke) await revokeGoogleCalendarToken(exchanged.refreshTokenToRevoke);
    return settingsRedirect(request, "exchange_failed");
  }
  const encryptedRefreshToken = encryptCalendarRefreshToken(exchanged.refreshToken, configuration.encryptionKey);
  const saved = await saveGoogleCalendarIntegration({
    clinicId: context.tenant.clinic.id,
    userId: context.user.id,
    encryptedRefreshToken,
    scopes: exchanged.scopes,
    connectedAt: now
  });
  if (saved.error || !saved.data) {
    await revokeGoogleCalendarToken(exchanged.refreshToken);
    return settingsRedirect(request, "error");
  }
  await auditGoogleCalendarEvent({
    clinicId: context.tenant.clinic.id,
    actorUserId: context.user.id,
    entityId: saved.data.id,
    action: "calendar_connected",
    metadata: { provider: "google", scope: "calendar.events.owned" }
  });
  return settingsRedirect(request, "connected");
}
