import { sanitizeAutomationCounters, type AutomationRunCounters } from "./appointment-automations.ts";

export type AutomationHeartbeatRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }>;
};

type AutomationHeartbeatLogger = {
  error(message: string, context?: Record<string, unknown>): void;
};

type HeartbeatResult = { ok: true; code: null } | { ok: false; code: string };

export function sanitizeAutomationRpcCode(value: unknown) {
  if (typeof value !== "string") return "rpc_error";
  const normalized = value.toUpperCase();
  return /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(normalized) ? normalized.toLowerCase() : "rpc_error";
}

async function recordHeartbeat(
  client: AutomationHeartbeatRpcClient,
  args: Record<string, unknown>
): Promise<HeartbeatResult> {
  try {
    const result = await client.rpc("record_appointment_automation_heartbeat", args);
    return result.error
      ? { ok: false, code: sanitizeAutomationRpcCode(result.error.code) }
      : { ok: true, code: null };
  } catch {
    return { ok: false, code: "rpc_exception" };
  }
}

export async function runWithAppointmentAutomationHeartbeat(
  client: AutomationHeartbeatRpcClient,
  execute: () => Promise<AutomationRunCounters>,
  heartbeatLogger: AutomationHeartbeatLogger
) {
  const start = await recordHeartbeat(client, { p_phase: "start" });
  if (!start.ok) {
    heartbeatLogger.error("Appointment automation heartbeat failed", {
      component: "appointment_automation",
      phase: "start",
      code: start.code
    });
    throw new Error("Appointment automation heartbeat start failed.");
  }

  try {
    const counters = sanitizeAutomationCounters(await execute());
    const finish = await recordHeartbeat(client, {
      p_phase: "finish",
      p_status: counters.uncertain > 0 || counters.lostLease > 0 ? "error" : "ok",
      p_claimed: counters.claimed,
      p_succeeded: counters.succeeded,
      p_skipped: counters.skipped,
      p_failed: counters.failed,
      p_uncertain: counters.uncertain,
      p_lost_lease: counters.lostLease
    });
    if (!finish.ok) {
      heartbeatLogger.error("Appointment automation heartbeat failed", {
        component: "appointment_automation",
        phase: "finish_ok",
        code: finish.code
      });
      throw new Error("Appointment automation heartbeat finish failed.");
    }
    return counters;
  } catch {
    const finishError = await recordHeartbeat(client, { p_phase: "finish", p_status: "error" });
    if (!finishError.ok) {
      heartbeatLogger.error("Appointment automation heartbeat failed", {
        component: "appointment_automation",
        phase: "finish_error",
        code: finishError.code
      });
    }
    heartbeatLogger.error("Appointment automation runner failed", {
      component: "appointment_automation",
      code: "runner_failed"
    });
    throw new Error("Appointment automation run failed.");
  }
}
