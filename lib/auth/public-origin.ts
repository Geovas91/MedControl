type PublicOriginRequest = {
  headers: { get(name: string): string | null };
  nextUrl: { origin: string };
};

export function normalizePublicOrigin(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp)
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function getPublicAppOrigin(
  request: PublicOriginRequest,
  configuredSiteUrl?: string
) {
  const configuredOrigin = normalizePublicOrigin(configuredSiteUrl);
  if (configuredOrigin) return configuredOrigin;

  if (configuredSiteUrl?.trim()) {
    throw new Error("The configured public application origin is invalid.");
  }

  const localOrigin = normalizePublicOrigin(request.nextUrl.origin);
  if (localOrigin && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(localOrigin).hostname)) {
    return localOrigin;
  }

  throw new Error("A canonical public application origin is required.");
}
