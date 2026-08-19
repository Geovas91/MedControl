import "server-only";

import { timingSafeEqual } from "crypto";

import { getConsentEmailAvailability } from "@/lib/consents/email";
import { hashSigningToken } from "@/lib/consents/signing";
import { extractConsentSigningToken } from "@/lib/consents/signing-url";
import { getInvitationEmailConfiguration } from "@/lib/email/provider";
import { sendWithResend } from "@/lib/email/resend-provider";
import { buildConsentSigningEmail } from "@/lib/email/templates/consent-signing";
import { canCreateConsent } from "@/lib/clinical-record/permissions";
import { logger } from "@/lib/logger";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { canCreateWithEntitlements, getClinicEntitlements } from "@/lib/server/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type ConsentEmailResult =
  | { state: "sent"; recipient: string }
  | { state: "missing_recipient" | "invalid_link" | "invalid_state" | "forbidden" | "unauthenticated" | "not_found" | "failed" };

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
  try {
    return await deliverConsentSigningEmailInternal(input);
  } catch {
    logger.error("Consent email delivery failed without affecting the signing link", { component: "consent_email", status: "unhandled_delivery_error" });
    return { state: "failed" };
  }
}

async function deliverConsentSigningEmailInternal(input: { patientId: string; consentId: string; signingUrl: string }): Promise<ConsentEmailResult> {
  if (!isValidPatientUuid(input.patientId) || !isValidPatientUuid(input.consentId)) return { state: "not_found" };
  const context = await getActiveTenantContext();
  if (context.state === "unauthenticated") return { state: "unauthenticated" };
  if (context.state !== "ready" || !canCreateConsent(context.tenant.membership.role)) return { state: "forbidden" };
  if (!canCreateWithEntitlements(await getClinicEntitlements(context.tenant.clinic.id))) return { state: "forbidden" };

  const clinicId = context.tenant.clinic.id;
  const supabase = await createClient();
  const [patientResult, consentResult] = await Promise.all([
    supabase.from("patients").select("id, email").eq("id", input.patientId).eq("clinic_id", clinicId).maybeSingle(),
    supabase.from("consents").select("id, patient_id, status, consent_type, signing_token_hash, signing_token_expires_at, signing_token_used_at, signing_token_revoked_at").eq("id", input.consentId).eq("patient_id", input.patientId).eq("clinic_id", clinicId).maybeSingle()
  ]);
  if (patientResult.error || consentResult.error) return { state: "failed" };
  if (!patientResult.data || !consentResult.data) return { state: "not_found" };

  const patient = patientResult.data as Pick<Database["public"]["Tables"]["patients"]["Row"], "id" | "email">;
  const consent = consentResult.data as Pick<Database["public"]["Tables"]["consents"]["Row"], "id" | "patient_id" | "status" | "consent_type" | "signing_token_hash" | "signing_token_expires_at" | "signing_token_used_at" | "signing_token_revoked_at">;
  const canonicalBaseUrl = getAppBaseUrl();
  const token = extractConsentSigningToken(input.signingUrl, canonicalBaseUrl);
  const preliminary = getConsentEmailAvailability({
    status: consent.status,
    patientEmail: patient.email,
    signingUrl: token ? input.signingUrl : undefined,
    signingTokenExpiresAt: consent.signing_token_expires_at,
    signingTokenUsedAt: consent.signing_token_used_at,
    signingTokenRevokedAt: consent.signing_token_revoked_at
  });
  if (!preliminary.available) {
    if (preliminary.reason === "missing_email") return { state: "missing_recipient" };
    if (preliminary.reason === "missing_url") return { state: "invalid_link" };
    return { state: "invalid_state" };
  }
  const candidateHash = token ? hashSigningToken(token) : "";
  if (!consent.signing_token_hash || candidateHash.length !== consent.signing_token_hash.length || !timingSafeEqual(Buffer.from(candidateHash), Buffer.from(consent.signing_token_hash))) {
    return { state: "invalid_link" };
  }

  const configuration = getInvitationEmailConfiguration();
  if (configuration.state !== "ready" || new URL(configuration.appBaseUrl).origin !== new URL(canonicalBaseUrl).origin) {
    await recordAudit({ clinicId, actorId: context.user.id, consentId: consent.id, patientId: input.patientId, action: "consent_email_failed", errorCode: "provider_unavailable" });
    return { state: "failed" };
  }
  const template = buildConsentSigningEmail({
    clinicName: context.tenant.clinic.name,
    consentType: consent.consent_type,
    expiresAt: consent.signing_token_expires_at!,
    timeZone: context.tenant.clinic.timezone,
    signingUrl: preliminary.signingUrl
  });
  const delivery = await sendWithResend(configuration, {
    to: preliminary.recipient,
    ...template,
    replyTo: configuration.replyTo,
    idempotencyKey: `consent-${consent.id}-${Date.parse(consent.signing_token_expires_at!)}`
  });
  if (!delivery.ok) {
    await recordAudit({ clinicId, actorId: context.user.id, consentId: consent.id, patientId: input.patientId, action: "consent_email_failed", errorCode: delivery.code });
    return { state: "failed" };
  }
  await recordAudit({ clinicId, actorId: context.user.id, consentId: consent.id, patientId: input.patientId, action: "consent_email_sent" });
  return { state: "sent", recipient: preliminary.recipient };
}
