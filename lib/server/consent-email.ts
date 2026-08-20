import "server-only";

import { loadConsentEmailData, runConsentEmailDelivery, type ConsentEmailDeliveryDependencies } from "@/lib/consents/email-delivery";
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
        return loadConsentEmailData({
          patient: async () => {
            const result = await supabase.from("patients").select("id, email").eq("id", input.patientId).eq("clinic_id", context.clinicId).maybeSingle();
            if (result.error) return { data: null, errorCode: result.error.code || "unknown" };
            const patient = result.data as Pick<Database["public"]["Tables"]["patients"]["Row"], "id" | "email"> | null;
            return { data: patient ? { email: patient.email } : null };
          },
          consent: async () => {
            const result = await supabase.from("consents").select("id, patient_id, status, consent_type, signing_token_expires_at, signing_token_used_at, signing_token_revoked_at").eq("id", input.consentId).eq("patient_id", input.patientId).eq("clinic_id", context.clinicId).maybeSingle();
            if (result.error) return { data: null, errorCode: result.error.code || "unknown" };
            const consent = result.data as Pick<Database["public"]["Tables"]["consents"]["Row"], "id" | "patient_id" | "status" | "consent_type" | "signing_token_expires_at" | "signing_token_used_at" | "signing_token_revoked_at"> | null;
            return { data: consent ? {
              id: consent.id,
              status: consent.status,
              consentType: consent.consent_type,
              signingTokenExpiresAt: consent.signing_token_expires_at,
              signingTokenUsedAt: consent.signing_token_used_at,
              signingTokenRevokedAt: consent.signing_token_revoked_at
            } : null };
          },
          consentTokenHash: async () => {
            const result = await createAdminClient().from("consents").select("signing_token_hash").eq("id", input.consentId).eq("patient_id", input.patientId).eq("clinic_id", context.clinicId).maybeSingle();
            if (result.error) return { data: null, errorCode: result.error.code || "unknown" };
            const consent = result.data as Pick<Database["public"]["Tables"]["consents"]["Row"], "signing_token_hash"> | null;
            return { data: consent ? { signingTokenHash: consent.signing_token_hash } : null };
          }
        });
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
      log: (level, code, safeContext) => logger[level]("Consent email delivery result", {
        component: "consent_email",
        operation: "delivery",
        status: code === "unauthenticated" ? "unauthenticated" : code === "forbidden" ? "forbidden" : "failed",
        code,
        ...(safeContext?.supabaseErrorCode ? { supabase_error_code: safeContext.supabaseErrorCode } : {}),
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
