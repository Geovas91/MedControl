import type {
  AppointmentReminderVariables,
  WhatsAppLanguageCode,
  WhatsAppLogicalTemplateKey
} from "./types.ts";

const appointmentReminderVariables = ["appointment_date", "appointment_time"] as const;

export const WHATSAPP_TEMPLATE_REGISTRY = {
  appointment_reminder: {
    logicalKey: "appointment_reminder",
    languageCode: "es_MX",
    allowedVariables: appointmentReminderVariables
  }
} as const;

export function getWhatsAppTemplateDefinition(
  logicalKey: string,
  languageCode: string
) {
  if (logicalKey !== "appointment_reminder" || languageCode !== "es_MX") return null;
  return WHATSAPP_TEMPLATE_REGISTRY.appointment_reminder;
}

function safeVariable(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 100
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function validateWhatsAppTemplateVariables(
  logicalKey: WhatsAppLogicalTemplateKey,
  languageCode: WhatsAppLanguageCode,
  variables: unknown
): AppointmentReminderVariables | null {
  const definition = getWhatsAppTemplateDefinition(logicalKey, languageCode);
  if (!definition || !variables || typeof variables !== "object" || Array.isArray(variables)) return null;
  const record = variables as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const allowed = [...definition.allowedVariables].sort();
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) return null;
  if (!safeVariable(record.appointment_date) || !safeVariable(record.appointment_time)) return null;
  return {
    appointment_date: record.appointment_date,
    appointment_time: record.appointment_time
  };
}
