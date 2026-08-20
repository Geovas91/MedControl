import "server-only";

import { runConsentEmailDelivery, type ConsentEmailDeliveryDependencies } from "@/lib/consents/email-delivery";
import type { ConsentEmailResult } from "@/lib/consents/email";
import { getInvitationEmailConfiguration } from "@/lib/email/provider";
import { sendWithResend } from "@/lib/email/resend-provider";
import { canCreateConsent } from "@/lib/clinical-record/permissions";
import { logger } from "@/lib/logger";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canCreateWithEntitlements, getClinicEntitlements } from "@/lib/server/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

async function recordAudit(input: {
  clinicId: string;
  actorId: string;
  consentId: string;
  patientId: string;
  action: "consent_email_sent" | "consent_email_failed";
  errorCode?: string;
}) {
  try {
    const metadata = {
      consent_id: input.consentId,
      patient_id: input.patientId,
      provider: "resend",
      timestamp: new Date().toISOString(),
      ...(input.errorCode ? { error_code: input.errorCode } : {})
    };
    const result = await createAdminClient().from("audit_logs").insert({
      clinic_id: input.clinicId,
      actor_user_id: input.actorId,
      entity_type: "consent",
      entity_id: input.consentId,
      action: input.action,
      metadata
    } as never);
    if (result.error) logger.error("Consent email audit failed", { component: "consent_email", status: "audit_error", code: result.error.code, consent_id: input.consentId });
  } catch {
    logger.error("Consent email audit failed", { component: "consent_email", status: "audit_error", consent_id: input.consentId });
  }
}

export async function deliverConsentSigningEmail(input: { patientId: string; consentId: string; signingUrl: string }): Promise<ConsentEmailResult> {
  if (!isValidPatientUuid(input.patientId) || !isValidPatientUuid(input.consentId)) return { state: "not_found" };

  try {
    const dependencies: ConsentEmailDeliveryDependencies = {
      resolveContext: async () => {
        const context = await getActiveTenantContext();
        if (context.state === "unauthenticated") return { state: "unauthenticated" };
        if (context.state !== "ready" || !canCreateConsent(context.tenant.membership.role)) return { state: "forbidden" };
        if (!canCreateWithEntitlements(await getClinicEntitlements(context.tenant.clinic.id))) return { state: "forbidden" };
        return {
          state: "ready",
          clinicId: context.tenant.clinic.id,
          actorId: context.user.id,
          clinicName: context.tenant.clinic.name,
          timeZone: context.tenant.clinic.timezone
        };
      },
      loadData: async (context) => {
        const supabase = await createClient();
        const [patientResult, consentResult] = await Promise.all([
          supabase.from("patients").select("id, email").eq("id", input.patientId).eq("clinic_id", context.clinicId).maybeSingle(),
          supabase.from("consents").select("id, patient_id, status, consent_type, signing_token_hash, signing_token_expires_at, signing_token_used_at, signing_token_revoked_at").eq("id", input.consentId).eq("patient_id", input.patientId).eq("clinic_id", context.clinicId).maybeSingle()
        ]);
        if (patientResult.error || consentResult.error) return { state: "query_failed" as const };
        if (!patientResult.data || !consentResult.data) return { state: "not_found" as const };
        const patient = patientResult.data as Pick<Database["public"]["Tables"]["patients"]["Row"], "id" | "email">;
        const consent = consentResult.data as Pick<Database["public"]["Tables"]["consents"]["Row"], "id" | "patient_id" | "status" | "consent_type" | "signing_token_hash" | "signing_token_expires_at" | "signing_token_used_at" | "signing_token_revoked_at">;
        return {
          state: "ready" as const,
          data: {
            patientEmail: patient.email,
            consent: {
              id: consent.id,
              status: consent.status,
              consentType: consent.consent_type,
              signingTokenHash: consent.signing_token_hash,
              signingTokenExpiresAt: consent.signing_token_expires_at,
              signingTokenUsedAt: consent.signing_token_used_at,
              signingTokenRevokedAt: consent.signing_token_revoked_at
            }
          }
        };
      },
      getCanonicalBaseUrl: getAppBaseUrl,
      providerReady: (canonicalBaseUrl) => {
        const configuration = getInvitationEmailConfiguration();
        return configuration.state === "ready" && new URL(configuration.appBaseUrl).origin === new URL(canonicalBaseUrl).origin;
      },
      send: async (message) => {
        const configuration = getInvitationEmailConfiguration();
        if (configuration.state !== "ready") return { ok: false };
        const result = await sendWithResend(configuration, { ...message, replyTo: configuration.replyTo });
        return result.ok ? { ok: true } : { ok: false };
      },
      audit: (context, action, errorCode) => recordAudit({
        clinicId: context.clinicId,
        actorId: context.actorId,
        consentId: input.consentId,
        patientId: input.patientId,
        action,
        errorCode
      }),
      log: (level, code) => logger[level]("Consent email delivery result", {
        component: "consent_email",
        operation: "delivery",
        status: code === "unauthenticated" ? "unauthenticated" : code === "forbidden" ? "forbidden" : "failed",
        code,
        consent_id: input.consentId,
        patient_id: input.patientId
      })
    };

    return await runConsentEmailDelivery({ signingUrl: input.signingUrl }, dependencies);
  } catch {
    logger.error("Consent email delivery failed without affecting the signing link", {
      component: "consent_email",
      operation: "delivery",
      status: "failed",
      code: "unhandled_delivery_error",
      consent_id: input.consentId,
      patient_id: input.patientId
    });
    return { state: "delivery_failed" };
  }
}
