import "server-only";

import { getInvitationEmailConfiguration } from "@/lib/email/config";
import { logger } from "@/lib/logger";
import { getAppointmentAutomationLiveStatusForActiveTenant } from "@/lib/server/appointment-automation-live-status";
import { getGoogleCalendarIntegrationPageData } from "@/lib/server/google-calendar-integration";
import { getSupportContext } from "@/lib/server/support/context";
import { recordSupportDiagnosticAudit } from "@/lib/server/support/audit";
import { consumeSupportRateLimit } from "@/lib/server/support/rate-limit";
import { buildSupportLogContext } from "@/lib/support/security";
import { createStaticDiagnosticRegistry, executeRegisteredDiagnostic, isSupportDiagnosticId } from "@/lib/support/diagnostics";
import type { SafeDiagnosticResult, SupportDiagnosticId } from "@/lib/support/types";

function result(diagnosticId: SupportDiagnosticId, status: SafeDiagnosticResult["status"], code: string, verifiedAt: string, suggestedArticleSlugs: string[] = []): SafeDiagnosticResult {
  return { diagnosticId, status, code, verifiedAt, suggestedArticleSlugs };
}

export const supportDiagnosticRegistry = createStaticDiagnosticRegistry({
  session_status: async (_context, verifiedAt) => result("session_status", "healthy", "session_authenticated", verifiedAt),
  current_role: async (context, verifiedAt) => result("current_role", "healthy", `role_${context.role}`, verifiedAt),
  subscription_access: async (context, verifiedAt) => {
    const writable = context.effectiveSubscriptionStatus === "active" || context.effectiveSubscriptionStatus === "trialing";
    return result("subscription_access", writable ? "healthy" : "degraded", writable ? "subscription_writable" : "subscription_read_only", verifiedAt);
  },
  appointment_write_readiness: async (context, verifiedAt) => {
    if (context.role === "assistant") return result("appointment_write_readiness", "not_applicable", "appointment_write_role_restricted", verifiedAt, ["crear-una-cita"]);
    const writable = context.effectiveSubscriptionStatus === "active" || context.effectiveSubscriptionStatus === "trialing";
    return result("appointment_write_readiness", writable ? "healthy" : "degraded", writable ? "appointment_write_ready" : "appointment_write_subscription_restricted", verifiedAt, ["crear-una-cita"]);
  },
  member_management_readiness: async (context, verifiedAt) => {
    if (context.role !== "owner" && context.role !== "admin") return result("member_management_readiness", "not_applicable", "member_management_role_restricted", verifiedAt);
    const writable = context.effectiveSubscriptionStatus === "active" || context.effectiveSubscriptionStatus === "trialing";
    return result("member_management_readiness", writable ? "healthy" : "degraded", writable ? "member_management_ready" : "member_management_subscription_restricted", verifiedAt);
  },
  google_calendar_status: async (context, verifiedAt) => {
    if (context.role === "assistant") return result("google_calendar_status", "not_applicable", "calendar_role_not_supported", verifiedAt, ["conectar-google-calendar"]);
    const calendar = await getGoogleCalendarIntegrationPageData();
    if (calendar.state !== "ready") return result("google_calendar_status", "unavailable", "calendar_status_unavailable", verifiedAt, ["conectar-google-calendar"]);
    if (!calendar.data.configurationReady) return result("google_calendar_status", "unavailable", "calendar_configuration_unavailable", verifiedAt, ["conectar-google-calendar"]);
    if (!calendar.data.planIncludesGoogleCalendar) return result("google_calendar_status", "not_applicable", "calendar_not_entitled", verifiedAt, ["conectar-google-calendar"]);
    if (calendar.data.own?.requiresReconnect || (calendar.data.clinicSummary?.requiresReconnect ?? 0) > 0) return result("google_calendar_status", "degraded", "calendar_reconnect_required", verifiedAt, ["conectar-google-calendar"]);
    if (calendar.data.own?.status === "connected" || (calendar.data.clinicSummary?.connected ?? 0) > 0) return result("google_calendar_status", "healthy", "calendar_connected", verifiedAt, ["conectar-google-calendar"]);
    return result("google_calendar_status", "degraded", "calendar_not_connected", verifiedAt, ["conectar-google-calendar"]);
  },
  appointment_automation_status: async (_context, verifiedAt) => {
    const automation = await getAppointmentAutomationLiveStatusForActiveTenant();
    if (automation.state !== "ready") return result("appointment_automation_status", "unavailable", "appointment_automation_unavailable", verifiedAt, ["asistente-de-agenda"]);
    if (automation.data.scheduler.label === "Scheduler OK") return result("appointment_automation_status", "healthy", "appointment_automation_healthy", verifiedAt, ["asistente-de-agenda"]);
    return result("appointment_automation_status", "degraded", automation.data.scheduler.label === "Configuración incompleta" ? "appointment_automation_not_configured" : "appointment_automation_degraded", verifiedAt, ["asistente-de-agenda"]);
  },
  email_provider_readiness: async (_context, verifiedAt) => {
    const state = getInvitationEmailConfiguration().state;
    return result("email_provider_readiness", state === "ready" ? "healthy" : state === "disabled" ? "not_applicable" : "unavailable", state === "ready" ? "email_ready" : state === "disabled" ? "email_disabled" : "email_required_unavailable", verifiedAt);
  },
  feature_entitlement: async (context, verifiedAt) => result("feature_entitlement", context.entitlements.service_bot_tier1 ? "healthy" : "not_applicable", context.entitlements.service_bot_tier1 ? "service_bot_entitled" : "service_bot_not_entitled", verifiedAt)
});

export async function runSupportDiagnostic(diagnosticId: string) {
  if (!isSupportDiagnosticId(diagnosticId)) return { state: "invalid_diagnostic" as const, data: null };
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  if (!(await consumeSupportRateLimit(contextResult.context, "diagnostic"))) {
    logger.warn("Support diagnostic rate limited", buildSupportLogContext({ operation: "diagnostic", status: "rate_limited", code: "rate_limited" }));
    return { state: "rate_limited" as const, data: null };
  }
  const data = await executeRegisteredDiagnostic(supportDiagnosticRegistry, diagnosticId, contextResult.context);
  if (!data) return { state: "invalid_diagnostic" as const, data: null };
  await recordSupportDiagnosticAudit(contextResult.context, data);
  logger.info("Support diagnostic completed", buildSupportLogContext({ operation: "diagnostic", status: "success", code: data.code, diagnosticId: data.diagnosticId }));
  return { state: "ready" as const, data };
}
