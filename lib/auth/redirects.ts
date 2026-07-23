export function getSafeLocalPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  return value;
}

export function isInvitationPath(value: string) {
  return /^\/invite\/[A-Za-z0-9_-]+$/.test(value);
}
