-- Run after `npx supabase db reset --local`.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

-- Committed fixtures are required so the two independent dblink sessions can
-- exercise the row lock in submit_verified_review concurrently.
begin;
drop table if exists public.verified_reviews_concurrency_token_test;
delete from public.clinical_change_events where clinic_id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
delete from public.clinical_records where clinic_id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
delete from public.audit_logs where clinic_id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
delete from public.clinics where id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
delete from auth.users where id in (
  'e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004',
  'e1000000-0000-4000-8000-000000000005'
);
insert into auth.users(id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'reviews-owner@example.test'),
  ('e1000000-0000-4000-8000-000000000002', 'reviews-admin@example.test'),
  ('e1000000-0000-4000-8000-000000000003', 'reviews-doctor@example.test'),
  ('e1000000-0000-4000-8000-000000000004', 'reviews-assistant@example.test'),
  ('e1000000-0000-4000-8000-000000000005', 'reviews-other-owner@example.test');

-- Direct auth.users fixtures do not create public.profiles automatically.
-- This is the one profile referenced by both tenant-specific public doctor profiles.
insert into public.profiles(id, full_name, email, role) values
  ('e1000000-0000-4000-8000-000000000003', 'Dra. Reviews Ficticia', 'reviews-doctor@example.test', 'doctor');

insert into public.clinics(id, name) values
  ('e2000000-0000-4000-8000-000000000001', 'Reviews Clínica A'),
  ('e2000000-0000-4000-8000-000000000002', 'Reviews Clínica B');

insert into public.clinic_members(id, clinic_id, user_id, role, status) values
  ('e6000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('e6000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('e6000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'doctor', 'active'),
  ('e6000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'assistant', 'active'),
  ('e6000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000005', 'owner', 'active'),
  ('e6000000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000003', 'doctor', 'active');

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values
  ('e2000000-0000-4000-8000-000000000001', 'basic', 'active', 'manual'),
  ('e2000000-0000-4000-8000-000000000002', 'pro', 'active', 'manual');

insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, email) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Paciente Ficticio A', 'Paciente Ficticio A', 'PAC-REVIEWA1', 'patient-a@example.test'),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'Paciente Ficticio B', 'Paciente Ficticio B', 'PAC-REVIEWB1', 'patient-b@example.test');

insert into public.doctor_public_profiles(id, clinic_id, profile_id, clinic_member_id, slug, display_name, specialty, is_published) values
  ('e5000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000003', 'reviews-doctor-a', 'Dra. Reviews A', 'Medicina general', true),
  ('e5000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000006', 'reviews-doctor-b', 'Dra. Reviews B', 'Medicina general', true);

insert into public.appointments(id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at, status) values
  ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Consulta ficticia 1', now()-interval '3 days', now()-interval '3 days'+interval '1 hour', 'scheduled'),
  ('e4000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Consulta ficticia 2', now()-interval '3 days', now()-interval '3 days'+interval '1 hour', 'scheduled'),
  ('e4000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Consulta ficticia 3', now()-interval '3 days', now()-interval '3 days'+interval '1 hour', 'scheduled'),
  ('e4000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Consulta ficticia 4', now()-interval '3 days', now()-interval '3 days'+interval '1 hour', 'scheduled'),
  ('e4000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Consulta ficticia pendiente', now()+interval '3 days', now()+interval '3 days 1 hour', 'scheduled'),
  ('e4000000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000003', 'Consulta ficticia tenant B', now()-interval '3 days', now()-interval '3 days'+interval '1 hour', 'scheduled'),
  ('e4000000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Consulta legacy 1', now()-interval '4 days', now()-interval '4 days'+interval '1 hour', 'scheduled'),
  ('e4000000-0000-4000-8000-000000000008', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Consulta legacy 2', now()-interval '5 days', now()-interval '5 days'+interval '1 hour', 'scheduled'),
  ('e4000000-0000-4000-8000-000000000009', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Consulta legacy 3', now()-interval '6 days', now()-interval '6 days'+interval '1 hour', 'scheduled');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000003', true);
update public.appointments set status='completed' where id in ('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000004','e4000000-0000-4000-8000-000000000006','e4000000-0000-4000-8000-000000000007','e4000000-0000-4000-8000-000000000008','e4000000-0000-4000-8000-000000000009');
reset role;
insert into public.doctor_reviews(id, doctor_public_profile_id, clinic_id, appointment_id, patient_id, rating, is_verified, is_visible) values
  ('e7000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000007','e3000000-0000-4000-8000-000000000001',5,true,true),
  ('e7000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000008','e3000000-0000-4000-8000-000000000001',4,true,true),
  ('e7000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000001',5,true,true);
commit;

begin;
select extensions.plan(23);

select extensions.ok(
  not exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='review_invitations' and grantee in ('PUBLIC','anon','authenticated')),
  'invitation table has no client grants'
);
select extensions.is(
  pg_get_function_identity_arguments('public.submit_verified_review(text,integer,text)'::regprocedure),
  'p_token text, p_rating integer, p_comment text',
  'public submit accepts only token rating and comment'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.can_create_doctor_review_for_completed_appointment(uuid,uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_verified_doctor_review_for_completed_appointment(uuid,uuid,uuid,integer)', 'execute')
  and not has_function_privilege('service_role', 'public.create_verified_doctor_review_for_completed_appointment(uuid,uuid,uuid,integer)', 'execute'),
  'historical arbitrary-ID review RPCs are fully unavailable'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
create temp table issued_owner on commit drop as select * from public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001');
select extensions.is((select length(raw_token) from issued_owner), 43, 'owner receives one 32-byte Base64URL token');
reset role;
select extensions.is((select generation from public.review_invitations where appointment_id='e4000000-0000-4000-8000-000000000001'), 1, 'first issue persists one invitation generation');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
create temp table issued_admin on commit drop as select * from public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001');
reset role;
select extensions.is((select generation from public.review_invitations where appointment_id='e4000000-0000-4000-8000-000000000001'), 2, 'admin can regenerate and invalidate the previous token');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000003', true);
create temp table issued_doctor on commit drop as select * from public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001');
reset role;
select extensions.is((select generation from public.review_invitations where appointment_id='e4000000-0000-4000-8000-000000000001'), 3, 'assigned doctor can regenerate the invitation');
grant select on issued_owner to anon;
set local role anon;
select extensions.is((select invitation_status from public.get_public_review_invitation((select raw_token from issued_owner))), 'unavailable', 'regeneration invalidates the old token without exposing its lifecycle state');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002')$$,
  '42501', 'Review invitation is unavailable.', 'assistant is blocked'
);

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000006')$$,
  '42501', 'Review invitation is unavailable.', 'cross-tenant issue is blocked'
);
select extensions.throws_ok(
  $$select public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000005')$$,
  '22023', 'Only completed appointments can request a review.', 'non-completed appointment is blocked'
);

reset role;
do $$
begin
  begin
    insert into public.review_invitations(clinic_id,patient_id,appointment_id,doctor_user_id,doctor_public_profile_id,token_hash,expires_at,created_by)
    values ('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000001',repeat('a',64),now()+interval '1 day','e1000000-0000-4000-8000-000000000001');
    raise exception 'Manipulated patient was accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.review_invitations(clinic_id,patient_id,appointment_id,doctor_user_id,doctor_public_profile_id,token_hash,expires_at,created_by)
    values ('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000002',repeat('b',64),now()+interval '1 day','e1000000-0000-4000-8000-000000000001');
    raise exception 'Arbitrary doctor profile was accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.review_invitations(clinic_id,patient_id,appointment_id,doctor_user_id,doctor_public_profile_id,token_hash,expires_at,created_by)
    values ('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000001',repeat('c',64),now()+interval '1 day','e1000000-0000-4000-8000-000000000001');
    raise exception 'Manipulated appointment was accepted';
  exception when foreign_key_violation then null; end;
end;
$$;

update public.clinic_subscriptions set status='cancelled' where clinic_id='e2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin
    perform public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002');
    raise exception 'Inactive subscription issued a review invitation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.clinic_subscriptions set status='active' where clinic_id='e2000000-0000-4000-8000-000000000001';

reset role;
select extensions.throws_ok(
  $$select public.submit_verified_review('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 5, null)$$,
  '22023', 'Review link is unavailable.', 'invented token is rejected without exposing token state'
);
select extensions.throws_ok(
  $$select public.submit_verified_review((select raw_token from issued_doctor), 0, null)$$,
  '22023', 'Rating must be between 1 and 5.', 'rating zero is rejected'
);
select extensions.throws_ok(
  $$select public.submit_verified_review((select raw_token from issued_doctor), 6, null)$$,
  '22023', 'Rating must be between 1 and 5.', 'rating six is rejected'
);
select extensions.throws_ok(
  $$select public.submit_verified_review((select raw_token from issued_doctor), 5, repeat('x',1001))$$,
  '22023', 'Review comment is too long.', 'oversized comment is rejected'
);

-- Expired and revoked links remain unusable.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
create temp table issued_expired on commit drop as select * from public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002');
reset role;
update public.review_invitations set created_at=now()-interval '2 days', expires_at=now()-interval '1 second' where appointment_id='e4000000-0000-4000-8000-000000000002';
select extensions.throws_ok(format('select public.submit_verified_review(%L,5,null)', (select raw_token from issued_expired)), '22023', 'Review link is unavailable.', 'expired token is rejected without exposing token state');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
create temp table issued_revoked on commit drop as select * from public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000003');
select public.revoke_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000003');
reset role;
select extensions.throws_ok(format('select public.submit_verified_review(%L,5,null)', (select raw_token from issued_revoked)), '22023', 'Review link is unavailable.', 'revoked token is rejected without exposing token state');

select extensions.ok(
  (select count(*) from public.doctor_reviews where id in ('e7000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000003') and invitation_id is null) = 3,
  'legacy demo reviews survive without fabricated invitations'
);
select extensions.ok(
  not has_table_privilege('anon','public.doctor_reviews','insert'),
  'client cannot set verified or visible through direct inserts'
);
commit;

-- A committed invitation is submitted from two real database sessions.
begin;
create table public.verified_reviews_concurrency_token_test(raw_token text not null);
grant select, insert on public.verified_reviews_concurrency_token_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
insert into public.verified_reviews_concurrency_token_test
select raw_token from public.issue_review_invitation_for_current_user('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004');
reset role;
commit;

begin;
-- Route back through the published local port so pg_hba uses SCRAM instead of
-- loopback trust. dblink rejects passwordless trust connections for callers
-- that are not database superusers, even when a password appears in the DSN.
select extensions.dblink_connect('review_c1', 'host=host.docker.internal port=54322 dbname=' || current_database() || ' user=supabase_admin password=postgres');
select extensions.dblink_connect('review_c2', 'host=host.docker.internal port=54322 dbname=' || current_database() || ' user=supabase_admin password=postgres');
do $$
declare v_token text;
begin
  select raw_token into v_token from public.verified_reviews_concurrency_token_test;
  perform extensions.dblink_send_query('review_c1', format('select public.submit_verified_review(%L, 5, %L)', v_token, 'Excelente atención ficticia'));
  perform extensions.dblink_send_query('review_c2', format('select public.submit_verified_review(%L, 4, %L)', v_token, 'Segundo submit concurrente'));
end;
$$;
create temp table concurrency_results(result boolean);
insert into concurrency_results select result from extensions.dblink_get_result('review_c1', false) as response(result boolean);
insert into concurrency_results select result from extensions.dblink_get_result('review_c2', false) as response(result boolean);
select extensions.is((select count(*) from concurrency_results where result), 1::bigint, 'exactly one concurrent submit reports success');
select extensions.is(
  (select count(*) from public.doctor_reviews where appointment_id='e4000000-0000-4000-8000-000000000004'),
  1::bigint,
  'two concurrent submits create exactly one review'
);
select extensions.is(
  (select count(*) from public.review_invitations where appointment_id='e4000000-0000-4000-8000-000000000004' and used_at is not null),
  1::bigint,
  'two concurrent submits produce exactly one consumption'
);
select extensions.throws_ok(
  format('select public.submit_verified_review(%L, 5, null)', (select raw_token from public.verified_reviews_concurrency_token_test)),
  '22023', 'Review link is unavailable.', 'used token cannot be submitted again or disclose its state'
);
select extensions.dblink_disconnect('review_c1');
select extensions.dblink_disconnect('review_c2');
drop table public.verified_reviews_concurrency_token_test;
delete from public.clinical_change_events where clinic_id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
delete from public.clinical_records where clinic_id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
delete from public.audit_logs where clinic_id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
delete from public.clinics where id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
delete from auth.users where id in (
  'e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004',
  'e1000000-0000-4000-8000-000000000005'
);
select * from extensions.finish();
commit;
