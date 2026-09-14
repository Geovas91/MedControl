import assert from "node:assert/strict";
import test from "node:test";
import { validateExceptionInput } from "../../lib/availability/exceptions.ts";

test("exception validation accepts timed and all-day local ranges", () => {
  assert.equal(validateExceptionInput({ type: "unavailable", startDate: "2026-09-14", startTime: "09:00", endDate: "2026-09-14", endTime: "10:00", allDay: false, reason: "Comida" }), null);
  assert.equal(validateExceptionInput({ type: "unavailable", startDate: "2026-09-20", startTime: "", endDate: "2026-09-25", endTime: "", allDay: true, reason: "Vacaciones" }), null);
});
test("exception validation rejects reversed ranges and long reasons", () => {
  assert.match(validateExceptionInput({ type: "available", startDate: "2026-09-14", startTime: "10:00", endDate: "2026-09-14", endTime: "09:00", allDay: false, reason: "" }) ?? "", /anterior/);
  assert.match(validateExceptionInput({ type: "available", startDate: "2026-09-14", startTime: "", endDate: "2026-09-14", endTime: "", allDay: true, reason: "x".repeat(301) }) ?? "", /300/);
});
