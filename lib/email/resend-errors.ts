import type { SendEmailResult } from "@/lib/email/types";

export function classifyResendError(value: unknown): Exclude<SendEmailResult, { ok: true }> ["code"] {
  const statusCode = typeof value === "object" && value !== null && "statusCode" in value ? Number(value.statusCode) : 0;
  if (statusCode === 429) return "rate_limited";
  if (statusCode === 401 || statusCode === 403) return "misconfigured";
  if (value instanceof Error && value.name === "TimeoutError") return "timeout";
  return "provider_error";
}
