const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const ALLOWED_INPUT_PATTERN = /^\+[0-9() .-]+$/;

export function normalizeE164(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ALLOWED_INPUT_PATTERN.test(trimmed)) return null;
  const canonical = `+${trimmed.slice(1).replace(/[() .-]/g, "")}`;
  return E164_PATTERN.test(canonical) ? canonical : null;
}

export function isCanonicalE164(value: string | null | undefined): value is string {
  return typeof value === "string" && E164_PATTERN.test(value);
}
