import type { Database } from "@/types/database";

export const supportIntentIds = [
  "create_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "manage_members",
  "login_problem",
  "email_problem",
  "google_calendar_problem",
  "appointment_assistant_problem",
  "subscription_question",
  "configuration_question",
  "feature_explanation",
  "clinical_question",
  "unresolved"
] as const;

export const supportDiagnosticIds = [
  "session_status",
  "current_role",
  "subscription_access",
  "appointment_write_readiness",
  "member_management_readiness",
  "google_calendar_status",
  "appointment_automation_status",
  "email_provider_readiness",
  "feature_entitlement"
] as const;

export type SupportIntent = (typeof supportIntentIds)[number];
export type SupportDiagnosticId = (typeof supportDiagnosticIds)[number];
export type SupportRole = Database["public"]["Enums"]["clinic_member_role"];
export type SupportPlanId = "basic" | "plus" | "pro";
export type SupportEffectiveSubscriptionStatus = "active" | "trialing" | "trial_expired" | "past_due" | "inactive" | "cancelled";

export type SupportContext = {
  userId: string;
  clinicId: string;
  role: SupportRole;
  planId: SupportPlanId;
  effectiveSubscriptionStatus: SupportEffectiveSubscriptionStatus;
  entitlements: Readonly<Record<"service_bot_tier1" | "google_calendar" | "whatsapp_notifications", boolean>>;
};

export type SafeDiagnosticResult = {
  diagnosticId: SupportDiagnosticId;
  status: "healthy" | "degraded" | "unavailable" | "not_applicable";
  code: string;
  verifiedAt: string;
  suggestedArticleSlugs: string[];
};

export type SupportArticleReference = {
  slug: string;
  title: string;
  summary: string;
  version: number;
};

export type SupportAnswer = {
  intent: SupportIntent;
  status: "answered" | "unresolved";
  messageCode: string;
  articleReferences: SupportArticleReference[];
  diagnostics: SafeDiagnosticResult[];
  offerTicket: boolean;
};

export type SupportTicketStatus = "open" | "triaged" | "in_progress" | "waiting_user" | "resolved" | "closed";
export type SupportTicketSeverity = "low" | "normal" | "high";
export type SupportTicketCategory = "how_to" | "authentication" | "appointments" | "members" | "configuration" | "google_calendar" | "appointment_assistant" | "email" | "billing" | "other";
export type SupportImpact = "informational" | "single_user_blocked" | "multiple_users_blocked" | "access_blocked";

export type SupportTicketSafeProjection = {
  id: string;
  referenceCode: string;
  category: SupportTicketCategory;
  severity: SupportTicketSeverity;
  status: SupportTicketStatus;
  subject: string;
  summary: string;
  diagnosticCodes: string[];
  createdBy: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};

export type SupportAssistantInput = {
  question: string;
  articles: SupportArticleReference[];
  diagnostics: SafeDiagnosticResult[];
};

export interface SupportAssistantProvider {
  answer(input: SupportAssistantInput): Promise<SupportAnswer>;
}
