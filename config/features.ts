export const featureFlags = {
  demoConsentEnabled: process.env.NEXT_PUBLIC_ENABLE_DEMO_CONSENT === "true"
} as const;
