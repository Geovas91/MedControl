import { timingSafeEqual } from "node:crypto";

import { getConsentEmailAvailability, type ConsentEmailResult } from "./email.ts";
import { hashSigningToken } from "./signing-token.ts";
import { extractConsentSigningToken } from "./signing-url.ts";
import { buildConsentSigningEmail } from "../email/templates/consent-signing.ts";

type ReadyContext = {
  state: "ready";
  clinicId: string;
  actorId: string;
  clinicName: string;
  timeZone: string;
};

export type ConsentEmailData = {
  patientEmail: string | null;
  consent: {
    id: string;
    status: "pending" | "signed" | "expired" | "cancelled";
    consentType: string;
    signingTokenHash: string | null;
    signingTokenExpiresAt: string | null;
    signingTokenUsedAt: string | null;
    signingTokenRevokedAt: string | null;
  };
};

type ConsentEmailDataLoadResult =
  | { state: "ready"; data: ConsentEmailData }
  | { state: "query_failed"; query: "patient" | "consent" | "consent_token"; supabaseErrorCode: string }
  | { state: "not_found" };

type SafeQueryResult<T> = { data: T | null; errorCode?: string };

export async function loadConsentEmailData(queries: {
  patient: () => Promise<SafeQueryResult<{ email: string | null }>>;
  consent: () => Promise<SafeQueryResult<Omit<ConsentEmailData["consent"], "signingTokenHash">>>;
  consentTokenHash: () => Promise<SafeQueryResult<{ signingTokenHash: string | null }>>;
}): Promise<ConsentEmailDataLoadResult> {
  const [patient, consent] = await Promise.all([queries.patient(), queries.consent()]);
  if (patient.errorCode) return { state: "query_failed", query: "patient", supabaseErrorCode: patient.errorCode };
  if (consent.errorCode) return { state: "query_failed", query: "consent", supabaseErrorCode: consent.errorCode };
  if (!patient.data || !consent.data) return { state: "not_found" };

  const token = await queries.consentTokenHash();
  if (token.errorCode) return { state: "query_failed", query: "consent_token", supabaseErrorCode: token.errorCode };
  if (!token.data) return { state: "not_found" };
  return {
    state: "ready",
    data: {
      patientEmail: patient.data.email,
      consent: { ...consent.data, signingTokenHash: token.data.signingTokenHash }
    }
  };
}

export type ConsentEmailDeliveryDependencies = {
  resolveContext: () => Promise<ReadyContext | { state: "unauthenticated" } | { state: "forbidden" }>;
  loadData: (context: ReadyContext) => Promise<ConsentEmailDataLoadResult>;
  getCanonicalBaseUrl: () => string;
  providerReady: (canonicalBaseUrl: string) => boolean;
  send: (input: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) => Promise<{ ok: true } | { ok: false }>;
  audit: (context: ReadyContext, action: "consent_email_sent" | "consent_email_failed", errorCode?: string) => Promise<void>;
  log: (level: "info" | "warn" | "error", code: string, context?: { supabaseErrorCode?: string }) => void;
};

export async function runConsentEmailDelivery(
  input: { signingUrl: string },
  dependencies: ConsentEmailDeliveryDependencies
): Promise<ConsentEmailResult> {
  const context = await dependencies.resolveContext();
  if (context.state === "unauthenticated") {
    dependencies.log("info", "unauthenticated");
    return { state: "unauthenticated" };
  }
  if (context.state === "forbidden") {
    dependencies.log("warn", "forbidden");
    return { state: "forbidden" };
  }

  const loaded = await dependencies.loadData(context);
  if (loaded.state === "query_failed") {
    const code = `${loaded.query}_query_failed`;
    dependencies.log("error", code, { supabaseErrorCode: loaded.supabaseErrorCode });
    await dependencies.audit(context, "consent_email_failed", code);
    return { state: "query_failed" };
  }
  if (loaded.state === "not_found") return { state: "not_found" };

  const { consent, patientEmail } = loaded.data;
  const canonicalBaseUrl = dependencies.getCanonicalBaseUrl();
  const token = extractConsentSigningToken(input.signingUrl, canonicalBaseUrl);
  const preliminary = getConsentEmailAvailability({
    status: consent.status,
    patientEmail,
    signingUrl: token ? input.signingUrl : undefined,
    signingTokenExpiresAt: consent.signingTokenExpiresAt,
    signingTokenUsedAt: consent.signingTokenUsedAt,
    signingTokenRevokedAt: consent.signingTokenRevokedAt
  });

  if (!preliminary.available) {
    const state = preliminary.reason === "missing_email" ? "missing_recipient" : preliminary.reason === "missing_url" ? "invalid_link" : "invalid_state";
    dependencies.log("warn", state);
    await dependencies.audit(context, "consent_email_failed", state);
    return { state };
  }

  const candidateHash = token ? hashSigningToken(token) : "";
  if (!consent.signingTokenHash || candidateHash.length !== consent.signingTokenHash.length || !timingSafeEqual(Buffer.from(candidateHash), Buffer.from(consent.signingTokenHash))) {
    dependencies.log("warn", "invalid_link");
    await dependencies.audit(context, "consent_email_failed", "invalid_link");
    return { state: "invalid_link" };
  }

  if (!dependencies.providerReady(canonicalBaseUrl)) {
    dependencies.log("error", "provider_unavailable");
    await dependencies.audit(context, "consent_email_failed", "provider_unavailable");
    return { state: "provider_unavailable" };
  }

  const template = buildConsentSigningEmail({
    clinicName: context.clinicName,
    consentType: consent.consentType,
    expiresAt: consent.signingTokenExpiresAt!,
    timeZone: context.timeZone,
    signingUrl: preliminary.signingUrl
  });
  const delivery = await dependencies.send({
    to: preliminary.recipient,
    ...template,
    idempotencyKey: `consent-${consent.id}-${Date.parse(consent.signingTokenExpiresAt!)}`
  });
  if (!delivery.ok) {
    dependencies.log("error", "resend_delivery_failed");
    await dependencies.audit(context, "consent_email_failed", "resend_delivery_failed");
    return { state: "delivery_failed" };
  }

  await dependencies.audit(context, "consent_email_sent");
  return { state: "sent", recipient: preliminary.recipient };
}
