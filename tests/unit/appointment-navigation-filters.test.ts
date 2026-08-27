import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appointmentAgendaPageSize,
  buildAppointmentAgendaHref,
  buildAppointmentSearchFilter,
  getAppointmentAgendaPagination,
  getAppointmentPeriodBounds,
  isAppointmentPeriodAscending,
  normalizeAppointmentQuery
} from "../../lib/appointments/query.ts";

const clinicToday = "2026-08-26";
const doctorId = "f1000000-0000-4000-8000-000000000002";

test("direct date and day period remain canonical and shareable", () => {
  const query = normalizeAppointmentQuery({ date: "2026-01-15", period: "day" }, clinicToday);
  assert.equal(query.date, "2026-01-15");
  assert.deepEqual(getAppointmentPeriodBounds(query, "America/Mexico_City"), {
    startIso: "2026-01-15T06:00:00.000Z",
    endIso: "2026-01-16T06:00:00.000Z"
  });
  assert.equal(buildAppointmentAgendaHref(query), "/dashboard/appointments?date=2026-01-15&period=day");
});

test("month period spans the selected clinic-local month across DST", () => {
  const query = normalizeAppointmentQuery({ date: "2026-03-20", period: "month" }, clinicToday);
  assert.deepEqual(getAppointmentPeriodBounds(query, "America/New_York"), {
    startIso: "2026-03-01T05:00:00.000Z",
    endIso: "2026-04-01T04:00:00.000Z"
  });
});

test("upcoming, past and all use exact now with deterministic ordering", () => {
  const now = new Date("2026-08-26T17:30:00.000Z");
  const upcoming = normalizeAppointmentQuery({ period: "upcoming" }, clinicToday);
  const past = normalizeAppointmentQuery({ period: "past" }, clinicToday);
  const all = normalizeAppointmentQuery({ period: "all" }, clinicToday);
  assert.deepEqual(getAppointmentPeriodBounds(upcoming, "America/Mexico_City", now), { startIso: now.toISOString(), endIso: null });
  assert.deepEqual(getAppointmentPeriodBounds(past, "America/Mexico_City", now), { startIso: null, endIso: now.toISOString() });
  assert.deepEqual(getAppointmentPeriodBounds(all, "America/Mexico_City", now), { startIso: null, endIso: null });
  assert.equal(isAppointmentPeriodAscending("upcoming"), true);
  assert.equal(isAppointmentPeriodAscending("past"), false);
  assert.equal(isAppointmentPeriodAscending("all"), false);
});

test("custom range is inclusive in clinic timezone and limited to 366 days", () => {
  const valid = normalizeAppointmentQuery({ period: "range", from: "2026-08-01", to: "2026-08-31" }, clinicToday);
  assert.equal(valid.rangeError, null);
  assert.deepEqual(getAppointmentPeriodBounds(valid, "America/Mexico_City"), {
    startIso: "2026-08-01T06:00:00.000Z",
    endIso: "2026-09-01T06:00:00.000Z"
  });
  assert.equal(normalizeAppointmentQuery({ period: "range", from: "2026-08-31", to: "2026-08-01" }, clinicToday).rangeError, "reversed");
  assert.equal(normalizeAppointmentQuery({ period: "range", from: "2026-01-01", to: "2027-01-02" }, clinicToday).rangeError, "too_long");
  assert.equal(normalizeAppointmentQuery({ period: "range", from: "not-a-date", to: "2026-08-01" }, clinicToday).rangeError, "missing_or_invalid");
});

test("combined filters survive URL navigation and search stays server-compatible", () => {
  const query = normalizeAppointmentQuery({
    date: "2026-08-20",
    period: "past",
    status: "completed",
    doctor: doctorId,
    q: "Ana Pérez",
    page: "3"
  }, clinicToday);
  const href = buildAppointmentAgendaHref(query);
  assert.match(href, /date=2026-08-20/);
  assert.match(href, /period=past/);
  assert.match(href, /status=completed/);
  assert.match(href, new RegExp(`doctor=${doctorId}`));
  assert.match(href, /q=Ana\+P%C3%A9rez/);
  assert.match(href, /page=3/);
  assert.equal(buildAppointmentSearchFilter("Ana Pérez", [doctorId]), `title.ilike."*Ana Pérez*",patient_id.in.(${doctorId})`);
});

test("pagination is bounded to 25 and clamps out-of-range pages", () => {
  assert.equal(appointmentAgendaPageSize, 25);
  assert.deepEqual(getAppointmentAgendaPagination(61, 2), { page: 2, pageCount: 3, from: 25, to: 49 });
  assert.deepEqual(getAppointmentAgendaPagination(61, 99), { page: 3, pageCount: 3, from: 50, to: 74 });
});

test("agenda implementation keeps filters, metrics and pagination server-side and tenant-safe", () => {
  const server = readFileSync("lib/server/appointments.ts", "utf8");
  const page = readFileSync("app/dashboard/appointments/page.tsx", "utf8");
  const filters = readFileSync("components/appointments/appointment-agenda-filters.tsx", "utf8");

  assert.match(server, /\.from\("appointments"\)[\s\S]+\.eq\("clinic_id", clinicId\)/);
  assert.match(server, /\.from\("patients"\)[\s\S]+\.eq\("clinic_id", clinicId\)[\s\S]+\.ilike\("full_name"/);
  assert.match(server, /\.from\("doctor_public_profiles"\)[\s\S]+\.eq\("clinic_id", clinicId\)/);
  assert.match(server, /\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(server, /\.range\(pagination\.from, pagination\.to\)/);
  assert.match(server, /\.order\("starts_at", \{ ascending \}\)[\s\S]+\.order\("id", \{ ascending \}\)/);
  assert.doesNotMatch(server, /matchesAppointmentSearch|\.filter\(\(appointment\)/);
  assert.match(page, /type="date" name="date"/);
  assert.match(page, /Paginación de citas/);
  assert.match(filters, /Día seleccionado[\s\S]+Mes seleccionado[\s\S]+Próximas citas[\s\S]+Citas pasadas[\s\S]+Todas las citas[\s\S]+Rango personalizado/);
  assert.match(filters, /name="from"[\s\S]+name="to"/);
});
