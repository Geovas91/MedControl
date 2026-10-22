import assert from 'node:assert/strict';
import test from 'node:test';
import { qaProfessionals, futureDates, canonicalSlots, discoverSchedule } from '../../scripts/qa/lifecycle/discovery.ts';
const member = '10000000-0000-4000-8000-000000000001';
const rows = [{ id: member, user_id: member, full_name: 'QA synthetic', status: 'active', is_professional: true }];
const slots = ['08:00', '08:30'].map(local_start => ({ local_start, start_at: `2030-01-02T${local_start}:00Z`, end_at: `2030-01-02T${local_start === '08:00' ? '08:30' : '09:00'}:00Z` }));

test('discovery accepts only protected active synthetic professionals and does not broaden an explicit invalid member', () => {
  assert.equal(qaProfessionals(rows)[0].id, member);
  assert.throws(() => qaProfessionals(rows, 'other'), /valid_qa_professional_required/);
  for (const change of [{ status: 'inactive' }, { is_professional: false }, { full_name: 'Real Person' }, { user_id: 'invalid' }]) assert.throws(() => qaProfessionals([{ ...rows[0], ...change }]));
});
test('automatic future date window is bounded across month/year boundaries; explicit bad or past dates block', () => {
  const dates = futureDates('2029-12-31');
  assert.equal(dates[0], '2030-01-01'); assert.equal(dates.length, 14);
  assert.throws(() => futureDates('2030-01-01', '2030-02-30'));
  assert.throws(() => futureDates('2030-01-01', '2030-01-01'));
});
test('available slots must be distinct future canonical half-hours with the correct duration', () => {
  assert.equal(canonicalSlots([...slots, slots[0], { ...slots[0], local_start: '08:15' }], '2030-01-02', 0).length, 2);
  assert.equal(canonicalSlots(slots, '2030-01-02', Date.parse('2031-01-01')).length, 0);
  assert.equal(canonicalSlots([{ ...slots[0], end_at: slots[0].start_at }], '2030-01-02', 0).length, 0);
});
test('discovery uses read callbacks only, finds two same-day slots and leaves unavailable schedules empty', async () => {
  const calls: string[] = [];
  const result = await discoverSchedule(qaProfessionals(rows), ['2030-01-01', '2030-01-02'], async (_, date) => { calls.push(date); return date === '2030-01-02' ? slots : []; }, 0);
  assert.equal(result.slots.length, 2); assert.equal(result.date, '2030-01-02'); assert.equal(calls.length, 2);
  assert.deepEqual((await discoverSchedule(qaProfessionals(rows), ['2030-01-01'], async () => [], 0)).slots, []);
  await assert.rejects(discoverSchedule(qaProfessionals(rows), ['2030-01-01'], async () => { throw new Error('read failed'); }, 0));
});
