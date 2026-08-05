import "server-only";

// Keep this lookup dynamic so Next.js does not inline NEXT_PUBLIC_SITE_URL at build time.
const publicSiteUrlEnvironmentKey = "NEXT_PUBLIC_SITE_URL";

export function getRuntimePublicSiteUrl() {
  return process.env[publicSiteUrlEnvironmentKey];
}
