import assert from "node:assert/strict";
import test from "node:test";
import {
  runWithAppointmentAutomationHeartbeat,
  type AutomationHeartbeatRpcClient
} from "../../lib/appointment-automation-heartbeat.ts";

type RpcCall = { name: string; args?: Record<string, unknown> };

function loggerCapture() {
  const entries: Array<{ message: string; context?: Record<string, unknown> }> = [];
  return {
    entries,
    logger: { error(message: string, context?: Record<string, unknown>) { entries.push({ message, context }); } }
  };
}

test("start heartbeat RPC error fails before claiming jobs", async () => {
  const calls: RpcCall[] = [];
  let executed = false;
  const client: AutomationHeartbeatRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: null, error: { code: "21000" } };
    }
  };
  const capture = loggerCapture();

  await assert.rejects(
    runWithAppointmentAutomationHeartbeat(client, async () => {
      executed = true;
      return { claimed: 1, succeeded: 0, skipped: 0, retryPending: 0, failed: 0, uncertain: 0, lostLease: 0 };
    }, capture.logger),
    { message: "Appointment automation heartbeat start failed." }
  );
  assert.equal(executed, false);
  assert.deepEqual(calls.map((call) => call.args?.p_phase), ["start"]);
  assert.equal(capture.entries[0]?.context?.code, "21000");
});

test("finish OK heartbeat RPC error cannot report runner success", async () => {
  const calls: RpcCall[] = [];
  const client: AutomationHeartbeatRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (args?.p_phase === "finish" && args.p_status === "ok") return { data: null, error: { code: "21000" } };
      return { data: true, error: null };
    }
  };
  const capture = loggerCapture();

  await assert.rejects(
    runWithAppointmentAutomationHeartbeat(client, async () => ({ claimed: 0, succeeded: 0, skipped: 0, retryPending: 0, failed: 0, uncertain: 0, lostLease: 0 }), capture.logger),
    { message: "Appointment automation run failed." }
  );
  assert.deepEqual(calls.map((call) => [call.args?.p_phase, call.args?.p_status ?? null]), [
    ["start", null], ["finish", "ok"], ["finish", "error"]
  ]);
});

test("operational error attempts one finish error heartbeat", async () => {
  const calls: RpcCall[] = [];
  const client: AutomationHeartbeatRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: true, error: null };
    }
  };
  const capture = loggerCapture();

  await assert.rejects(
    runWithAppointmentAutomationHeartbeat(client, async () => { throw new Error("raw database detail"); }, capture.logger),
    { message: "Appointment automation run failed." }
  );
  assert.deepEqual(calls.map((call) => [call.args?.p_phase, call.args?.p_status ?? null]), [
    ["start", null], ["finish", "error"]
  ]);
});

test("finish error failure is best effort and does not leak raw details", async () => {
  const calls: RpcCall[] = [];
  const capture = loggerCapture();
  const client: AutomationHeartbeatRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (args?.p_phase === "finish") throw new Error("SECRET_SUPABASE_INTERNAL_MESSAGE");
      return { data: true, error: null };
    }
  };

  await assert.rejects(
    runWithAppointmentAutomationHeartbeat(client, async () => { throw new Error("RAW_PROVIDER_BODY"); }, capture.logger),
    (error: Error) => error.message === "Appointment automation run failed."
  );
  assert.equal(calls.length, 2);
  const serializedLogs = JSON.stringify(capture.entries);
  assert.doesNotMatch(serializedLogs, /SECRET_SUPABASE_INTERNAL_MESSAGE|RAW_PROVIDER_BODY/);
  assert.match(serializedLogs, /finish_error/);
  assert.match(serializedLogs, /rpc_exception/);
});

test("healthy execution returns the existing sanitized counters after finish OK", async () => {
  const calls: RpcCall[] = [];
  const client: AutomationHeartbeatRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: true, error: null };
    }
  };
  const capture = loggerCapture();
  const result = await runWithAppointmentAutomationHeartbeat(client, async () => ({
    claimed: 2, succeeded: 1, skipped: 1, retryPending: 0, failed: 0, uncertain: 0, lostLease: 0
  }), capture.logger);

  assert.deepEqual(result, { claimed: 2, succeeded: 1, skipped: 1, retryPending: 0, failed: 0, uncertain: 0, lostLease: 0 });
  assert.deepEqual(calls.map((call) => [call.args?.p_phase, call.args?.p_status ?? null]), [
    ["start", null], ["finish", "ok"]
  ]);
  assert.equal(capture.entries.length, 0);
});

test("uncertain persistence makes the heartbeat unhealthy", async () => {
  const calls: RpcCall[] = [];
  const client: AutomationHeartbeatRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: true, error: null };
    }
  };
  const capture = loggerCapture();
  await runWithAppointmentAutomationHeartbeat(client, async () => ({
    claimed: 1, succeeded: 0, skipped: 0, retryPending: 0, failed: 0, uncertain: 1, lostLease: 0
  }), capture.logger);
  assert.equal(calls.at(-1)?.args?.p_status, "error");
  assert.equal(calls.at(-1)?.args?.p_uncertain, 1);
});
