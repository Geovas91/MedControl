import "server-only";

import { isCanonicalAppointmentUuid, type AppointmentStatus } from "@/lib/appointments/query";
import { logger } from "@/lib/logger";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";

export type AppointmentLifecycleOperation = "confirm" | "cancel" | "reschedule";

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
  | { state: "not_found" | "invalid_transition" | "conflict" | "stale_state" | "error" };

function classifyLifecycleError(code?: string): "forbidden" | "conflict" | "stale_state" | "invalid_transition" | "error" {
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
  } as never) as unknown as { data: LifecycleRow[] | null; error: { code?: string } | null };

  if (result.error) {
    const state = classifyLifecycleError(result.error.code);
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
