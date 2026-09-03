import "server-only";

import { logger } from "@/lib/logger";
import { getSupportContext } from "@/lib/server/support/context";
import { createClient } from "@/lib/supabase/server";
import { buildSupportLogContext } from "@/lib/support/security";
import { isSupportUuid } from "@/lib/support/security";
import { canRequesterTransitionSupportTicket, isSupportTicketStatus, isTenantVisibleSupportMessage, parseSupportMessage, parseSupportTicketInput, toSupportTicketSafeProjection } from "@/lib/support/tickets";
import type { SupportImpact, SupportTicketCategory, SupportTicketSafeProjection, SupportTicketStatus } from "@/lib/support/types";

const safeTicketColumns = "id, reference_code, category, severity, status, subject, summary, diagnostic_codes, created_by, last_activity_at, created_at, updated_at, resolved_at, closed_at";

type TicketRow = {
  id: string; reference_code: string; category: SupportTicketCategory; severity: "low" | "normal" | "high"; status: SupportTicketStatus;
  subject: string; summary: string; diagnostic_codes: string[]; created_by: string;
  last_activity_at: string; created_at: string; updated_at: string; resolved_at: string | null; closed_at: string | null;
};

type SupportTicketRpcClient = {
  rpc(fn: "create_support_ticket_for_current_user", args: { p_clinic_id: string; p_category: string; p_impact: SupportImpact; p_subject: string; p_summary: string; p_diagnostic_codes: string[] }): Promise<{ data: TicketRow[] | null; error: { code?: string } | null }>;
  rpc(fn: "add_support_ticket_message_for_current_user", args: { p_clinic_id: string; p_ticket_id: string; p_body: string }): Promise<{ data: Array<{ id: string; ticket_id: string; author_user_id: string; author_kind: "clinic_user"; visibility: "requester" | "clinic"; body: string; created_at: string; redacted_at: null; redacted_by: null }> | null; error: { code?: string } | null }>;
  rpc(fn: "transition_support_ticket_for_requester", args: { p_clinic_id: string; p_ticket_id: string; p_to_status: SupportTicketStatus }): Promise<{ data: TicketRow[] | null; error: { code?: string } | null }>;
};

type TicketMessageRow = { id: string; author_kind: "clinic_user" | "platform_admin"; visibility: "requester" | "clinic" | "internal"; body: string; created_at: string; redacted_at: string | null };
type TicketEventRow = { id: string; event_type: string; from_status: string | null; to_status: string | null; created_at: string };

function failure(operation: "ticket_create" | "ticket_update", code: string) {
  logger.error("Support ticket operation failed", buildSupportLogContext({ operation, status: "failed", code }));
  return { state: "error" as const, data: null };
}

function rateLimited(operation: "ticket_create" | "ticket_update") {
  logger.warn("Support ticket operation rate limited", buildSupportLogContext({ operation, status: "rate_limited", code: "rate_limited" }));
  return { state: "rate_limited" as const, data: null };
}

export async function createSupportTicket(input: { category: string; impact: string; subject: string; summary: string; diagnosticCodes?: string[] }) {
  const parsed = parseSupportTicketInput(input);
  if (!parsed) return { state: "invalid_input" as const, data: null };
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  const client = await createClient() as unknown as SupportTicketRpcClient;
  const result = await client.rpc("create_support_ticket_for_current_user", {
    p_clinic_id: contextResult.context.clinicId,
    p_category: parsed.category,
    p_impact: parsed.impact,
    p_subject: parsed.subject,
    p_summary: parsed.summary,
    p_diagnostic_codes: parsed.diagnosticCodes
  });
  if (result.error?.code === "P0001") return rateLimited("ticket_create");
  if (result.error || !result.data?.[0]) return failure("ticket_create", "ticket_create_failed");
  logger.info("Support ticket created", buildSupportLogContext({ operation: "ticket_create", status: "success", code: "ticket_created" }));
  return { state: "ready" as const, data: toSupportTicketSafeProjection(result.data[0]) };
}

export async function listMySupportTickets() {
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  const client = await createClient();
  const result = await client.from("support_tickets").select(safeTicketColumns).eq("clinic_id", contextResult.context.clinicId).eq("created_by", contextResult.context.userId).order("last_activity_at", { ascending: false }).limit(50);
  if (result.error) return failure("ticket_update", "ticket_list_failed");
  return { state: "ready" as const, data: ((result.data ?? []) as unknown as TicketRow[]).map(toSupportTicketSafeProjection) };
}

export async function listClinicSupportTickets() {
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  if (contextResult.context.role !== "owner" && contextResult.context.role !== "admin") return { state: "forbidden" as const, data: null };
  const client = await createClient();
  const result = await client.from("support_tickets").select(safeTicketColumns).eq("clinic_id", contextResult.context.clinicId).order("last_activity_at", { ascending: false }).limit(100);
  if (result.error) return failure("ticket_update", "ticket_list_failed");
  return { state: "ready" as const, data: ((result.data ?? []) as unknown as TicketRow[]).map(toSupportTicketSafeProjection) };
}

export async function getSupportTicket(ticketId: string) {
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  const client = await createClient();
  const result = await client.from("support_tickets").select(safeTicketColumns).eq("clinic_id", contextResult.context.clinicId).eq("id", ticketId).maybeSingle();
  if (result.error) return failure("ticket_update", "ticket_get_failed");
  if (!result.data) return { state: "not_found" as const, data: null };
  return { state: "ready" as const, data: toSupportTicketSafeProjection(result.data as unknown as TicketRow) };
}

export async function getSupportTicketDetail(ticketId: string) {
  if (!isSupportUuid(ticketId)) return { state: "not_found" as const, data: null };
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  const client = await createClient();
  const ticketResult = await client.from("support_tickets").select(safeTicketColumns).eq("clinic_id", contextResult.context.clinicId).eq("id", ticketId).maybeSingle();
  if (ticketResult.error) return failure("ticket_update", "ticket_get_failed");
  if (!ticketResult.data) return { state: "not_found" as const, data: null };
  const ticketRow = ticketResult.data as unknown as TicketRow;
  const [messagesResult, eventsResult] = await Promise.all([
    client.from("support_ticket_messages").select("id, author_kind, visibility, body, created_at, redacted_at").eq("ticket_id", ticketId).neq("visibility", "internal").order("created_at", { ascending: true }),
    client.from("support_ticket_events").select("id, event_type, from_status, to_status, created_at").eq("ticket_id", ticketId).order("created_at", { ascending: true })
  ]);
  if (messagesResult.error || eventsResult.error) return failure("ticket_update", "ticket_detail_failed");
  const messages = ((messagesResult.data ?? []) as TicketMessageRow[]).filter((message) => isTenantVisibleSupportMessage(message.visibility));
  return {
    state: "ready" as const,
    data: {
      ticket: toSupportTicketSafeProjection(ticketRow),
      messages,
      events: (eventsResult.data ?? []) as TicketEventRow[],
      canClose: ticketRow.created_by === contextResult.context.userId && ticketRow.status === "resolved"
    }
  };
}

export async function addSupportTicketMessage(ticketId: string, bodyInput: string) {
  const body = parseSupportMessage(bodyInput);
  if (!body) return { state: "invalid_input" as const, data: null };
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  const client = await createClient() as unknown as SupportTicketRpcClient;
  const result = await client.rpc("add_support_ticket_message_for_current_user", { p_clinic_id: contextResult.context.clinicId, p_ticket_id: ticketId, p_body: body });
  if (result.error?.code === "P0001") return rateLimited("ticket_update");
  if (result.error || !result.data?.[0]) return failure("ticket_update", "ticket_message_failed");
  return { state: "ready" as const, data: result.data[0] };
}

export async function transitionOwnSupportTicket(ticketId: string, fromStatus: string, toStatus: string) {
  if (!isSupportTicketStatus(fromStatus) || !isSupportTicketStatus(toStatus) || !canRequesterTransitionSupportTicket(fromStatus, toStatus)) return { state: "invalid_input" as const, data: null };
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  const client = await createClient() as unknown as SupportTicketRpcClient;
  const result = await client.rpc("transition_support_ticket_for_requester", { p_clinic_id: contextResult.context.clinicId, p_ticket_id: ticketId, p_to_status: toStatus });
  if (result.error || !result.data?.[0]) return failure("ticket_update", "ticket_transition_failed");
  return { state: "ready" as const, data: toSupportTicketSafeProjection(result.data[0]) };
}

export type SupportTicketListResult = { state: "ready"; data: SupportTicketSafeProjection[] };
