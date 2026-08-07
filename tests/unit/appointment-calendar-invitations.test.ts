import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAppointmentCalendarOperation,
  getCalendarDeliveryPreflight,
  getStatusCalendarOperation,
  hasAppointmentCalendarRelevantChange,
  isCurrentAppointmentVersion,
  prepareCalendarInvitationState
} from "../../lib/calendar/invitation.ts";
import { escapeIcsText, foldIcsLine, generateAppointmentIcs } from "../../lib/calendar/ics.ts";
import { buildResendEmailPayload } from "../../lib/email/resend-payload.ts";
import { buildAppointmentInvitationEmail } from "../../lib/email/templates/appointment-invitation.ts";

const baseIcs = {
  uid: "11111111-1111-4111-8111-111111111111@calendar.clinicontrol.mx",
  sequence: 3,
  startsAt: "2030-01-01T15:00:00.000Z",
  endsAt: "2030-01-01T15:30:00.000Z",
  clinicName: "Clínica Demo, Sur",
  doctorName: "Dra. Demo",
  organizerEmail: "agenda@example.com",
  attendeeEmail: "patient@example.com",
  location: "Consultorio 1; planta alta",
  meetingUrl: "https://example.com/meeting",
  timestamp: "2029-12-01T12:00:00.000Z"
} as const;

type SimulatedInviteState = { sequence: number; operationKey: string; deliveryStatus: "sent" | "delivery_unknown" };

function simulateDelivery(
  existing: SimulatedInviteState | null,
  input: { operationKey: string; recipientValid: boolean; providerReady: boolean; result?: "sent" | "delivery_unknown" }
) {
  const preflight = getCalendarDeliveryPreflight(input);
  if (preflight !== "ready") return { outcome: preflight, state: existing };

  const prepared = prepareCalendarInvitationState(existing, input.operationKey);
  if (!prepared.shouldSend) return { outcome: "duplicate" as const, state: existing };
  return {
    outcome: input.result ?? "sent",
    state: { sequence: prepared.sequence, operationKey: prepared.operationKey, deliveryStatus: input.result ?? "sent" }
  };
}

function simulateVersionedDelivery(
  currentVersion: string,
  existing: SimulatedInviteState | null,
  input: { appointmentVersion: string; operationKey: string; recipientValid: boolean; providerReady: boolean }
) {
  if (!isCurrentAppointmentVersion(currentVersion, input.appointmentVersion)) {
    return { outcome: "duplicate" as const, state: existing };
  }
  return simulateDelivery(existing, input);
}

test("REQUEST ICS uses stable identity, sequence, UTC, CRLF and folded lines", () => {
  const ics = generateAppointmentIcs({ ...baseIcs, method: "REQUEST" });
  assert.match(ics, /\r\nMETHOD:REQUEST\r\n/);
  assert.match(ics, new RegExp(`UID:${baseIcs.uid}`));
  assert.match(ics, /SEQUENCE:3\r\n/);
  assert.match(ics, /DTSTART:20300101T150000Z/);
  assert.match(ics, /ORGANIZER:mailto:agenda@example.com/);
  assert.match(ics, /ATTENDEE;RSVP=TRUE:mailto:patient@example.com/);
  assert.match(ics, /STATUS:CONFIRMED/);
  assert.equal(ics.replaceAll("\r\n", "").includes("\n"), false);
  for (const line of ics.split("\r\n").filter(Boolean)) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line exceeds 75 octets: ${line}`);
  }
});

test("CANCEL ICS keeps UID and marks the event cancelled", () => {
  const ics = generateAppointmentIcs({ ...baseIcs, method: "CANCEL", sequence: 4 });
  assert.match(ics, /METHOD:CANCEL/);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, /SEQUENCE:4/);
  assert.match(ics, new RegExp(`UID:${baseIcs.uid}`));
});

test("ICS text escaping and UTF-8 folding are RFC-safe", () => {
  assert.equal(escapeIcsText("A\\B,C;D\nE"), "A\\\\B\\,C\\;D\\nE");
  const folded = foldIcsLine(`DESCRIPTION:${"á".repeat(80)}`);
  assert.match(folded, /\r\n /);
  for (const line of folded.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
});

test("email templates cover all lifecycle events and use clinic timezone", () => {
  for (const kind of ["confirmation", "rescheduled", "cancelled", "restored"] as const) {
    const template = buildAppointmentInvitationEmail({
      kind,
      clinicName: "Clínica <Demo>",
      doctorName: "Dra. Ejemplo",
      startsAt: "2030-01-01T15:00:00.000Z",
      timeZone: "America/Mexico_City",
      location: "Consultorio 1"
    });
    assert.match(template.html, /Clínica &lt;Demo&gt;/);
    assert.match(template.text, /9:00 a\.m\./);
  }
});

test("Resend payload preserves calendar attachment without sending", () => {
  const payload = buildResendEmailPayload(
    { from: "CliniControl <agenda@example.com>" },
    {
      to: "patient@example.com",
      subject: "Cita",
      html: "<p>Cita</p>",
      text: "Cita",
      attachments: [{ content: "BEGIN:VCALENDAR", filename: "cita.ics", contentType: "text/calendar; method=REQUEST" }],
      idempotencyKey: "not-part-of-message-body"
    }
  );
  assert.equal(payload.attachments?.[0]?.filename, "cita.ics");
  assert.equal(payload.attachments?.[0]?.contentType, "text/calendar; method=REQUEST");
  assert.equal("idempotencyKey" in payload, false);
});

test("idempotency keeps duplicate sequence and advances only for a new operation", () => {
  const created = prepareCalendarInvitationState(null, "appointment:created");
  assert.deepEqual(created, { sequence: 0, operationKey: "appointment:created", shouldSend: true });
  const duplicate = prepareCalendarInvitationState(created, "appointment:created");
  assert.deepEqual(duplicate, { sequence: 0, operationKey: "appointment:created", shouldSend: false });
  const changed = prepareCalendarInvitationState(created, "appointment:rescheduled");
  assert.deepEqual(changed, { sequence: 1, operationKey: "appointment:rescheduled", shouldSend: true });
});

test("a newly created appointment uses its database version and reaches calendar preparation", () => {
  const insertedAppointment = {
    id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2030-01-01T15:00:00.123456+00:00"
  };
  const operation = buildAppointmentCalendarOperation(
    insertedAppointment.id,
    "created",
    insertedAppointment.updated_at
  );

  assert.equal(operation.appointmentVersion, insertedAppointment.updated_at);
  assert.notEqual(operation.appointmentVersion, "");
  assert.doesNotMatch(operation.operationKey, /undefined/);
  const delivery = simulateVersionedDelivery(insertedAppointment.updated_at, null, {
    appointmentVersion: operation.appointmentVersion,
    operationKey: operation.operationKey,
    recipientValid: true,
    providerReady: true
  });
  assert.equal(delivery.outcome, "sent");

  const concurrentVersion = "2030-01-01T15:00:01.000000+00:00";
  const staleDelivery = simulateVersionedDelivery(concurrentVersion, null, {
    appointmentVersion: operation.appointmentVersion,
    operationKey: operation.operationKey,
    recipientValid: true,
    providerReady: true
  });
  assert.equal(staleDelivery.outcome, "duplicate");
});

test("creating without email can retry successfully after adding email", () => {
  const missing = simulateDelivery(null, { operationKey: "appointment:created", recipientValid: false, providerReady: true });
  assert.deepEqual(missing, { outcome: "missing_recipient", state: null });
  const retry = simulateDelivery(missing.state, { operationKey: "appointment:created", recipientValid: true, providerReady: true });
  assert.equal(retry.outcome, "sent");
  assert.equal(retry.state?.sequence, 0);
});

test("disabled provider can retry successfully after it is enabled", () => {
  const disabled = simulateDelivery(null, { operationKey: "appointment:created", recipientValid: true, providerReady: false });
  assert.deepEqual(disabled, { outcome: "disabled", state: null });
  const retry = simulateDelivery(disabled.state, { operationKey: "appointment:created", recipientValid: true, providerReady: true });
  assert.equal(retry.outcome, "sent");
  assert.equal(retry.state?.sequence, 0);
});

test("repeating an already sent operation returns duplicate", () => {
  const sent = simulateDelivery(null, { operationKey: "appointment:created", recipientValid: true, providerReady: true });
  const repeated = simulateDelivery(sent.state, { operationKey: "appointment:created", recipientValid: true, providerReady: true });
  assert.equal(repeated.outcome, "duplicate");
  assert.deepEqual(repeated.state, sent.state);
});

test("delivery_unknown is consumed and is not resent automatically", () => {
  const unknown = simulateDelivery(null, {
    operationKey: "appointment:created",
    recipientValid: true,
    providerReady: true,
    result: "delivery_unknown"
  });
  const repeated = simulateDelivery(unknown.state, { operationKey: "appointment:created", recipientValid: true, providerReady: true });
  assert.equal(repeated.outcome, "duplicate");
  assert.equal(repeated.state?.deliveryStatus, "delivery_unknown");
});

test("preflight retries do not allocate or increment sequence before a real delivery", () => {
  let state: SimulatedInviteState | null = null;
  state = simulateDelivery(state, { operationKey: "appointment:created", recipientValid: false, providerReady: true }).state;
  assert.equal(state, null);
  state = simulateDelivery(state, { operationKey: "appointment:created", recipientValid: true, providerReady: false }).state;
  assert.equal(state, null);
  state = simulateDelivery(state, { operationKey: "appointment:created", recipientValid: true, providerReady: true }).state;
  assert.equal(state?.sequence, 0);
});

test("only calendar-relevant edits and cancel/restore status changes trigger delivery", () => {
  const original = { doctorId: "doctor-1", startsAt: baseIcs.startsAt, endsAt: baseIcs.endsAt, location: "A" };
  assert.equal(hasAppointmentCalendarRelevantChange(original, { ...original }), false);
  assert.equal(hasAppointmentCalendarRelevantChange(original, { ...original, location: "B" }), true);
  assert.equal(hasAppointmentCalendarRelevantChange(original, { ...original, doctorId: "doctor-2" }), true);
  assert.equal(hasAppointmentCalendarRelevantChange(original, { ...original, startsAt: "2030-01-01T16:00:00.000Z" }), true);
  assert.deepEqual(getStatusCalendarOperation("cancelled"), { method: "CANCEL", reason: "cancelled" });
  assert.deepEqual(getStatusCalendarOperation("restored"), { method: "REQUEST", reason: "restored" });
  assert.equal(getStatusCalendarOperation("confirmed"), null);
});

test("migration contains atomic locking and both uniqueness barriers", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/0020_appointment_calendar_email_invitations.sql", import.meta.url), "utf8");
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /appointment_invites_appointment_email_unique_idx/);
  assert.match(migration, /appointment_invites_email_idempotency_key_unique_idx/);
  assert.match(migration, /grant select, insert, update on table public\.appointment_invites to authenticated/i);
  assert.match(migration, /last_idempotency_key = v_key/);
  assert.match(migration, /sequence = i\.sequence \+ 1/);
});

test("service performs recipient and provider preflight before reserving idempotency", () => {
  const service = readFileSync(new URL("../../lib/server/appointment-calendar-email.ts", import.meta.url), "utf8");
  assert.ok(service.indexOf("getCalendarDeliveryPreflight") < service.indexOf("prepare_appointment_email_invite"));
  assert.ok(service.indexOf('if (preflight !== "ready") return preflight') < service.indexOf(".rpc(\"prepare_appointment_email_invite\""));
});

test("create, update and status mutations return PostgreSQL updated_at for calendar operations", () => {
  const createService = readFileSync(new URL("../../lib/server/create-appointment.ts", import.meta.url), "utf8");
  const updateService = readFileSync(new URL("../../lib/server/update-appointment.ts", import.meta.url), "utf8");
  const statusService = readFileSync(new URL("../../lib/server/update-appointment-status.ts", import.meta.url), "utf8");

  assert.match(createService, /\.insert\([\s\S]+?\.select\("id, updated_at"\)\s*\.single\(\)/);
  assert.match(updateService, /\.update\([\s\S]+?\.select\("id, patient_id, updated_at"\)\s*\.maybeSingle\(\)/);
  assert.match(statusService, /\.update\([\s\S]+?\.select\("id, patient_id, starts_at, status, updated_at"\)\s*\.maybeSingle\(\)/);
});
