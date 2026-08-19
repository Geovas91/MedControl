import "server-only";

import { hashSigningToken, isValidSignaturePng } from "@/lib/consents/signing";
import { getPublicConsentForSigning, submitPublicConsentSignature, type PublicConsentRpcClient } from "@/lib/consents/public-signing-rpc";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export type PublicConsent = { clinicName: string; consentType: string; consentVersion: string; consentText: string; expiresAt: string };

function publicConsentRpc(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as PublicConsentRpcClient;
}

export async function getPublicConsentByToken(token: string): Promise<PublicConsent | null> {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  try {
    const supabase = await createClient();
    const result = await getPublicConsentForSigning(publicConsentRpc(supabase), hashSigningToken(token));
    if (result.error) { logger.error("Public consent lookup failed", { component: "public_consent", operation: "lookup", status: "rpc_error", code: result.error.code }); return null; }
    const row = result.data?.[0];
    return row ? { clinicName: row.clinic_name, consentType: row.consent_type, consentVersion: row.consent_version, consentText: row.consent_text, expiresAt: row.expires_at } : null;
  } catch {
    logger.error("Public consent lookup failed", { component: "public_consent", operation: "lookup", status: "unexpected_error" });
    return null;
  }
}

export async function signPublicConsent(token: string, signerName: string, signature: string, acceptedPrivacy: boolean, acceptedSensitiveData: boolean) {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token) || signerName.trim().length < 2 || signerName.trim().length > 160 || !acceptedPrivacy || !acceptedSensitiveData || !isValidSignaturePng(signature)) return { state: "invalid" as const };
  const supabase = await createClient();
  const result = await submitPublicConsentSignature(publicConsentRpc(supabase), { tokenHash: hashSigningToken(token), signerName: signerName.trim(), signature, acceptedPrivacy, acceptedSensitiveData });
  if (result.error) { logger.error("Public consent signing failed", { component: "public_consent", operation: "sign", status: "rpc_error", code: result.error.code }); return { state: "error" as const }; }
  return result.data === "signed" ? { state: "success" as const } : { state: "invalid" as const };
}
