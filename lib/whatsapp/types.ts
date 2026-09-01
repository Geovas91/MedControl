export const WHATSAPP_DELIVERY_STATUSES = [
  "sending",
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
  "delivery_unknown"
] as const;

export type WhatsAppDeliveryStatus = (typeof WHATSAPP_DELIVERY_STATUSES)[number];
export type WhatsAppLogicalTemplateKey = "appointment_reminder";
export type WhatsAppLanguageCode = "es_MX";

export type AppointmentReminderVariables = {
  appointment_date: string;
  appointment_time: string;
};

export type SendTemplateInput = {
  providerAccountId: string;
  recipientE164: string;
  logicalTemplate: "appointment_reminder";
  languageCode: "es_MX";
  variables: AppointmentReminderVariables;
};

export type WhatsAppProviderErrorCode =
  | "provider_not_enabled"
  | "provider_not_configured"
  | "invalid_recipient"
  | "invalid_template"
  | "invalid_variables"
  | "rate_limited"
  | "provider_rejected"
  | "provider_unavailable"
  | "signature_invalid"
  | "payload_invalid"
  | "unknown_status";

export type SendTemplateResult =
  | { state: "accepted"; providerMessageId: string }
  | { state: "rejected"; code: WhatsAppProviderErrorCode; retryable: boolean }
  | { state: "delivery_unknown"; code: "provider_unavailable" };

export type WhatsAppProviderStatus = "sent" | "delivered" | "read" | "failed";

export type WhatsAppWebhookStatusEvent = {
  kind: "status";
  wabaId: string;
  phoneNumberId: string;
  providerMessageId: string;
  providerStatus: WhatsAppProviderStatus;
  occurredAt: string;
  errorCode: WhatsAppProviderErrorCode | null;
};

export type WhatsAppWebhookEvent = WhatsAppWebhookStatusEvent;

export type WhatsAppProviderReadiness =
  | { state: "disabled"; code: "provider_not_enabled" }
  | { state: "unavailable"; code: "provider_not_configured" }
  | { state: "ready" };

export interface WhatsAppProvider {
  sendTemplateMessage(input: SendTemplateInput): Promise<SendTemplateResult>;
  verifyWebhook(rawBody: Uint8Array, headers: Headers): boolean;
  parseWebhook(rawBody: Uint8Array): WhatsAppWebhookEvent[];
  mapProviderStatus(status: string): WhatsAppDeliveryStatus | null;
  getReadiness(): WhatsAppProviderReadiness;
}
