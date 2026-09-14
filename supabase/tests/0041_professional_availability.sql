-- Run after `npx supabase db reset --local`.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(24);

insert into auth.users(id, email) values
  ('41100000-0000-4000-8000-000000000001', 'availability-owner@example.test'),
  ('41100000-0000-4000-8000-000000000002', 'availability-admin@example.test'),
  ('41100000-0000-4000-8000-000000000003', 'availability-doctor@example.test'),
  ('41100000-0000-4000-8000-000000000004', 'availability-assistant@example.test'),
  ('41100000-0000-4000-8000-000000000005', 'availability-outsider@example.test'),
  ('41100000-0000-4000-8000-000000000006', 'availability-foreign-owner@example.test');

insert into public.clinics(id, name, timezone) values
  ('41200000-0000-4000-8000-000000000001', 'Availability Clinic A', 'America/Mexico_City'),
  ('41200000-0000-4000-8000-000000000002', 'Availability Clinic B', 'America/Mexico_City');

insert into public.clinic_members(id, clinic_id, user_id, role, status) values
  ('41300000-0000-4000-8000-000000000001', '41200000-0000-4000-8000-000000000001', '41100000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('41300000-0000-4000-8000-000000000002', '41200000-0000-4000-8000-000000000001', '41100000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('41300000-0000-4000-8000-000000000003', '41200000-0000-4000-8000-000000000001', '41100000-0000-4000-8000-000000000003', 'doctor', 'active'),
  ('41300000-0000-4000-8000-000000000004', '41200000-0000-4000-8000-000000000001', '41100000-0000-4000-8000-000000000004', 'assistant', 'active'),
  ('41300000-0000-4000-8000-000000000005', '41200000-0000-4000-8000-000000000002', '41100000-0000-4000-8000-000000000006', 'owner', 'active'),
  ('41300000-0000-4000-8000-000000000006', '41200000-0000-4000-8000-000000000002', '41100000-0000-4000-8000-000000000003', 'doctor', 'active');

-- B4.4 keeps new owner memberships non-professional by default. This fixture
-- explicitly models the owner as a professional for the legacy schedule test.
update public.clinic_members set is_professional = true
where id = '41300000-0000-4000-8000-000000000001';

select extensions.ok(
  has_function_privilege('authenticated', 'public.get_professional_availability_for_date(uuid,uuid,date)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_professional_availability_for_date(uuid,uuid,date)', 'EXECUTE'),
  'availability query is authenticated-only');
select extensions.ok(
  not has_table_privilege('anon', 'public.professional_availability_rules', 'select')
  and not has_table_privilege('anon', 'public.professional_availability_rules', 'insert'),
  'anon has no direct availability table access');
select extensions.ok(
  (select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = 'public.get_professional_availability_for_date(uuid,uuid,date)'::regprocedure),
  'availability query has a fixed SECURITY DEFINER boundary');
select extensions.ok(
  exists(select 1 from pg_constraint where conname = 'professional_availability_rules_no_active_overlap'),
  'active overlapping rules are protected by an exclusion constraint');

set local role authenticated;
select set_config('request.jwt.claim.sub', '41100000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from, effective_until)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 1, '09:00', '13:00', date '2026-01-01', date '2026-09-30')$$,
  'owner can manage a clinic professional schedule');
select extensions.lives_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from, effective_until)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 1, '15:00', '18:00', date '2026-01-01', date '2026-09-30')$$,
  'multiple non-overlapping intervals on one weekday are allowed');
select extensions.throws_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 1, '12:00', '16:00', date '2026-01-01')$$,
  '23P01', null, 'overlapping active intervals are rejected');
select extensions.throws_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 1, '13:00', '13:00', date '2026-01-01')$$,
  '23514', null, 'start_time equal to end_time is rejected');
select extensions.throws_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from, effective_until)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 2, '09:00', '10:00', date '2026-10-01', date '2026-09-30')$$,
  '23514', null, 'effective_until before effective_from is rejected');
select extensions.throws_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000006', 1, '09:00', '10:00', date '2026-01-01')$$,
  '22023', 'Professional is unavailable for this clinic.', 'professional from another clinic is rejected');
select extensions.throws_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000099', 1, '09:00', '10:00', date '2026-01-01')$$,
  '22023', 'Professional is unavailable for this clinic.', 'unknown professional is rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41100000-0000-4000-8000-000000000002', true);
select extensions.lives_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 2, '10:00', '12:00', date '2026-01-01')$$,
  'admin can manage a clinic professional schedule');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41100000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 3, '09:00', '11:00', date '2026-01-01')$$,
  'doctor can manage only their own schedule');
select extensions.throws_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000001', 3, '09:00', '11:00', date '2026-01-01')$$,
  '42501', null, 'doctor cannot manage another professional schedule');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41100000-0000-4000-8000-000000000004', true);
select extensions.ok(
  (select count(*)::integer from public.professional_availability_rules where clinic_id = '41200000-0000-4000-8000-000000000001') = 4,
  'assistant can read clinic availability for scheduling');
select extensions.throws_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 4, '09:00', '11:00', date '2026-01-01')$$,
  '42501', null, 'assistant cannot manage availability');
select extensions.throws_ok(
  $$select * from public.get_professional_availability_for_date('41200000-0000-4000-8000-000000000002', '41300000-0000-4000-8000-000000000006', date '2026-09-14')$$,
  '42501', 'Availability is unavailable.', 'tenant A cannot query tenant B availability');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41100000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$insert into public.professional_availability_rules(clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from)
    values ('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', 1, '09:00', '14:00', date '2026-10-01')$$,
  'future-dated replacement interval is allowed after inclusive historical end');
select extensions.is(
  (select json_agg(json_build_object('start', start_time::text, 'end', end_time::text) order by start_time)::text
   from public.get_professional_availability_for_date('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', date '2026-09-28')),
  '[{"start" : "09:00:00", "end" : "13:00:00"}, {"start" : "15:00:00", "end" : "18:00:00"}]',
  'ISO weekday 1 resolves Monday historical intervals');
select extensions.is(
  (select json_agg(json_build_object('start', start_time::text, 'end', end_time::text) order by start_time)::text
   from public.get_professional_availability_for_date('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', date '2026-10-05')),
  '[{"start" : "09:00:00", "end" : "14:00:00"}]',
  'future effective interval replaces historical Monday interval');
select extensions.is(
  (select count(*)::integer
   from public.get_professional_availability_for_date('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', date '2026-09-15')),
  1,
  'ISO weekday 2 resolves Tuesday only');
select extensions.is_empty(
  $$select * from public.get_professional_availability_for_date('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', date '2026-09-20')$$,
  'Sunday without a rule returns an empty safe result');
select extensions.throws_ok(
  $$select * from public.get_professional_availability_for_date('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000003', null)$$,
  '22023', 'A local date is required.', 'availability query requires an explicit clinic-local date');
select extensions.throws_ok(
  $$select * from public.get_professional_availability_for_date('41200000-0000-4000-8000-000000000001', '41300000-0000-4000-8000-000000000006', date '2026-09-14')$$,
  '22023', 'Professional is unavailable for this clinic.', 'query rejects a professional from another clinic');
reset role;

select * from extensions.finish();
rollback;
