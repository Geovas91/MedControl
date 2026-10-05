import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as contracts from "../../lib/assistant/tools/contracts.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const clinicId = "22222222-2222-4222-8222-222222222222";
const professionalId = "33333333-3333-4333-8333-333333333333";
const patientId = "44444444-4444-4444-8444-444444444444";
const actionId = "55555555-5555-4555-8555-555555555555";
const appointmentId = "66666666-6666-4666-8666-666666666666";
const input = { patientId, professionalClinicMemberId: professionalId, date: "2026-09-28", startTime: "10:30", durationMinutes: 30 };

function mountRegistry(role: "owner" | "admin" | "assistant" | "doctor" = "assistant") {
  const state = {
    eligible: true,
    professionalActive: true,
    slotAvailable: true,
    availabilityStart: "09:00",
    malformedSlots: false,
    mutationCalls: 0,
    deliveryCalls: [] as Record<string, unknown>[],
    changed: true,
    eligibilityCalls: 0,
    slotIntervalCalls: [] as number[],
    finish: null as null | { outcome: string; errorCode: string | null },
    pendingStatus: "none" as "none" | "pending" | "claimed" | "executed" | "failed",
    pendingArguments: null as Record<string, unknown> | null
  };
  const client = {
    from(table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          if (table === "patients") return { data: { id: patientId }, error: null };
          if (table === "assistant_pending_actions") return { data: state.pendingStatus === "none" ? null : { id: actionId }, error: null };
          throw new Error(`Unexpected table: ${table}`);
        }
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "list_clinic_members_for_current_user") return { data: [{ id: professionalId, user_id: actorId, status: state.professionalActive ? "active" : "suspended", is_professional: true }], error: null };
      if (name === "create_assistant_pending_action_for_current_user") {
        state.pendingArguments = args.p_validated_arguments as Record<string, unknown>;
        state.pendingStatus = "pending";
        return { data: [{ id: actionId, tool_name: "create_appointment", expires_at: "2026-09-28T12:00:00Z" }], error: null };
      }
      if (name === "claim_assistant_pending_action_for_current_user") {
        if (state.pendingStatus === "pending") {
          state.pendingStatus = "claimed";
          return { data: [{ tool_name: "create_appointment", validated_arguments: state.pendingArguments, status: "claimed" }], error: null };
        }
        return { data: [{ tool_name: "create_appointment", validated_arguments: state.pendingArguments, status: state.pendingStatus }], error: null };
      }
      if (name === "finish_assistant_pending_action_for_current_user") {
        state.finish = { outcome: args.p_outcome as string, errorCode: args.p_error_code as string | null };
        state.pendingStatus = args.p_outcome as "executed" | "failed";
        return { data: state.pendingStatus, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    }
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/appointments/create": { calculateAppointmentEnd: () => "", combineClinicDateTime: () => ({ state: "valid", iso: "" }) },
    "@/lib/dashboard/timezone": { getClinicDayRange: () => ({ localDate: "2026-09-28" }) },
    "@/lib/logger": { logger: { info: () => {}, error: () => {} } },
    "@/lib/server/appointments": {},
    "@/lib/calendar/invitation": { buildAppointmentCalendarOperation: (_id: string, _kind: string, version: string) => ({ operationKey: "calendar-key", appointmentVersion: version }) },
    "@/lib/server/appointment-calendar-email": { deliverAppointmentCalendarEmail: async (input: Record<string, unknown>) => { state.deliveryCalls.push(input); return "delivery_unknown"; } },
    "@/lib/server/appointment-detail": {},
    "@/lib/server/appointment-lifecycle": { mutateAppointmentLifecycleForActiveTenant: async (input: { operation: string }) => ({ state: "success", appointment: { appointment_id: appointmentId, status: input.operation === "cancel" ? "cancelled" : "confirmed", updated_at: "2026-09-28T12:00:00Z", changed: state.changed } }) },
    "@/lib/server/create-appointment": { createAppointmentForActiveTenant: async () => { state.mutationCalls++; return { state: "success", appointmentId, operationKey: "calendar-key", appointmentVersion: "2026-09-28T12:00:00Z" }; } },
    "@/lib/server/patients": { isPatientEligibleForSchedulingWithProfessionalActiveTenant: async (patient: string, professional: string) => {
      state.eligibilityCalls++;
      assert.equal(patient, patientId);
      assert.equal(professional, professionalId);
      return state.eligible;
    } },
    "@/lib/server/professional-slots": { getProfessionalAvailableSlots: async ({ slotIntervalMinutes, durationMinutes }: { slotIntervalMinutes: number; durationMinutes: number }) => {
      state.slotIntervalCalls.push(slotIntervalMinutes);
      const [startHour, startMinute] = state.availabilityStart.split(":").map(Number);
      const start = startHour * 60 + startMinute;
      const data = state.slotAvailable
        ? Array.from({ length: Math.ceil((12 * 60 - start - durationMinutes) / slotIntervalMinutes) + 1 }, (_, index) => {
          const minuteOfDay = start + index * slotIntervalMinutes;
          return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
        }).filter((local_start) => {
          const [hour, minute] = local_start.split(":").map(Number);
          return hour * 60 + minute + durationMinutes <= 12 * 60;
        }).map((local_start) => ({ local_start }))
        : [];
      if (state.malformedSlots) data.push({ local_start: "09:7" }, { local_start: "09:60" }, { local_start: "9:30" });
      return { state: "ready", data };
    } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({ state: "ready", user: { id: actorId }, tenant: { clinic: { id: clinicId, timezone: "America/Mexico_City" }, membership: { id: professionalId, role, is_professional: role === "doctor" } } }) },
    "@/lib/supabase/server": { createClient: async () => client },
    "./contracts": contracts
  };
  const output = ts.transpileModule(readFileSync("lib/assistant/tools/registry.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const registry: Record<string, (...args: unknown[]) => Promise<any>> = {};
  runInNewContext(output, { exports: registry, require: (name: string) => mocks[name] ?? {} });
  return { registry, state };
}

test("eligibility lost between Proposal and Confirm fails the one-shot action before appointment creation", async () => {
  const { registry, state } = mountRegistry();
  const proposal = await registry.prepareAssistantMutation("create_appointment", input);
  assert.equal(proposal.ok, true);
  state.eligible = false;
  const confirmed = await registry.executeConfirmedAssistantAction(actionId);
  assert.equal(confirmed.ok, false);
  assert.equal(confirmed.error.code, "stale");
  assert.equal(confirmed.error.safeMessage, "El paciente ya no está disponible para agendar con ese profesional. Prepara una nueva propuesta.");
  assert.equal(state.eligibilityCalls, 2);
  assert.equal(state.mutationCalls, 0);
  assert.deepEqual(state.finish, { outcome: "failed", errorCode: "stale" });
  assert.equal((await registry.executeConfirmedAssistantAction(actionId)).ok, false);
  assert.equal(state.mutationCalls, 0);
});

test("Assistant read, Proposal, and Confirm all request the same 30-minute cadence", async () => {
  const { registry, state } = mountRegistry();
  const slots = await registry.executeAssistantReadTool("get_available_slots", { professionalClinicMemberId: professionalId, date: input.date, durationMinutes: input.durationMinutes });
  assert.equal(slots.ok, true);
  assert.deepEqual(state.slotIntervalCalls, [1]);
  assert.equal((await registry.prepareAssistantMutation("create_appointment", input)).ok, true);
  assert.equal((await registry.executeConfirmedAssistantAction(actionId)).ok, true);
  assert.deepEqual(state.slotIntervalCalls, [1, 1, 1]);
});

test("Assistant aligns discovery candidates to wall-clock half hours and rejects quarter-hour starts", async () => {
  const { registry, state } = mountRegistry();
  const offered = await registry.executeAssistantReadTool("get_available_slots", { professionalClinicMemberId: professionalId, date: input.date, durationMinutes: input.durationMinutes });
  assert.deepEqual(Array.from(offered.data, (slot: { local_start: string }) => slot.local_start), ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
  for (const startTime of ["09:15", "09:45"]) {
    const proposal = await registry.prepareAssistantMutation("create_appointment", { ...input, startTime });
    assert.equal(proposal.ok, false);
    assert.equal(proposal.error.code, "outside_availability");
  }
  assert.deepEqual(state.slotIntervalCalls, [1, 1, 1]);
  assert.equal(state.mutationCalls, 0);
});

test("window beginning at 09:15 offers only 09:30-aligned starts that fit", async () => {
  const { registry, state } = mountRegistry();
  state.availabilityStart = "09:15";
  const slots = await registry.executeAssistantReadTool("get_available_slots", { professionalClinicMemberId: professionalId, date: input.date, durationMinutes: 30 });
  assert.deepEqual(Array.from(slots.data, (slot: { local_start: string }) => slot.local_start), ["09:30", "10:00", "10:30", "11:00", "11:30"]);
  assert.deepEqual(state.slotIntervalCalls, [1]);
});

test("arbitrary-minute window starts still discover the next half-hour boundary", async () => {
  const { registry, state } = mountRegistry();
  state.availabilityStart = "09:07";
  const slots = await registry.executeAssistantReadTool("get_available_slots", { professionalClinicMemberId: professionalId, date: input.date, durationMinutes: 30 });
  assert.deepEqual(Array.from(slots.data, (slot: { local_start: string }) => slot.local_start), ["09:30", "10:00", "10:30", "11:00", "11:30"]);
  assert.deepEqual(state.slotIntervalCalls, [1]);
});

test("09:30 is accepted at Proposal and Confirm for a window beginning at 09:15", async () => {
  const { registry, state } = mountRegistry();
  state.availabilityStart = "09:15";
  assert.equal((await registry.prepareAssistantMutation("create_appointment", { ...input, startTime: "09:30" })).ok, true);
  assert.equal((await registry.executeConfirmedAssistantAction(actionId)).ok, true);
  assert.deepEqual(state.slotIntervalCalls, [1, 1]);
});

test("malformed engine local_start values are excluded", async () => {
  const { registry, state } = mountRegistry();
  state.malformedSlots = true;
  const slots = await registry.executeAssistantReadTool("get_available_slots", { professionalClinicMemberId: professionalId, date: input.date, durationMinutes: input.durationMinutes });
  assert.deepEqual(Array.from(slots.data, (slot: { local_start: string }) => slot.local_start), ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
});

for (const role of ["owner", "admin", "assistant", "doctor"] as const) {
  test(`${role}: a pair eligible at Proposal and Confirm creates once`, async () => {
    const { registry, state } = mountRegistry(role);
    assert.equal((await registry.prepareAssistantMutation("create_appointment", input)).ok, true);
    const confirmed = await registry.executeConfirmedAssistantAction(actionId);
    assert.equal(confirmed.ok, true);
    assert.equal(state.eligibilityCalls, 2);
    assert.equal(state.mutationCalls, 1);
    assert.equal(state.deliveryCalls.length, 1);
    assert.equal(state.deliveryCalls[0].method, "REQUEST");
    assert.deepEqual(state.finish, { outcome: "executed", errorCode: null });
    assert.equal((await registry.executeConfirmedAssistantAction(actionId)).ok, false);
    assert.equal(state.mutationCalls, 1);
    assert.equal(state.deliveryCalls.length, 1);
    assert.equal(state.deliveryCalls[0].method, "REQUEST");
  });
}

for (const scenario of [
  "unassigned patient gains another-professional-only assignment",
  "selected-professional assignment ends with another active assignment",
  "patient becomes inactive",
  "patient becomes archived",
  "doctor loses own active patient assignment"
]) {
  test(`${scenario}: changed eligibility blocks Confirm`, async () => {
    const { registry, state } = mountRegistry(scenario.startsWith("doctor") ? "doctor" : "assistant");
    assert.equal((await registry.prepareAssistantMutation("create_appointment", input)).ok, true);
    state.eligible = false; // The 0052 RPC owns these relationship and patient-state semantics.
    const confirmed = await registry.executeConfirmedAssistantAction(actionId);
    assert.equal(confirmed.ok, false);
    assert.equal(confirmed.error.code, "stale");
    assert.equal(state.eligibilityCalls, 2);
    assert.equal(state.mutationCalls, 0);
    assert.deepEqual(state.finish, { outcome: "failed", errorCode: "stale" });
  });
}

test("a suspended professional is rejected by the existing validation at Confirm", async () => {
  const { registry, state } = mountRegistry();
  assert.equal((await registry.prepareAssistantMutation("create_appointment", input)).ok, true);
  state.professionalActive = false;
  const confirmed = await registry.executeConfirmedAssistantAction(actionId);
  assert.equal(confirmed.ok, false);
  assert.equal(confirmed.error.code, "not_found");
  assert.equal(state.mutationCalls, 0);
  assert.deepEqual(state.finish, { outcome: "failed", errorCode: "not_found" });
});

test("a newly unavailable slot remains rejected after eligibility revalidation", async () => {
  const { registry, state } = mountRegistry();
  assert.equal((await registry.prepareAssistantMutation("create_appointment", input)).ok, true);
  state.slotAvailable = false;
  const confirmed = await registry.executeConfirmedAssistantAction(actionId);
  assert.equal(confirmed.ok, false);
  assert.equal(confirmed.error.code, "outside_availability");
  assert.equal(state.eligibilityCalls, 2);
  assert.equal(state.mutationCalls, 0);
  assert.deepEqual(state.finish, { outcome: "failed", errorCode: "outside_availability" });
});


test("Assistant lifecycle reuses ICS for changed reschedule/cancel, not confirm or duplicate", async () => {
  const { registry, state } = mountRegistry();
  const tools = registry.assistantToolRegistry as unknown as Map<string, { execute: (context: unknown, input: unknown) => Promise<{ ok: boolean }> }>;
  const context = { timeZone: "America/Mexico_City" };
  assert.equal((await tools.get("confirm_appointment")!.execute(context, { appointmentId, expectedStatus: "scheduled" })).ok, true);
  assert.equal(state.deliveryCalls.length, 0);
  assert.equal((await tools.get("cancel_appointment")!.execute(context, { appointmentId, expectedStatus: "scheduled" })).ok, true);
  assert.equal(state.deliveryCalls[0].method, "CANCEL");
  assert.equal((await tools.get("reschedule_appointment")!.execute(context, { appointmentId, expectedStatus: "scheduled", date: input.date, startTime: input.startTime, durationMinutes: 30 })).ok, true);
  assert.equal(state.deliveryCalls[1].method, "REQUEST");
  state.changed = false;
  await tools.get("cancel_appointment")!.execute(context, { appointmentId, expectedStatus: "cancelled" });
  await tools.get("reschedule_appointment")!.execute(context, { appointmentId, expectedStatus: "scheduled", date: input.date, startTime: input.startTime, durationMinutes: 30 });
  assert.equal(state.deliveryCalls.length, 2);
});
