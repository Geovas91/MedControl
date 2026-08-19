export function buildConsentSigningUrl(token: string, baseUrl: string) {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
    throw new Error("Invalid consent signing token.");
  }

  return new URL(`/consent/sign/${token}`, baseUrl).toString();
}
