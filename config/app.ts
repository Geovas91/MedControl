import { brandConfig } from "@/config/brand";

export type PublicAppEnvironment = "development" | "staging" | "production";

function normalizeEnvironment(value: string | undefined): PublicAppEnvironment {
  if (value === "staging" || value === "production") {
    return value;
  }

  return "development";
}

export const appConfig = {
  serviceName: brandConfig.appName,
  version: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "0.1.0-beta",
  environment: normalizeEnvironment(process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV),
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || brandConfig.supportEmail,
  paypalEnvironmentLabel: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"
} as const;

export function getPublicVersionLabel() {
  return `${appConfig.serviceName} · v${appConfig.version} · ${appConfig.environment}`;
}
