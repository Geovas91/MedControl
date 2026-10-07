import "server-only";

import { isCanonicalAppointmentUuid, type AppointmentStatus } from "@/lib/appointments/query";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";

export type AppointmentLifecycleOperation = "confirm" | "cancel" | "reschedule" | "waiting" | "completed" | "restore";

export type AppointmentLifecycleInput = {
  appointmentId: string;
  operation: AppointmentLifecycleOperation;
  expectedStatus?: AppointmentStatus;
  startsAt?: string;
  endsAt?: string;
};

type LifecycleRow = {
  appointment_id: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  updated_at: string;
  changed: boolean;
};

export type AppointmentLifecycleResult =
  | { state: "success"; appointment: LifecycleRow }
  | { state: "invalid_input" }
  | { state: "unauthenticated" | "no_active_membership" | "forbidden" }
  | { state: "not_found" | "invalid_transition" | "conflict" | "stale_state" | "too_early" | "terminal_state" | "error" };

export type AppointmentEvent = {
  id: string;
  event_type: "created" | "confirmed" | "cancelled" | "rescheduled" | "waiting" | "completed" | "restored" | "metadata_updated";
  old_status: AppointmentStatus | null;
  new_status: AppointmentStatus | null;
  old_starts_at: string | null;
  new_starts_at: string | null;
  created_at: string;
};

export async function getAppointmentEventsForActiveTenant(appointmentId: string) {
  if (!isCanonicalAppointmentUuid(appointmentId)) return { state: "invalid_input" as const, data: [] as AppointmentEvent[] };
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state, data: [] as AppointmentEvent[] };
  const result = await (await createClient()).from("appointment_events")
    .select("id, event_type, old_status, new_status, old_starts_at, new_starts_at, created_at")
    .eq("clinic_id", context.tenant.clinic.id).eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false }).limit(20);
  if (result.error) return { state: "error" as const, data: [] as AppointmentEvent[] };
  return { state: "ready" as const, data: (result.data ?? []) as unknown as AppointmentEvent[] };
}

function classifyLifecycleError(code?: string, safeReason?: string): "forbidden" | "conflict" | "stale_state" | "invalid_transition" | "not_found" | "too_early" | "terminal_state" | "error" {
  if (code === "P0001" && safeReason === "appointment_too_early") return "too_early";
  if (code === "22023" && safeReason === "appointment_terminal_state") return "terminal_state";
  if (code === "P0002") return "not_found";
  if (code === "42501") return "forbidden";
  if (code === "23P01") return "conflict";
  if (code === "40001") return "stale_state";
  if (code === "22023") return "invalid_transition";
  return "error";
}

export async function mutateAppointmentLifecycleForActiveTenant(
  input: AppointmentLifecycleInput
): Promise<AppointmentLifecycleResult> {
  if (!isCanonicalAppointmentUuid(input.appointmentId)) return { state: "invalid_input" };
  if (input.operation === "reschedule" && (!input.startsAt || !input.endsAt)) return { state: "invalid_input" };

  const context = await getActiveTenantContext();
  if (context.state === "error") return { state: "error" };
  if (context.state !== "ready") return { state: context.state };

  const result = await (await createClient()).rpc("mutate_appointment_lifecycle_for_current_user" as never, {
    p_clinic_id: context.tenant.clinic.id,
    p_appointment_id: input.appointmentId,
    p_operation: input.operation,
    p_expected_status: input.expectedStatus ?? null,
    p_new_starts_at: input.startsAt ?? null,
    p_new_ends_at: input.endsAt ?? null
  } as never) as unknown as { data: LifecycleRow[] | null; error: { code?: string; message?: string } | null };

  if (result.error) {
    const state = classifyLifecycleError(result.error.code, result.error.message);
    logger.error("Appointment lifecycle mutation failed", {
      component: "appointment_lifecycle",
      operation: `appointment_${input.operation}`,
      appointment_id: input.appointmentId,
      clinic_id: context.tenant.clinic.id,
      actor_role: context.tenant.membership.role,
      error_code: result.error.code ?? "rpc_error"
    });
    return { state };
  }

  const appointment = result.data?.[0];
  if (!appointment) return { state: "error" };
  return { state: "success", appointment };
}
