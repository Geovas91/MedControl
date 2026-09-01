import "server-only";

import { isWhatsAppOutboundEnabled } from "@/lib/server/whatsapp/config";
import type {
  SendTemplateInput,
  SendTemplateResult,
  WhatsAppDeliveryStatus,
  WhatsAppProvider,
  WhatsAppProviderReadiness,
  WhatsAppWebhookEvent
} from "@/lib/whatsapp/types";

const providerStatusMap: Record<string, WhatsAppDeliveryStatus> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed"
};

export class MetaWhatsAppCloudProvider implements WhatsAppProvider {
  getReadiness(): WhatsAppProviderReadiness {
    if (!isWhatsAppOutboundEnabled()) return { state: "disabled", code: "provider_not_enabled" };
    return { state: "unavailable", code: "provider_not_configured" };
  }

  async sendTemplateMessage(_input: SendTemplateInput): Promise<SendTemplateResult> {
    const readiness = this.getReadiness();
    return readiness.state === "disabled"
      ? { state: "rejected", code: "provider_not_enabled", retryable: false }
      : { state: "rejected", code: "provider_not_configured", retryable: false };
  }

  verifyWebhook(_rawBody: Uint8Array, _headers: Headers) {
    return false;
  }

  parseWebhook(_rawBody: Uint8Array): WhatsAppWebhookEvent[] {
    return [];
  }

  mapProviderStatus(status: string) {
    return providerStatusMap[status] ?? null;
  }
}
