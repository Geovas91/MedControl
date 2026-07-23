import "server-only";

export type EmailProviderReadiness = "disabled" | "ready" | "required";

/**
 * Email delivery is intentionally not implemented in this stage. This exposes
 * readiness only, so invitation links can be copied safely until a provider is configured.
 */
export function getEmailProviderReadiness(): EmailProviderReadiness {
  const providerConfigured = Boolean(process.env.EMAIL_PROVIDER?.trim() && process.env.EMAIL_FROM?.trim());
  if (providerConfigured) return "ready";
  return process.env.EMAIL_REQUIRED === "true" ? "required" : "disabled";
}
