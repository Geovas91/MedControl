-- Run after `npx supabase db reset --local`.
create extension if not exists pgtap with schema extensions;

begin;
insert into auth.users(id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'runner-owner@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'runner-doctor@example.test');
insert into public.profiles(id, full_name, email, role) values
  ('a1000000-0000-4000-8000-000000000001', 'Runner Owner', 'runner-owner@example.test', 'admin'),
  ('a1000000-0000-4000-8000-000000000002', 'Runner Doctor', 'runner-doctor@example.test', 'doctor');
insert into public.clinics(id, name, timezone)
values ('a2000000-0000-4000-8000-000000000001', 'Runner Clinic', 'America/Mexico_City');
insert into public.clinic_members(id, clinic_id, user_id, role, status) values
  ('a2100000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('a2100000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'doctor', 'active');
insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider, current_period_end)
values ('a2000000-0000-4000-8000-000000000001', 'basic', 'active', 'manual', now() + interval '30 days');
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, email)
values ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Runner Patient', 'Runner', 'PAC-RUNNERTEST', 'runner-patient@example.test');
insert into public.appointments(id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at)
values ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
  'Runner fixture', now() + interval '5 days', now() + interval '5 days 1 hour');
delete from public.appointment_automation_jobs where clinic_id = 'a2000000-0000-4000-8000-000000000001';
insert into public.appointment_automation_jobs(id, clinic_id, appointment_id, type, source_version,
  scheduled_for, next_attempt_at, dedupe_key)
select ('a5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
  'reminder_email', now(), now() - interval '1 minute', now() - interval '1 minute', 'runner-hardening-' || n
from generate_series(1, 5) n;

select extensions.plan(27);
select extensions.has_column('public', 'appointment_automation_jobs', 'lease_token', 'jobs have a per-claim fencing token');
select extensions.has_column('public', 'appointment_automation_jobs', 'delivery_state', 'jobs persist delivery lifecycle');
select extensions.has_column('public', 'appointment_automation_jobs', 'delivery_accepted_at', 'jobs persist provider acceptance time');
select extensions.ok(not exists(
  select 1 from information_schema.routine_privileges
  where routine_schema='public' and routine_name in (
    'renew_appointment_automation_job_lease','begin_appointment_automation_delivery',
    'mark_appointment_automation_delivery_accepted','finish_appointment_automation_job'
  ) and grantee in ('PUBLIC','anon','authenticated')
), 'runner mutation RPCs are not client executable');

create temporary table claims as
select * from public.claim_due_appointment_automation_jobs('runner_current', 1, 30);
select extensions.is((select count(*)::integer from claims), 1, 'one due job is claimed');
select extensions.ok((select lease_token is not null from claims), 'claim returns a fencing token');
select extensions.ok(exists(select 1 from public.appointment_automation_jobs where id=(select id from claims)
  and status='processing' and locked_by='runner_current'), 'active claim remains exclusively owned');
select extensions.is(public.renew_appointment_automation_job_lease((select id from claims), 'runner_current', gen_random_uuid(), 90), false,
  'stale token cannot renew');
select extensions.is(public.renew_appointment_automation_job_lease((select id from claims), 'runner_current', (select lease_token from claims), 90), true,
  'current token renews its lease');
select extensions.is(public.begin_appointment_automation_delivery((select id from claims), 'runner_current', gen_random_uuid()), false,
  'stale token cannot begin delivery');
select extensions.is(public.begin_appointment_automation_delivery((select id from claims), 'runner_current', (select lease_token from claims)), true,
  'current token begins delivery atomically');
select extensions.is(public.mark_appointment_automation_delivery_accepted((select id from claims), 'runner_current', gen_random_uuid()), false,
  'stale token cannot mark provider acceptance');
select extensions.is(public.mark_appointment_automation_delivery_accepted((select id from claims), 'runner_current', (select lease_token from claims)), true,
  'current token marks provider acceptance');
select extensions.is(public.finish_appointment_automation_job((select id from claims), 'runner_current', gen_random_uuid(), 'succeeded', null, null), false,
  'stale token cannot finish');
select extensions.is(public.finish_appointment_automation_job((select id from claims), 'runner_current', (select lease_token from claims), 'succeeded', null, null), true,
  'current token finishes accepted delivery');
select extensions.ok(exists(select 1 from public.appointment_automation_jobs where id=(select id from claims)
  and status='succeeded' and delivery_state='persisted' and lease_token is null), 'successful terminal state is persisted and unlocks the job');
select extensions.ok(not exists(select 1 from public.appointment_automation_jobs where id=(select id from claims)
  and status in ('pending','retry_pending','processing')), 'terminal job is never reprocessed');

create temporary table retry_claim as select * from public.claim_due_appointment_automation_jobs('runner_retry', 1, 30);
select public.begin_appointment_automation_delivery((select id from retry_claim), 'runner_retry', (select lease_token from retry_claim));
select extensions.is(public.finish_appointment_automation_job((select id from retry_claim), 'runner_retry', (select lease_token from retry_claim),
  'retry', 'rate_limited', now()+interval '5 minutes'), true, 'known pre-acceptance provider failure is retryable');
select extensions.ok(exists(select 1 from public.appointment_automation_jobs where id=(select id from retry_claim)
  and status='retry_pending' and delivery_state='failed_before_acceptance'), 'retry preserves explicit pre-acceptance state');

create temporary table uncertain_claim as select * from public.claim_due_appointment_automation_jobs('runner_uncertain', 1, 30);
select public.begin_appointment_automation_delivery((select id from uncertain_claim), 'runner_uncertain', (select lease_token from uncertain_claim));
update public.appointment_automation_jobs set lease_expires_at=now()-interval '1 second' where id=(select id from uncertain_claim);
update public.appointment_automation_jobs set next_attempt_at=now()+interval '1 hour'
where status='pending' and id<>(select id from uncertain_claim);
select count(*) from public.claim_due_appointment_automation_jobs('runner_recovery', 1, 30);
select extensions.ok(exists(select 1 from public.appointment_automation_jobs where id=(select id from uncertain_claim)
  and status='failed' and delivery_state='uncertain' and last_error_code='delivery_uncertain'),
  'expired dispatch is terminalized uncertain without resend');

update public.appointment_automation_jobs set next_attempt_at=now()-interval '1 second' where status='pending';
create temporary table stale_claim as select * from public.claim_due_appointment_automation_jobs('runner_stale', 1, 30);
update public.appointment_automation_jobs set lease_expires_at=now()-interval '1 second' where id=(select id from stale_claim);
create temporary table replacement_claim as select * from public.claim_due_appointment_automation_jobs('runner_replacement', 1, 30);
select extensions.is(public.finish_appointment_automation_job((select id from stale_claim), 'runner_stale', (select lease_token from stale_claim),
  'failed', 'runner_error', null), false, 'old worker cannot mutate after replacement claim');
select extensions.is(public.finish_appointment_automation_job((select id from replacement_claim), 'runner_replacement', (select lease_token from replacement_claim),
  'failed', 'provider_error', null), true, 'replacement with current token can fail the job');

create temporary table accepted_claim as select * from public.claim_due_appointment_automation_jobs('runner_accepted', 1, 30);
select public.begin_appointment_automation_delivery((select id from accepted_claim), 'runner_accepted', (select lease_token from accepted_claim));
select public.mark_appointment_automation_delivery_accepted((select id from accepted_claim), 'runner_accepted', (select lease_token from accepted_claim));
update public.appointment_automation_jobs set lease_expires_at=now()-interval '1 second' where id=(select id from accepted_claim);
create temporary table accepted_recovery_claims as select * from public.claim_due_appointment_automation_jobs('runner_no_resend', 1, 30);
select extensions.ok(exists(select 1 from public.appointment_automation_jobs where id=(select id from accepted_claim)
  and status='succeeded' and delivery_state='persisted'), 'accepted delivery is reconciled to persisted after lease expiry');
select extensions.is((select count(*)::integer from accepted_recovery_claims), 0,
  'accepted delivery recovery does not return the job for another provider call');
select extensions.is((select attempts from public.appointment_automation_jobs where id=(select id from accepted_claim)), 1,
  'accepted delivery recovery does not create another delivery attempt');

select extensions.ok(not exists(select 1 from information_schema.role_table_grants
  where table_schema='public' and table_name in ('appointment_automation_jobs','appointment_automation_scheduler_state')
    and grantee in ('anon','authenticated','PUBLIC')), 'internal automation tables remain inaccessible to clients');
select extensions.ok((select proconfig @> array['search_path=public, pg_temp'] from pg_proc
  where oid='public.renew_appointment_automation_job_lease(uuid,text,uuid,integer)'::regprocedure),
  'lease renewal RPC has a fixed search_path');

select * from extensions.finish();
rollback;
