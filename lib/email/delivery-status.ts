import type { InvitationEmailDeliveryStatus, SendEmailResult } from "@/lib/email/types";

export function getInvitationDeliveryStatus(result: SendEmailResult): InvitationEmailDeliveryStatus {
  if (result.ok) return "sent";
  if (result.code === "disabled") return "disabled";
  if (result.code === "timeout") return "delivery_unknown";
  return "failed";
}
