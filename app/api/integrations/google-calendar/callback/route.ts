import { NextResponse, type NextRequest } from "next/server";
import { getPublicAppOrigin } from "@/lib/auth/public-origin";
import {
  buildGoogleCalendarSettingsRedirectPath,
  hashGoogleCalendarOAuthState,
  isValidGoogleAuthorizationCode,
  isValidGoogleCalendarOAuthState
} from "@/lib/calendar/google-oauth";
import { canReuseEncryptedCalendarRefreshToken, encryptCalendarRefreshToken } from "@/lib/calendar/token-encryption";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getGoogleCalendarConfiguration, getGoogleCalendarRedirectOrigin } from "@/lib/server/google-calendar-config";
import { getGoogleCalendarSessionHash } from "@/lib/server/google-calendar-session";
import { exchangeGoogleCalendarAuthorizationCode, revokeGoogleCalendarToken } from "@/lib/server/google-calendar-provider";
import {
  auditGoogleCalendarEvent,
  activateGoogleCalendarIntegrationWithExistingSecret,
  consumeGoogleCalendarOAuthState,
  getGoogleCalendarIntegration,
  saveGoogleCalendarIntegration
} from "@/lib/server/google-calendar-store";
import { getRuntimePublicSiteUrl } from "@/lib/server/public-site-url";

function settingsRedirect(request: NextRequest, outcome: string) {
  const origin = getGoogleCalendarRedirectOrigin() ?? getPublicAppOrigin(request, getRuntimePublicSiteUrl());
  return NextResponse.redirect(new URL(buildGoogleCalendarSettingsRedirectPath(outcome), origin));
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
  const saved = exchanged.refreshToken
    ? await saveGoogleCalendarIntegration({
        clinicId: context.tenant.clinic.id,
        userId: context.user.id,
        encryptedRefreshToken: encryptCalendarRefreshToken(exchanged.refreshToken, configuration.encryptionKey),
        scopes: exchanged.scopes,
        connectedAt: now
      })
    : await (async () => {
        const existingResult = await getGoogleCalendarIntegration(context.tenant.clinic.id, context.user.id);
        const existing = existingResult.data;
        if (existingResult.error || !existing || !canReuseEncryptedCalendarRefreshToken(
          existing.refresh_token_encrypted,
          existing.token_encryption_version,
          configuration.encryptionKey
        )) return { data: null, error: null };
        return activateGoogleCalendarIntegrationWithExistingSecret({
          integrationId: existing.id,
          clinicId: context.tenant.clinic.id,
          userId: context.user.id,
          expectedEncryptedRefreshToken: existing.refresh_token_encrypted!,
          scopes: exchanged.scopes,
          connectedAt: now
        });
      })();
  if (saved.error || !saved.data) {
    if (exchanged.refreshToken) await revokeGoogleCalendarToken(exchanged.refreshToken);
    return settingsRedirect(request, exchanged.refreshToken ? "error" : "reconsent_required");
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
