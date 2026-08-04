export function getSafeLocalPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value) {
    return fallback;
  }

  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || /[\u0000-\u001F\u007F]/.test(candidate)) {
    return fallback;
  }

  try {
    const baseUrl = new URL("https://clinicontrol.invalid");
    const parsed = new URL(candidate, baseUrl);

    if (parsed.origin !== baseUrl.origin) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function isInvitationPath(value: string) {
  return /^\/invite\/[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function buildGoogleOAuthCallbackUrl(origin: string, next?: string | null) {
  const callbackUrl = new URL("/auth/callback", origin);
  const safeNext = getSafeLocalPath(next, "");

  if (safeNext) {
    callbackUrl.searchParams.set("next", safeNext);
  }

  return callbackUrl.toString();
}

export function getGoogleOAuthErrorMessage(error: string | null | undefined, description?: string | null) {
  if (error === "access_denied") {
    return "El acceso con Google fue cancelado.";
  }

  const providerError = `${error ?? ""} ${description ?? ""}`;
  if (/provider.+(disabled|not enabled|unavailable)|unsupported provider/i.test(providerError)) {
    return "Google no está disponible como proveedor de acceso en este momento.";
  }

  return "No fue posible completar el acceso con Google. Intenta nuevamente.";
}

export function getPostAuthRedirect(options: {
  next?: string | null;
  profileComplete: boolean;
  hasClinic: boolean;
}) {
  const next = getSafeLocalPath(options.next, "");

  if (isInvitationPath(next) || next === "/reset-password" || next.startsWith("/reset-password?")) {
    return next;
  }

  if (!options.profileComplete || !options.hasClinic) {
    return "/onboarding";
  }

  return next || "/dashboard";
}

export function buildAuthRedirect(
  path: "/login" | "/register" | "/forgot-password" | "/reset-password",
  options: { next?: string | null; error?: string; message?: string }
) {
  const params = new URLSearchParams();
  const next = getSafeLocalPath(options.next, "");

  if (next) params.set("next", next);
  if (options.error) params.set("error", options.error);
  if (options.message) params.set("message", options.message);

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
