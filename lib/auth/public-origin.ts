type PublicOriginRequest = {
  headers: { get(name: string): string | null };
  nextUrl: { origin: string };
};

export function normalizePublicOrigin(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function normalizeHeaderOrigin(protocol: string | null, host: string | null) {
  const normalizedProtocol = protocol?.toLowerCase();
  const normalizedHost = host?.trim();

  if (!normalizedHost || (normalizedProtocol !== "http" && normalizedProtocol !== "https")) {
    return null;
  }

  if (/[\s/@?#\\,]/.test(normalizedHost)) {
    return null;
  }

  const origin = normalizePublicOrigin(`${normalizedProtocol}://${normalizedHost}`);
  return origin;
}

export function getPublicAppOrigin(
  request: PublicOriginRequest,
  configuredSiteUrl?: string
) {
  const configuredOrigin = normalizePublicOrigin(configuredSiteUrl);
  if (configuredOrigin) return configuredOrigin;

  const hasConfiguredSiteUrl = Boolean(configuredSiteUrl?.trim());
  if (!hasConfiguredSiteUrl) {
    const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
    const forwardedProtocol = firstForwardedValue(request.headers.get("x-forwarded-proto"));
    const forwardedOrigin = normalizeHeaderOrigin(forwardedProtocol, forwardedHost);
    if (forwardedOrigin) return forwardedOrigin;

    const requestOrigin = normalizePublicOrigin(request.nextUrl.origin);
    const requestProtocol = requestOrigin ? new URL(requestOrigin).protocol.slice(0, -1) : null;
    const hostOrigin = normalizeHeaderOrigin(forwardedProtocol ?? requestProtocol, request.headers.get("host"));
    if (hostOrigin) return hostOrigin;
  }

  const fallbackOrigin = normalizePublicOrigin(request.nextUrl.origin);
  if (!fallbackOrigin) {
    throw new Error("Unable to determine a safe public application origin.");
  }

  return fallbackOrigin;
}
