export function getSafeLocalPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  return value;
}

export function isInvitationPath(value: string) {
  return /^\/invite\/[A-Za-z0-9_-]{1,128}$/.test(value);
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
