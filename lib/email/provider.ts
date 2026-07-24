import "server-only";

export { getInvitationEmailConfiguration } from "@/lib/email/config";
import { getInvitationEmailConfiguration } from "@/lib/email/config";

export type EmailProviderReadiness = "disabled" | "ready" | "required_unavailable";

/**
 * Readiness is derived from the implemented Resend integration and validated server-only configuration.
 */
export function getEmailProviderReadiness(): EmailProviderReadiness {
  return getInvitationEmailConfiguration().state;
}
