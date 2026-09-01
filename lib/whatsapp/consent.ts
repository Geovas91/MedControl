import { normalizeE164 } from "./e164.ts";

export const WHATSAPP_CONSENT_SOURCES = [
  "patient_portal",
  "clinic_staff_written",
  "clinic_staff_verbal"
] as const;

export type WhatsAppConsentSource = (typeof WHATSAPP_CONSENT_SOURCES)[number];
export type WhatsAppConsentStatus = "not_set" | "opted_in" | "opted_out";

export type WhatsAppConsentPreference = {
  whatsappStatus: WhatsAppConsentStatus;
  phoneE164: string | null;
  optInAt: string | null;
  optOutAt: string | null;
  source: WhatsAppConsentSource | null;
  termsVersion: string | null;
};

export type WhatsAppConsentDecision =
  | { eligible: true; phoneE164: string }
  | { eligible: false; code: "consent_not_set" | "consent_opted_out" | "invalid_phone" | "phone_changed" | "invalid_consent" };

function validTimestamp(value: string | null) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

export function isWhatsAppOptedOut(preference: WhatsAppConsentPreference | null) {
  return preference?.whatsappStatus === "opted_out";
}

export function getWhatsAppConsentDecision(
  preference: WhatsAppConsentPreference | null,
  currentPhoneE164: string | null
): WhatsAppConsentDecision {
  if (!preference || preference.whatsappStatus === "not_set") return { eligible: false, code: "consent_not_set" };
  if (preference.whatsappStatus === "opted_out") return { eligible: false, code: "consent_opted_out" };
  const consentedPhone = normalizeE164(preference.phoneE164);
  const currentPhone = normalizeE164(currentPhoneE164);
  if (!consentedPhone || !currentPhone) return { eligible: false, code: "invalid_phone" };
  if (consentedPhone !== currentPhone) return { eligible: false, code: "phone_changed" };
  if (!validTimestamp(preference.optInAt) || preference.optOutAt !== null
    || !preference.source || !preference.termsVersion) {
    return { eligible: false, code: "invalid_consent" };
  }
  return { eligible: true, phoneE164: consentedPhone };
}

export function buildWhatsAppConsentAuditMetadata(preference: WhatsAppConsentPreference) {
  return {
    channel: "whatsapp" as const,
    status: preference.whatsappStatus,
    source: preference.source,
    terms_version: preference.termsVersion
  };
}
