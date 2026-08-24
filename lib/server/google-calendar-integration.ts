import "server-only";

import { decryptCalendarRefreshToken } from "@/lib/calendar/token-encryption";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getGoogleCalendarConfiguration } from "@/lib/server/google-calendar-config";
import { revokeGoogleCalendarToken } from "@/lib/server/google-calendar-provider";
import {
  auditGoogleCalendarEvent,
  clearGoogleCalendarIntegration,
  getGoogleCalendarIntegration
} from "@/lib/server/google-calendar-store";
import { createClient } from "@/lib/supabase/server";

type SafeStatusRow = {
  user_id: string;
  status: "connected" | "disconnected" | "expired" | "failed";
  connected_at: string | null;
  last_sync_at: string | null;
  last_error_code: string | null;
};

type SafeStatusClient = {
  rpc(
    fn: "list_google_calendar_integration_status_for_current_user",
    args: { p_clinic_id: string }
  ): Promise<{ data: SafeStatusRow[] | null; error: { code?: string } | null }>;
};

export type GoogleCalendarIntegrationPageData = {
  role: "owner" | "admin" | "doctor" | "assistant";
  configurationReady: boolean;
  canConnectOwn: boolean;
  own: {
    status: "connected" | "disconnected" | "expired" | "failed";
    connectedAt: string | null;
    lastSyncAt: string | null;
    requiresReconnect: boolean;
  } | null;
  clinicSummary: { connected: number; requiresReconnect: number } | null;
};

export async function getGoogleCalendarIntegrationPageData() {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state as "unauthenticated" | "no_active_membership" | "error", data: null };
  const role = context.tenant.membership.role;
  const canConnectOwn = role === "owner" || role === "admin" || role === "doctor";
  if (!canConnectOwn) {
    return {
      state: "ready" as const,
      data: { role, configurationReady: getGoogleCalendarConfiguration().state === "ready", canConnectOwn: false, own: null, clinicSummary: null }
    };
  }
  const statusResult = await (await createClient() as unknown as SafeStatusClient).rpc(
    "list_google_calendar_integration_status_for_current_user",
    { p_clinic_id: context.tenant.clinic.id }
  );
  if (statusResult.error) return { state: "error" as const, data: null };
  const statuses = statusResult.data ?? [];
  const own = statuses.find((item) => item.user_id === context.user.id) ?? null;
  let clinicSummary: GoogleCalendarIntegrationPageData["clinicSummary"] = null;
  if (role === "owner" || role === "admin") {
    clinicSummary = {
      connected: statuses.filter((item) => item.status === "connected").length,
      requiresReconnect: statuses.filter((item) => item.status === "expired" || item.status === "failed").length
    };
  }
  return {
    state: "ready" as const,
    data: {
      role,
      configurationReady: getGoogleCalendarConfiguration().state === "ready",
      canConnectOwn,
      own: own ? {
        status: own.status,
        connectedAt: own.connected_at,
        lastSyncAt: own.last_sync_at,
        requiresReconnect: own.status === "expired" || own.status === "failed"
      } : null,
      clinicSummary
    } satisfies GoogleCalendarIntegrationPageData
  };
}

export async function disconnectOwnGoogleCalendarIntegration() {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state };
  if (!["owner", "admin", "doctor"].includes(context.tenant.membership.role)) return { state: "forbidden" as const };
  const integrationResult = await getGoogleCalendarIntegration(context.tenant.clinic.id, context.user.id);
  const integration = integrationResult.data;
  if (integrationResult.error) return { state: "error" as const };
  if (!integration) return { state: "success" as const };

  const configuration = getGoogleCalendarConfiguration();
  if (configuration.state === "ready" && integration.refresh_token_encrypted) {
    try {
      const refreshToken = decryptCalendarRefreshToken(integration.refresh_token_encrypted, configuration.encryptionKey);
      await revokeGoogleCalendarToken(refreshToken);
    } catch {
      // Revocation is best-effort; local invalidation remains authoritative.
    }
  }
  const cleared = await clearGoogleCalendarIntegration({
    integrationId: integration.id,
    clinicId: context.tenant.clinic.id,
    userId: context.user.id,
    status: "disconnected",
    errorCode: null,
    revokedAt: new Date().toISOString()
  });
  if (cleared.error) return { state: "error" as const };
  await auditGoogleCalendarEvent({
    clinicId: context.tenant.clinic.id,
    actorUserId: context.user.id,
    entityId: integration.id,
    action: "calendar_disconnected",
    metadata: { provider: "google" }
  });
  return { state: "success" as const };
}
