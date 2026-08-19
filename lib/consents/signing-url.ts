export function buildConsentSigningUrl(token: string, baseUrl: string) {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
    throw new Error("Invalid consent signing token.");
  }

  return new URL(`/consent/sign/${token}`, baseUrl).toString();
}

export function extractConsentSigningToken(signingUrl: string, baseUrl: string) {
  try {
    const candidate = new URL(signingUrl);
    const canonical = new URL(baseUrl);
    const match = /^\/consent\/sign\/([A-Za-z0-9_-]{40,})$/.exec(candidate.pathname);

    if (
      candidate.origin !== canonical.origin
      || candidate.username
      || candidate.password
      || candidate.search
      || candidate.hash
      || !match
    ) return null;

    return match[1];
  } catch {
    return null;
  }
}
