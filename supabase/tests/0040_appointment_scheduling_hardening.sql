-- Run after a local `supabase db reset`.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(20);

insert into auth.users(id, email) values
  ('40100000-0000-4000-8000-000000000001', 'schedule-owner@example.test'),
  ('40100000-0000-4000-8000-000000000002', 'schedule-doctor@example.test'),
  ('40100000-0000-4000-8000-000000000003', 'schedule-assistant@example.test'),
  ('40100000-0000-4000-8000-000000000004', 'schedule-outsider@example.test'),
  ('40100000-0000-4000-8000-000000000005', 'schedule-foreign-doctor@example.test');

insert into public.clinics(id, name, timezone) values
  ('40200000-0000-4000-8000-000000000001', 'Scheduling Clinic A', 'America/Mexico_City'),
  ('40200000-0000-4000-8000-000000000002', 'Scheduling Clinic B', 'America/Mexico_City');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('40200000-0000-4000-8000-000000000001', '40100000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('40200000-0000-4000-8000-000000000001', '40100000-0000-4000-8000-000000000002', 'doctor', 'active'),
  ('40200000-0000-4000-8000-000000000001', '40100000-0000-4000-8000-000000000003', 'assistant', 'active'),
  ('40200000-0000-4000-8000-000000000002', '40100000-0000-4000-8000-000000000005', 'doctor', 'active');

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values
  ('40200000-0000-4000-8000-000000000001', 'pro', 'active', 'manual'),
  ('40200000-0000-4000-8000-000000000002', 'pro', 'active', 'manual');

insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier) values
  ('40300000-0000-4000-8000-000000000001', '40200000-0000-4000-8000-000000000001', 'Scheduling Patient A', 'Scheduling Patient A', 'PAC-SCHEDA01'),
  ('40300000-0000-4000-8000-000000000002', '40200000-0000-4000-8000-000000000002', 'Scheduling Patient B', 'Scheduling Patient B', 'PAC-SCHEDB01');

select extensions.ok(
  (select prosecdef from pg_proc where oid = 'public.create_appointment_for_current_user(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz)'::regprocedure),
  'creation RPC has the guarded definer boundary'
);
select extensions.ok(
  (select proconfig = array['search_path=public, pg_temp'] from pg_proc where oid = 'public.create_appointment_for_current_user(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz)'::regprocedure),
  'creation RPC fixes its search_path'
);
select extensions.ok(has_function_privilege('authenticated', 'public.create_appointment_for_current_user(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz)', 'EXECUTE'), 'authenticated can execute creation RPC');
select extensions.ok(not has_function_privilege('anon', 'public.create_appointment_for_current_user(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz)', 'EXECUTE'), 'anon cannot execute creation RPC');
select extensions.ok(not has_table_privilege('authenticated', 'public.appointments', 'INSERT'), 'authenticated cannot bypass creation RPC with a direct insert');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40100000-0000-4000-8000-000000000001', true);

select extensions.lives_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000002', 'Valid appointment', 'General', 'Room 1', null,
    timestamptz '2035-09-15 15:30:00+00', timestamptz '2035-09-15 16:00:00+00'
  )$$,
  'owner creates an authorized appointment'
);
select extensions.is((select count(*)::integer from public.appointments where title='Valid appointment'), 1, 'successful insert exists exactly once');
select extensions.is((select status::text from public.appointments where title='Valid appointment'), 'scheduled', 'new appointment starts scheduled');
select extensions.ok(exists(select 1 from public.appointments where title='Valid appointment'), 'created appointment is visible in the tenant agenda');

select extensions.throws_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000002', 'Overlapping appointment', null, null, null,
    timestamptz '2035-09-15 15:45:00+00', timestamptz '2035-09-15 16:15:00+00'
  )$$,
  '23P01', 'Appointment time conflict.', 'occupied time is rejected by the authoritative transaction'
);
select extensions.lives_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000002', 'Adjacent appointment', null, null, null,
    timestamptz '2035-09-15 16:00:00+00', timestamptz '2035-09-15 16:30:00+00'
  )$$,
  'adjacent non-overlapping time is accepted'
);
select extensions.throws_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000002',
    '40100000-0000-4000-8000-000000000002', 'Cross patient', null, null, null,
    timestamptz '2035-09-16 15:30:00+00', timestamptz '2035-09-16 16:00:00+00'
  )$$,
  '22023', 'Patient is unavailable.', 'cross-clinic patient is rejected'
);
select extensions.throws_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000005', 'Cross doctor', null, null, null,
    timestamptz '2035-09-16 15:30:00+00', timestamptz '2035-09-16 16:00:00+00'
  )$$,
  '22023', 'Professional is unavailable.', 'cross-clinic doctor is rejected'
);
select extensions.throws_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000002', '', null, null, null,
    timestamptz '2035-09-16 15:30:00+00', timestamptz '2035-09-16 16:00:00+00'
  )$$,
  '22023', 'Appointment input is invalid.', 'incomplete appointment is rejected'
);
select extensions.throws_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000002', 'Invalid range', null, null, null,
    timestamptz '2035-09-16 16:00:00+00', timestamptz '2035-09-16 15:30:00+00'
  )$$,
  '22023', 'Appointment input is invalid.', 'invalid time range is rejected'
);

select set_config('request.jwt.claim.sub', '40100000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000002', 'Assistant denied', null, null, null,
    timestamptz '2035-09-17 15:30:00+00', timestamptz '2035-09-17 16:00:00+00'
  )$$,
  'assistant can create appointments through the guarded RPC'
);

select set_config('request.jwt.claim.sub', '40100000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000002', 'Outsider denied', null, null, null,
    timestamptz '2035-09-17 15:30:00+00', timestamptz '2035-09-17 16:00:00+00'
  )$$,
  '42501', 'Appointment creation is not allowed.', 'non-member cannot create appointments'
);

select set_config('request.jwt.claim.sub', '40100000-0000-4000-8000-000000000002', true);
select extensions.lives_ok(
  $$select * from public.create_appointment_for_current_user(
    '40200000-0000-4000-8000-000000000001', '40300000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000002', 'Doctor appointment', null, null, null,
    timestamptz '2035-09-18 15:30:00+00', timestamptz '2035-09-18 16:00:00+00'
  )$$,
  'doctor can create an appointment in the active tenant'
);
select extensions.is((select count(*)::integer from public.appointments where clinic_id='40200000-0000-4000-8000-000000000002'), 0, 'RLS hides the foreign tenant agenda');
select extensions.throws_ok(
  $$insert into public.appointments(clinic_id,patient_id,doctor_id,title,starts_at,ends_at)
    values('40200000-0000-4000-8000-000000000001','40300000-0000-4000-8000-000000000001',
      '40100000-0000-4000-8000-000000000002','Direct bypass',now()+interval '1 day',now()+interval '1 day 1 hour')$$,
  '42501', null, 'authenticated cannot bypass the guarded creation RPC'
);

reset role;
select * from extensions.finish();
rollback;
