import "server-only";

import { parseWhatsAppOutboundEnabled } from "@/lib/whatsapp/config";

export const WHATSAPP_SERVER_ENV_KEYS = [
  "WHATSAPP_OUTBOUND_ENABLED",
  "WHATSAPP_PROVIDER",
  "WHATSAPP_GRAPH_API_VERSION",
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_APP_SECRET",
  "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "META_WHATSAPP_WABA_ID",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TOKEN_ENCRYPTION_KEY"
] as const;

export function isWhatsAppOutboundEnabled(value = process.env.WHATSAPP_OUTBOUND_ENABLED) {
  return parseWhatsAppOutboundEnabled(value);
}
