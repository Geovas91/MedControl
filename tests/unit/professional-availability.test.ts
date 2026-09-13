import assert from "node:assert/strict";
import test from "node:test";
import { validateAvailabilityWeek } from "../../lib/availability/form.ts";

test("availability accepts separate recurring intervals", () => {
  assert.equal(validateAvailabilityWeek({ 1: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }] }), null);
});
test("availability rejects reversed and overlapping intervals", () => {
  assert.equal(validateAvailabilityWeek({ 2: [{ start: "12:00", end: "09:00" }] }), "Martes: la hora inicial debe ser menor que la final.");
  assert.equal(validateAvailabilityWeek({ 3: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] }), "Miércoles: los intervalos no pueden traslaparse.");
});
