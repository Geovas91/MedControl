import type { SafeDiagnosticResult, SupportIntent, SupportTicketCategory, SupportTicketSeverity, SupportTicketStatus } from "./types.ts";

export const supportCategoryLabels: Record<SupportTicketCategory, string> = {
  how_to: "Cómo usar CliniControl", authentication: "Acceso y sesión", appointments: "Citas", members: "Miembros",
  configuration: "Configuración", google_calendar: "Google Calendar", appointment_assistant: "Asistente de agenda",
  email: "Correo", billing: "Facturación", other: "Otro"
};

export const supportStatusLabels: Record<SupportTicketStatus, string> = {
  open: "Abierto", triaged: "En triage", in_progress: "En progreso", waiting_user: "Esperando usuario", resolved: "Resuelto", closed: "Cerrado"
};

export const supportSeverityLabels: Record<SupportTicketSeverity, string> = { low: "Baja", normal: "Normal", high: "Alta" };

export const diagnosticStatusLabels: Record<SafeDiagnosticResult["status"], string> = {
  healthy: "Operando correctamente", degraded: "Requiere atención", unavailable: "No disponible", not_applicable: "No aplica"
};

export const diagnosticLabels: Record<SafeDiagnosticResult["diagnosticId"], string> = {
  session_status: "Sesión", current_role: "Rol", subscription_access: "Suscripción",
  appointment_write_readiness: "Disponibilidad para citas", member_management_readiness: "Administración de miembros",
  google_calendar_status: "Google Calendar", appointment_automation_status: "Asistente de agenda",
  email_provider_readiness: "Disponibilidad de correo", feature_entitlement: "Acceso a la función"
};

export const supportIntentMessages: Record<SupportIntent, string> = {
  create_appointment: "Te mostramos los pasos para crear una cita y verificamos si la función está disponible.",
  reschedule_appointment: "Te mostramos cómo reprogramar una cita y verificamos la disponibilidad de cambios.",
  cancel_appointment: "Te mostramos cómo cancelar una cita y verificamos la disponibilidad de cambios.",
  manage_members: "Revisa la guía y el estado de permisos para administrar miembros.",
  login_problem: "Verificamos el estado de tu sesión y reunimos la ayuda disponible.",
  email_problem: "Verificamos si las funciones de correo están disponibles.",
  google_calendar_problem: "Revisa la guía y el estado seguro de Google Calendar.",
  appointment_assistant_problem: "Revisa la guía y el estado agregado del Asistente de agenda.",
  subscription_question: "Verificamos el acceso efectivo de la suscripción activa.",
  configuration_question: "Consulta la ayuda disponible para la configuración indicada.",
  feature_explanation: "Estos artículos explican las funciones relacionadas.",
  clinical_question: "Este asistente sólo brinda soporte técnico de CliniControl. No puede orientar sobre diagnósticos, tratamientos, medicamentos ni dosis.",
  unresolved: "No encontramos una respuesta concluyente. Puedes reformular el problema o crear un ticket de soporte."
};

export function formatSupportDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(value));
}
