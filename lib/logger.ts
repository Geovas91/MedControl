type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const sensitiveKeyPattern = /password|token|secret|authorization|cookie|medicalNote|diagnosis|patientName|email|phone/i;
const redacted = "[redacted]";

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    return sanitizeContext(value as LogContext);
  }

  return value;
}

export function sanitizeContext(context: LogContext = {}) {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, sensitiveKeyPattern.test(key) ? redacted : sanitizeValue(value)])
  );
}

function write(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context: context ? sanitizeContext(context) : undefined
  };

  if (process.env.NODE_ENV === "development") {
    const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    consoleMethod(payload);
    return;
  }

  console.log(JSON.stringify(payload));
}

export const logger = {
  info(message: string, context?: LogContext) {
    write("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    write("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    write("error", message, context);
  }
};
