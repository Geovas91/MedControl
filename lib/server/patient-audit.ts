import "server-only";

import { canViewPatientAudit } from "@/lib/clinical-record/permissions";
import { logger } from "@/lib/logger";
import { isValidPatientUuid } from "@/lib/patients/detail";
import { getPatientAuditActionLabel, getPatientAuditResourceHref, getPatientAuditResourceLabel } from "@/lib/patients/record-tabs";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type AuditRpcRow = Database["public"]["Functions"]["list_patient_audit_timeline_for_current_user"]["Returns"][number];
type AuditRpcClient = {
  rpc(
    fn: "list_patient_audit_timeline_for_current_user",
    args: { p_clinic_id: string; p_patient_id: string; p_before_occurred_at: string | null; p_before_event_id: string | null; p_limit: number }
  ): Promise<{ data: AuditRpcRow[] | null; error: { code: string } | null }>;
};

const auditPageSize = 20;

export type PatientAuditEvent = {
  id: string;
  actionLabel: string;
  resourceLabel: string;
  resourceHref: string;
  actorName: string | null;
  occurredAt: string;
};

export type PatientAuditPage = {
  events: PatientAuditEvent[];
  hasPrevious: boolean;
  nextCursor: { occurredAt: string; eventId: string } | null;
};

type PatientAuditResult =
  | { state: "ready"; data: PatientAuditPage }
  | { state: "invalid_id" | "unauthenticated" | "no_active_membership" | "forbidden" | "error"; data: null };

function normalizeAuditCursor(searchParams: { before?: string | string[]; beforeId?: string | string[] }) {
  const before = typeof searchParams.before === "string" ? searchParams.before : null;
  const beforeId = typeof searchParams.beforeId === "string" ? searchParams.beforeId : null;
  if (!before || !beforeId || !isValidPatientUuid(beforeId)) return null;
  const occurredAt = new Date(before);
  return Number.isFinite(occurredAt.getTime()) ? { occurredAt: occurredAt.toISOString(), eventId: beforeId } : null;
}

export async function getPatientAuditForActiveTenant(
  patientId: string,
  searchParams: { before?: string | string[]; beforeId?: string | string[] } = {}
): Promise<PatientAuditResult> {
  if (!isValidPatientUuid(patientId)) return { state: "invalid_id", data: null };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: null };
  if (!canViewPatientAudit(context.tenant.membership.role)) return { state: "forbidden", data: null };

  const supabase = await createClient();
  const auditRpcClient = supabase as unknown as AuditRpcClient;
  const cursor = normalizeAuditCursor(searchParams);
  const result = await auditRpcClient.rpc("list_patient_audit_timeline_for_current_user", {
    p_clinic_id: context.tenant.clinic.id,
    p_patient_id: patientId,
    p_before_occurred_at: cursor?.occurredAt ?? null,
    p_before_event_id: cursor?.eventId ?? null,
    p_limit: auditPageSize + 1
  });

  if (result.error) {
    logger.error("Patient audit timeline query failed", {
      component: "patient_audit",
      operation: "timeline",
      status: "query_error",
      code: result.error.code
    });
    return { state: "error", data: null };
  }

  const rows = (result.data ?? []) as AuditRpcRow[];
  const visibleRows = rows.slice(0, auditPageSize);
  const events = visibleRows.map((event) => ({
    id: event.event_id,
    actionLabel: getPatientAuditActionLabel(event.action),
    resourceLabel: getPatientAuditResourceLabel(event.resource_type),
    resourceHref: getPatientAuditResourceHref({
      patientId,
      resourceType: event.resource_type,
      relatedConsentId: event.related_consent_id
    }),
    actorName: event.actor_name,
    occurredAt: event.occurred_at
  }));

  const lastVisible = visibleRows.at(-1);
  return {
    state: "ready",
    data: {
      events,
      hasPrevious: Boolean(cursor),
      nextCursor: rows.length > auditPageSize && lastVisible
        ? { occurredAt: lastVisible.occurred_at, eventId: lastVisible.event_id }
        : null
    }
  };
}
