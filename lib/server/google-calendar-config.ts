import "server-only";

import { parseCalendarTokenEncryptionKey } from "@/lib/calendar/token-encryption";

const environmentKeys = {
  clientId: "GOOGLE_CALENDAR_CLIENT_ID",
  clientSecret: "GOOGLE_CALENDAR_CLIENT_SECRET",
  redirectUri: "GOOGLE_CALENDAR_REDIRECT_URI",
  encryptionKey: "CALENDAR_TOKEN_ENCRYPTION_KEY"
} as const;

function validRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return url.pathname === "/api/integrations/google-calendar/callback"
      && !url.search
      && !url.hash
      && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  } catch {
    return false;
  }
}

export function getGoogleCalendarRedirectOrigin() {
  const redirectUri = process.env[environmentKeys.redirectUri]?.trim();
  return redirectUri && validRedirectUri(redirectUri) ? new URL(redirectUri).origin : null;
}
export function getGoogleCalendarConfiguration() {
  const clientId = process.env[environmentKeys.clientId]?.trim();
  const clientSecret = process.env[environmentKeys.clientSecret]?.trim();
  const redirectUri = process.env[environmentKeys.redirectUri]?.trim();
  const encryptionKey = parseCalendarTokenEncryptionKey(process.env[environmentKeys.encryptionKey]?.trim());

  if (!clientId || !clientSecret || !redirectUri || !validRedirectUri(redirectUri) || !encryptionKey) {
    return { state: "unavailable" as const };
  }

  return { state: "ready" as const, clientId, clientSecret, redirectUri, encryptionKey };
}
