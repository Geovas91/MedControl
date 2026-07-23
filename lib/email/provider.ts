import "server-only";

export type EmailProviderReadiness = "disabled" | "required_unavailable";

/**
 * Email delivery is intentionally not implemented in this stage. This exposes
 * readiness only. Environment values cannot enable delivery until a real provider is implemented and verified.
 */
export function getEmailProviderReadiness(): EmailProviderReadiness {
  return process.env.EMAIL_REQUIRED === "true" ? "required_unavailable" : "disabled";
}
