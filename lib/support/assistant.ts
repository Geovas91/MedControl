import type { SupportAnswer, SupportAssistantInput, SupportAssistantProvider, SupportDiagnosticId, SupportIntent } from "./types.ts";

const intentRules: ReadonlyArray<{ intent: SupportIntent; terms: string[]; diagnosticIds: SupportDiagnosticId[] }> = [
  { intent: "clinical_question", terms: ["diagnóstico médico", "diagnostico médico", "qué medicamento", "que medicamento", "medicamento debo", "qué tratamiento", "que tratamiento", "dosis de", "qué dosis", "que dosis", "síntomas médicos", "sintomas médicos", "me duele", "tengo fiebre"], diagnosticIds: [] },
  { intent: "reschedule_appointment", terms: ["reprogram", "cambiar fecha", "cambiar hora"], diagnosticIds: ["appointment_write_readiness"] },
  { intent: "cancel_appointment", terms: ["cancelar cita", "cancelo", "cancelación"], diagnosticIds: ["appointment_write_readiness"] },
  { intent: "create_appointment", terms: ["crear cita", "crear una cita", "nueva cita", "agendar cita"], diagnosticIds: ["appointment_write_readiness"] },
  { intent: "manage_members", terms: ["agregar usuario", "miembro", "doctor", "asistente", "permisos"], diagnosticIds: ["current_role", "member_management_readiness"] },
  { intent: "login_problem", terms: ["login", "iniciar sesión", "contraseña", "acceso"], diagnosticIds: ["session_status"] },
  { intent: "email_problem", terms: ["email", "correo", "no llegó"], diagnosticIds: ["email_provider_readiness"] },
  { intent: "google_calendar_problem", terms: ["google calendar", "calendar", "sincroniza"], diagnosticIds: ["google_calendar_status"] },
  { intent: "appointment_assistant_problem", terms: ["asistente de agenda", "recordatorio", "scheduler"], diagnosticIds: ["appointment_automation_status"] },
  { intent: "subscription_question", terms: ["suscripción", "plan", "facturación", "pago"], diagnosticIds: ["subscription_access"] },
  { intent: "configuration_question", terms: ["configuración", "configurar", "ajuste"], diagnosticIds: ["feature_entitlement"] },
  { intent: "feature_explanation", terms: ["cómo funciona", "qué es", "función"], diagnosticIds: [] }
];

export function classifySupportIntent(question: string) {
  const normalized = question.normalize("NFKC").toLocaleLowerCase("es-MX").replace(/\s+/g, " ").trim();
  const rule = intentRules.find((candidate) => candidate.terms.some((term) => normalized.includes(term)));
  return rule ?? { intent: "unresolved" as const, terms: [], diagnosticIds: [] };
}

export class DeterministicSupportAssistantProvider implements SupportAssistantProvider {
  async answer(input: SupportAssistantInput): Promise<SupportAnswer> {
    const rule = classifySupportIntent(input.question);
    const diagnostics = input.diagnostics.filter((diagnostic) => rule.diagnosticIds.includes(diagnostic.diagnosticId));
    const clinicalQuestion = rule.intent === "clinical_question";
    const unresolved = !clinicalQuestion && (rule.intent === "unresolved" || (input.articles.length === 0 && diagnostics.length === 0));
    return {
      intent: rule.intent,
      status: unresolved ? "unresolved" : "answered",
      messageCode: unresolved ? "support_unresolved" : `support_${rule.intent}`,
      articleReferences: input.articles.slice(0, 5),
      diagnostics,
      offerTicket: !clinicalQuestion && (unresolved || diagnostics.some((diagnostic) => diagnostic.status === "degraded" || diagnostic.status === "unavailable"))
    };
  }
}
