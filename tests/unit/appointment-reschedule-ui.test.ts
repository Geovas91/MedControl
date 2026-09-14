import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editService = readFileSync(new URL("../../lib/server/update-appointment.ts", import.meta.url), "utf8");
const action = readFileSync(new URL("../../app/dashboard/appointments/[id]/reschedule/actions.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/dashboard/appointments/[id]/reschedule/page.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../../app/dashboard/appointments/[id]/page.tsx", import.meta.url), "utf8");

test("legacy edit path cannot mutate schedule or doctor", () => {
  assert.match(editService, /state: "reschedule_required"/);
  assert.match(editService, /if \(scheduleChanged \|\| doctorChanged\)/);
  assert.doesNotMatch(editService, /conflictResult/);
});

test("reschedule UI uses lifecycle RPC and safe side effects after persistence", () => {
  assert.match(action, /mutateAppointmentLifecycleForActiveTenant/);
  assert.match(action, /operation: "reschedule"/);
  assert.match(action, /deliverAppointmentCalendarEmail/);
  assert.match(action, /syncAppointmentGoogleCalendar/);
  assert.match(page, /getAppointmentRescheduleForActiveTenant/);
});

test("detail exposes a dedicated reschedule route and event history", () => {
  assert.match(detail, /\/reschedule/);
  assert.match(detail, /getAppointmentEventsForActiveTenant/);
});
