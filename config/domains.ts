import { brandConfig } from "@/config/brand";
import { normalizePublicOrigin } from "@/lib/auth/public-origin";

const localAppUrl = "http://localhost:3000";

export type AppEnvironment = "development" | "staging" | "production";

function getAppEnvironment(): AppEnvironment {
  const value = process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV;

  if (value === "staging" || value === "production") {
    return value;
  }

  return "development";
}

function normalizeAppUrl(value: string | undefined) {
  return normalizePublicOrigin(value);
}

function configuredOrigin(name: string, value: string | undefined) {
  if (!value?.trim()) return null;
  const origin = normalizeAppUrl(value);
  if (!origin) throw new Error(`${name} must be an HTTPS origin without a path, query, or fragment.`);
  return origin;
}

export const domainConfig = {
  environment: getAppEnvironment(),
  localAppUrl,
  mexicoDomain: brandConfig.domains.mexico,
  internationalDomain: brandConfig.domains.international,
  stagingDomain: brandConfig.domains.staging,
  stagingAppUrl: configuredOrigin("APP_STAGING_URL", process.env.APP_STAGING_URL),
  productionAppUrl: configuredOrigin("APP_PRODUCTION_URL", process.env.APP_PRODUCTION_URL)
} as const;

export function getCanonicalAppUrl() {
  const publicSiteUrl = configuredOrigin("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL);

  if (publicSiteUrl) {
    return publicSiteUrl;
  }

  const explicitBaseUrl = configuredOrigin("APP_BASE_URL", process.env.APP_BASE_URL);

  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  if (domainConfig.environment === "staging" && domainConfig.stagingAppUrl) {
    return domainConfig.stagingAppUrl;
  }

  if (domainConfig.environment === "production" && domainConfig.productionAppUrl) {
    return domainConfig.productionAppUrl;
  }

  if (process.env.VERCEL_URL) {
    return configuredOrigin("VERCEL_URL", `https://${process.env.VERCEL_URL}`)!;
  }

  if (domainConfig.environment !== "development") {
    throw new Error(`A canonical application origin is required for ${domainConfig.environment}.`);
  }

  return localAppUrl;
}
