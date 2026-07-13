import { brandConfig } from "@/config/brand";

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
  const candidate = value?.trim();

  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return null;
  }
}

export const domainConfig = {
  environment: getAppEnvironment(),
  localAppUrl,
  mexicoDomain: brandConfig.domains.mexico,
  internationalDomain: brandConfig.domains.international,
  stagingDomain: brandConfig.domains.staging,
  stagingAppUrl: normalizeAppUrl(process.env.APP_STAGING_URL),
  productionAppUrl: normalizeAppUrl(process.env.APP_PRODUCTION_URL)
} as const;

export function getCanonicalAppUrl() {
  const explicitBaseUrl = normalizeAppUrl(process.env.APP_BASE_URL);

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
    return `https://${process.env.VERCEL_URL}`;
  }

  return localAppUrl;
}
