const safeCodePattern = /^[a-z][a-z0-9_]{0,63}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeSupportCode(value: string) {
  return safeCodePattern.test(value);
}

export function isSupportUuid(value: string) {
  return uuidPattern.test(value);
}

export function normalizeSupportText(value: string, maxLength: number) {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

export function buildSupportLogContext(input: {
  operation: "kb_search" | "diagnostic" | "ticket_create" | "ticket_update";
  status: "success" | "failed" | "rate_limited";
  code: string;
  diagnosticId?: string;
}) {
  return {
    component: "support_bot" as const,
    operation: input.operation,
    status: input.status,
    code: isSafeSupportCode(input.code) ? input.code : "invalid_code",
    ...(input.diagnosticId && isSafeSupportCode(input.diagnosticId) ? { diagnostic_id: input.diagnosticId } : {})
  };
}
