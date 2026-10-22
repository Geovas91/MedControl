import assert from 'node:assert/strict';
import test from 'node:test';
import { professionalSelection } from '../helpers/professional-selection.ts';

for (const role of ["owner", "admin"]) {
  test(`${role} appointment options use authorized colleagues and preserve the appointment user FK`, async () => {
    const { appointments } = professionalSelection(role);
    const result = await appointments.getAppointmentCreationOptions();
    assert.equal(result.state, "ready");
    assert.deepEqual(Array.from(result.data.doctors, (d: { id: string }) => d.id).sort(), ["doctor-1", "doctor-2"]);
    assert.equal(result.data.doctors.find((d: { id: string }) => d.id === "doctor-1").name, "QA Doctor Uno");
  });
  test(`${role} availability uses clinic-member IDs and never queries a foreign professional`, async () => {
    const { availability, calls } = professionalSelection(role);
    const result = await availability.getProfessionalAvailability("member-2");
    assert.equal(result.state, "ready");
    assert.equal(result.data.selectedProfessionalId, "member-2");
    assert.equal(result.data.canEdit, true);
    assert.equal(result.data.clinic.timezone, "America/Mexico_City");
    assert.deepEqual(Array.from(result.data.professionals, (p: { id: string }) => p.id), ["member-1", "member-2"]);
    assert.equal(calls[0].args.p_clinic_member_id, "member-2");
    await availability.getProfessionalAvailability("foreign");
    assert.equal(calls[1].args.p_clinic_member_id, "member-1");
  });
}

test("doctor receives only their professional identity in appointment and availability selectors", async () => {
  const { appointments, availability, calls } = professionalSelection("doctor");
  const options = await appointments.getAppointmentCreationOptions();
  assert.deepEqual(Array.from(options.data.doctors, (p: { id: string }) => p.id), ["doctor-1"]);
  const week = await availability.getProfessionalAvailability("member-2");
  assert.deepEqual(Array.from(week.data.professionals, (p: { id: string }) => p.id), ["member-1"]);
  assert.equal(calls[0].args.p_clinic_member_id, "member-1");
});

test("assistant keeps read-only availability and existing appointment scheduling access", async () => {
  const { appointments, availability } = professionalSelection("assistant");
  assert.equal((await appointments.getAppointmentCreationOptions()).state, "ready");
  assert.equal((await availability.getProfessionalAvailability()).data.canEdit, false);
});

test("failed protected member lookup stays an error rather than a false empty professional list", async () => {
  const { appointments, availability, calls } = professionalSelection("owner", true);
  assert.equal((await appointments.getAppointmentCreationOptions()).state, "error");
  assert.equal((await availability.getProfessionalAvailability()).state, "error");
  assert.equal(calls.length, 0);
});
