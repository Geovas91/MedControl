import "server-only";

import {
  GOOGLE_CALENDAR_REVOCATION_ENDPOINT,
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_CALENDAR_TOKEN_ENDPOINT,
  hasRequiredGoogleCalendarScope,
  parseGrantedGoogleCalendarScopes
} from "@/lib/calendar/google-oauth";
import { classifyGoogleCalendarFailure, isSafeGoogleEventId, type GoogleCalendarEventPayload } from "@/lib/calendar/google-event";

type FetchImplementation = typeof fetch;

type GoogleTokenSuccess = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  token_type?: unknown;
};

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function accessTokenFrom(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const token = (value as GoogleTokenSuccess).access_token;
  return typeof token === "string" && token.length > 0 && token.length <= 8192 ? token : null;
}

export async function exchangeGoogleCalendarAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImplementation?: FetchImplementation;
}) {
  const request = input.fetchImplementation ?? fetch;
  let response: Response;
  try {
    response = await request(GOOGLE_CALENDAR_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code"
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store"
    });
  } catch {
    return { ok: false as const, code: "exchange_failed", refreshTokenToRevoke: null };
  }
  const body = await readJson(response);
  const accessToken = accessTokenFrom(body);
  const refreshToken = body && typeof body === "object" ? (body as GoogleTokenSuccess).refresh_token : null;
  const scopes = parseGrantedGoogleCalendarScopes(body && typeof body === "object" ? (body as GoogleTokenSuccess).scope : null);

  if (!response.ok || !accessToken || typeof refreshToken !== "string" || refreshToken.length === 0 || refreshToken.length > 8192 || !hasRequiredGoogleCalendarScope(scopes)) {
    return {
      ok: false as const,
      code: response.ok ? "invalid_token_response" : "exchange_failed",
      refreshTokenToRevoke: typeof refreshToken === "string" && refreshToken.length > 0 && refreshToken.length <= 8192 ? refreshToken : null
    };
  }

  return { ok: true as const, accessToken, refreshToken, scopes };
}

export async function refreshGoogleCalendarAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImplementation?: FetchImplementation;
}) {
  const request = input.fetchImplementation ?? fetch;
  let response: Response;
  try {
    response = await request(GOOGLE_CALENDAR_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: input.refreshToken,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "refresh_token"
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store"
    });
  } catch {
    return { ok: false as const, code: "refresh_failed" };
  }
  const accessToken = accessTokenFrom(await readJson(response));
  if (!response.ok || !accessToken) {
    return { ok: false as const, code: response.status === 400 || response.status === 401 ? "reconnect_required" : "refresh_failed" };
  }
  return { ok: true as const, accessToken };
}

export async function revokeGoogleCalendarToken(refreshToken: string, fetchImplementation: FetchImplementation = fetch) {
  try {
    const response = await fetchImplementation(GOOGLE_CALENDAR_REVOCATION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store"
    });
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}

async function googleEventRequest(input: {
  accessToken: string;
  method: "POST" | "PATCH" | "DELETE";
  eventId?: string;
  payload?: GoogleCalendarEventPayload;
  fetchImplementation?: FetchImplementation;
}) {
  const request = input.fetchImplementation ?? fetch;
  const eventPath = input.eventId ? `/${encodeURIComponent(input.eventId)}` : "";
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events${eventPath}?sendUpdates=none`;
  let response: Response;
  try {
    response = await request(url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.payload ? { "Content-Type": "application/json" } : {})
      },
      ...(input.payload ? { body: JSON.stringify(input.payload) } : {}),
      signal: AbortSignal.timeout(8000),
      cache: "no-store"
    });
  } catch {
    return { ok: false as const, code: "network_failure" as const };
  }

  if (input.method === "DELETE" && (response.ok || response.status === 404 || response.status === 410)) {
    return { ok: true as const, eventId: input.eventId! };
  }
  const body = await readJson(response);
  if (response.status === 409) return { ok: false as const, code: "event_exists" as const };
  if (!response.ok) return { ok: false as const, code: classifyGoogleCalendarFailure(response.status) };
  const eventId = body && typeof body === "object" ? (body as { id?: unknown }).id : null;
  if (!isSafeGoogleEventId(eventId)) return { ok: false as const, code: "invalid_provider_response" as const };
  return { ok: true as const, eventId };
}

export function createGoogleCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  payload: GoogleCalendarEventPayload;
  fetchImplementation?: FetchImplementation;
}) {
  return googleEventRequest({
    accessToken: input.accessToken,
    payload: { id: input.eventId, ...input.payload } as GoogleCalendarEventPayload,
    fetchImplementation: input.fetchImplementation,
    method: "POST"
  });
}

export function updateGoogleCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  payload: GoogleCalendarEventPayload;
  fetchImplementation?: FetchImplementation;
}) {
  return googleEventRequest({ ...input, method: "PATCH" });
}

export function deleteGoogleCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  fetchImplementation?: FetchImplementation;
}) {
  return googleEventRequest({ ...input, method: "DELETE" });
}

export const googleCalendarProviderScope = GOOGLE_CALENDAR_SCOPE;
