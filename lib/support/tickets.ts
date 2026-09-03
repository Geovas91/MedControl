import type { SupportImpact, SupportTicketCategory, SupportTicketSafeProjection, SupportTicketSeverity, SupportTicketStatus } from "./types.ts";
import { isSafeSupportCode, normalizeSupportText } from "./security.ts";

export const SUPPORT_SUBJECT_MAX_LENGTH = 140;
export const SUPPORT_SUMMARY_MAX_LENGTH = 2_000;
export const SUPPORT_MESSAGE_MAX_LENGTH = 4_000;
export const SUPPORT_DIAGNOSTIC_CODE_LIMIT = 12;

export const supportRateLimitPolicies = {
  diagnostic: { limit: 10, windowSeconds: 60 },
  ticket_create: { limit: 3, windowSeconds: 3_600 },
  message_create: { limit: 20, windowSeconds: 3_600 }
} as const;

export type SupportRateLimitOperation = keyof typeof supportRateLimitPolicies;

const categories: SupportTicketCategory[] = ["how_to", "authentication", "appointments", "members", "configuration", "google_calendar", "appointment_assistant", "email", "billing", "other"];
const impacts: SupportImpact[] = ["informational", "single_user_blocked", "multiple_users_blocked", "access_blocked"];
const statuses: SupportTicketStatus[] = ["open", "triaged", "in_progress", "waiting_user", "resolved", "closed"];

export function isSupportTicketCategory(value: string): value is SupportTicketCategory {
  return categories.includes(value as SupportTicketCategory);
}

export function isSupportImpact(value: string): value is SupportImpact {
  return impacts.includes(value as SupportImpact);
}

export function classifySupportSeverity(category: SupportTicketCategory, impact: SupportImpact): SupportTicketSeverity {
  if (impact === "access_blocked" || impact === "multiple_users_blocked") return "high";
  if (impact === "informational" || category === "how_to") return "low";
  return "normal";
}

export function parseSupportTicketInput(input: { category: string; impact: string; subject: string; summary: string; diagnosticCodes?: string[] }) {
  if (!isSupportTicketCategory(input.category) || !isSupportImpact(input.impact)) return null;
  const subject = normalizeSupportText(input.subject, SUPPORT_SUBJECT_MAX_LENGTH);
  const summary = normalizeSupportText(input.summary, SUPPORT_SUMMARY_MAX_LENGTH);
  const diagnosticCodes = [...new Set(input.diagnosticCodes ?? [])];
  if (!subject || !summary || diagnosticCodes.length > SUPPORT_DIAGNOSTIC_CODE_LIMIT || diagnosticCodes.some((code) => !isSafeSupportCode(code))) return null;
  return { category: input.category, impact: input.impact, subject, summary, diagnosticCodes };
}

export function parseSupportMessage(body: string) {
  return normalizeSupportText(body, SUPPORT_MESSAGE_MAX_LENGTH);
}

export function canRequesterTransitionSupportTicket(from: SupportTicketStatus, to: SupportTicketStatus) {
  return (from === "waiting_user" && to === "open") || (from === "resolved" && (to === "closed" || to === "open"));
}

type TicketRow = {
  id: string; reference_code: string; category: SupportTicketCategory; severity: SupportTicketSeverity; status: SupportTicketStatus;
  subject: string; summary: string; diagnostic_codes: string[]; created_by: string;
  last_activity_at: string; created_at: string; updated_at: string; resolved_at: string | null; closed_at: string | null;
};

export function toSupportTicketSafeProjection(row: TicketRow): SupportTicketSafeProjection {
  return {
    id: row.id, referenceCode: row.reference_code, category: row.category, severity: row.severity, status: row.status,
    subject: row.subject, summary: row.summary, diagnosticCodes: row.diagnostic_codes, createdBy: row.created_by,
    lastActivityAt: row.last_activity_at, createdAt: row.created_at,
    updatedAt: row.updated_at, resolvedAt: row.resolved_at, closedAt: row.closed_at
  };
}

export function isSupportTicketStatus(value: string): value is SupportTicketStatus {
  return statuses.includes(value as SupportTicketStatus);
}

export function canReadSupportTicket(role: "owner" | "admin" | "doctor" | "assistant", userId: string, createdBy: string) {
  return role === "owner" || role === "admin" || userId === createdBy;
}

export function isTenantVisibleSupportMessage(visibility: "requester" | "clinic" | "internal") {
  return visibility !== "internal";
}
