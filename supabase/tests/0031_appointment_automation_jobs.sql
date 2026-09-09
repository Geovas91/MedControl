-- Run after `npx supabase db reset --local`.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

-- Committed fixtures are required so independent dblink sessions can observe the same due job.
begin;
insert into auth.users(id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'automation-owner-a@example.test'),
  ('f1000000-0000-4000-8000-000000000002', 'automation-doctor-a@example.test'),
  ('f1000000-0000-4000-8000-000000000003', 'automation-owner-b@example.test');
insert into public.profiles(id, full_name, email, role) values
  ('f1000000-0000-4000-8000-000000000001', 'Owner Automatización A', 'automation-owner-a@example.test', 'admin'),
  ('f1000000-0000-4000-8000-000000000002', 'Doctor Automatización A', 'automation-doctor-a@example.test', 'doctor'),
  ('f1000000-0000-4000-8000-000000000003', 'Owner Automatización B', 'automation-owner-b@example.test', 'admin');
insert into public.clinics(id, name, timezone) values
  ('f2000000-0000-4000-8000-000000000001', 'Clínica Automatización A', 'America/Mexico_City'),
  ('f2000000-0000-4000-8000-000000000002', 'Clínica Automatización B', 'America/Mexico_City');
insert into public.clinic_members(id, clinic_id, user_id, role, status) values
  ('f2100000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('f2100000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'doctor', 'active'),
  ('f2100000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'owner', 'active');
insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider, current_period_end) values
  ('f2000000-0000-4000-8000-000000000001', 'basic', 'active', 'manual', now() + interval '30 days'),
  ('f2000000-0000-4000-8000-000000000002', 'basic', 'active', 'manual', now() + interval '30 days');
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, email) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Paciente Automatización A', 'Paciente', 'PAC-AUTOMATIONA', 'patient-a@example.test'),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'Paciente Automatización B', 'Paciente', 'PAC-AUTOMATIONB', 'patient-b@example.test');
insert into public.doctor_public_profiles(id, clinic_id, clinic_member_id, profile_id, slug, display_name, specialty, is_published)
values ('f3500000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f2100000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'doctor-automation-a', 'Doctor Automatización A', 'Medicina General', true);
insert into public.bot_settings(clinic_id, enabled, channel, reminder_enabled, reminder_hours_before, quiet_hours_start, quiet_hours_end, review_request_enabled)
values
  ('f2000000-0000-4000-8000-000000000001', true, 'email', true, 24, null, null, true),
  ('f2000000-0000-4000-8000-000000000002', false, 'email', true, 24, null, null, true);
insert into public.appointments(id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at) values
  ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'Fixture A', now() + interval '4 days', now() + interval '4 days 1 hour'),
  ('f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000002', null, 'Fixture B', now() + interval '4 days', now() + interval '4 days 1 hour'),
  ('f4000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'Fixture completed', now() - interval '2 days', now() - interval '2 days' + interval '1 hour');
-- Dedicated due row for the two independent runner connections.
insert into public.appointment_automation_jobs(
  id, clinic_id, appointment_id, type, source_version, scheduled_for, next_attempt_at, dedupe_key
) values (
  'f5000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002',
  'f4000000-0000-4000-8000-000000000002', 'reminder_email', now(), now() - interval '1 minute',
  now() - interval '1 minute', 'concurrency-fixture'
);
commit;

begin;
select extensions.plan(42);

select extensions.is(
  (select count(*)::integer from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email'),
  1, 'enabled appointment create enqueues exactly one reminder'
);
select extensions.is(
  (select count(*)::integer from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000002' and dedupe_key <> 'concurrency-fixture'),
  0, 'assistant disabled creates no jobs'
);

select extensions.ok(
  public.calculate_appointment_reminder_at(
    timestamptz '2026-09-02 16:00:00+00', 'America/Mexico_City', 4, time '20:00', time '08:00'
  ) = timestamptz '2026-09-02 14:00:00+00',
  'quiet hours move a reminder to clinic-local quiet end'
);
select extensions.is(
  public.calculate_appointment_reminder_at(
    timestamptz '2026-03-08 15:00:00+00', 'America/New_York', 4, time '22:00', time '08:00'
  ), timestamptz '2026-03-08 12:00:00+00', 'quiet-hour calculation follows the timezone DST transition'
);
select extensions.ok(
  public.calculate_appointment_reminder_at(
    timestamptz '2026-09-03 05:00:00+00', 'America/Mexico_City', 0, time '20:00', time '08:00'
  ) > timestamptz '2026-09-03 05:30:00+00',
  'a near appointment during quiet hours is recognized as too late to schedule safely'
);

update public.appointments set starts_at=starts_at + interval '2 hours', ends_at=ends_at + interval '2 hours'
where id='f4000000-0000-4000-8000-000000000001';
select extensions.ok(
  (select count(*)=1 from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='cancelled'),
  'reschedule cancels the prior reminder generation'
);
select extensions.ok(
  (select count(*)=1 from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending' and dedupe_key <> 'concurrency-fixture'),
  'reschedule creates one new generation'
);

update public.appointments set status='cancelled' where id='f4000000-0000-4000-8000-000000000001';
select extensions.ok(
  not exists(select 1 from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status in ('pending','retry_pending','processing')),
  'cancel prevents pending reminder delivery'
);

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
update public.appointments set status='scheduled' where id='f4000000-0000-4000-8000-000000000001';
select extensions.ok(
  exists(select 1 from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending'),
  'restore creates a fresh reminder generation'
);

create temporary table race_jobs(name text primary key, id uuid not null);
insert into race_jobs values ('cancel', (
  select id from public.appointment_automation_jobs
  where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending'
  order by generation desc limit 1
));
update public.appointment_automation_jobs set status='processing', attempts=1, locked_at=now(),
  lease_expires_at=now()+interval '1 minute', locked_by='race_cancel_test', lease_token='f6100000-0000-4000-8000-000000000001'
where id=(select id from race_jobs where name='cancel');
update public.appointments set status='cancelled' where id='f4000000-0000-4000-8000-000000000001';
select extensions.is((select status from public.appointment_automation_jobs where id=(select id from race_jobs where name='cancel')), 'cancelled', 'cancel after claim cancels the owned reminder');
select extensions.is((select count(*)::integer from public.get_appointment_automation_context((select id from race_jobs where name='cancel'),'race_cancel_test','f6100000-0000-4000-8000-000000000001')), 0, 'cancelled reminder fails the final provider preflight');

update public.appointments set status='scheduled' where id='f4000000-0000-4000-8000-000000000001';
insert into race_jobs values ('reschedule', (
  select id from public.appointment_automation_jobs
  where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending'
  order by generation desc limit 1
));
update public.appointment_automation_jobs set status='processing', attempts=1, locked_at=now(),
  lease_expires_at=now()+interval '1 minute', locked_by='race_reschedule_test', lease_token='f6100000-0000-4000-8000-000000000002'
where id=(select id from race_jobs where name='reschedule');
update public.appointments set starts_at=starts_at+interval '1 hour', ends_at=ends_at+interval '1 hour'
where id='f4000000-0000-4000-8000-000000000001';
select extensions.is((select status from public.appointment_automation_jobs where id=(select id from race_jobs where name='reschedule')), 'cancelled', 'reschedule after claim cancels generation N');
select extensions.is((select count(*)::integer from public.get_appointment_automation_context((select id from race_jobs where name='reschedule'),'race_reschedule_test','f6100000-0000-4000-8000-000000000002')), 0, 'obsolete generation N fails the final provider preflight');
select extensions.is((select count(*)::integer from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending'), 1, 'reschedule race leaves exactly one pending generation N+1');

insert into race_jobs values ('settings', (
  select id from public.appointment_automation_jobs
  where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending'
  order by generation desc limit 1
));
update public.appointment_automation_jobs set status='processing', attempts=1, locked_at=now(),
  lease_expires_at=now()+interval '1 minute', locked_by='race_settings_test', lease_token='f6100000-0000-4000-8000-000000000003'
where id=(select id from race_jobs where name='settings');
update public.bot_settings set enabled=false where clinic_id='f2000000-0000-4000-8000-000000000001';
select extensions.is((select status from public.appointment_automation_jobs where id=(select id from race_jobs where name='settings')), 'cancelled', 'disabling settings after claim cancels the reminder');
select extensions.is((select count(*)::integer from public.get_appointment_automation_context((select id from race_jobs where name='settings'),'race_settings_test','f6100000-0000-4000-8000-000000000003')), 0, 'disabled settings fail the final provider preflight');
update public.bot_settings set enabled=true where clinic_id='f2000000-0000-4000-8000-000000000001';

insert into race_jobs values ('subscription', (
  select id from public.appointment_automation_jobs
  where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending'
  order by generation desc limit 1
));
update public.appointment_automation_jobs set status='processing', attempts=1, locked_at=now(),
  lease_expires_at=now()+interval '1 minute', locked_by='race_subscription_test', lease_token='f6100000-0000-4000-8000-000000000004'
where id=(select id from race_jobs where name='subscription');
update public.clinic_subscriptions set status='inactive' where clinic_id='f2000000-0000-4000-8000-000000000001';
select extensions.ok(exists(select 1 from public.get_appointment_automation_context((select id from race_jobs where name='subscription'),'race_subscription_test','f6100000-0000-4000-8000-000000000004') where not valid_subscription), 'subscription downgrade after claim is visible before provider call');
update public.clinic_subscriptions set status='active' where clinic_id='f2000000-0000-4000-8000-000000000001';
update public.bot_settings set reminder_hours_before=25 where clinic_id='f2000000-0000-4000-8000-000000000001';
select extensions.is((select count(*)::integer from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending'), 1, 'configuration change rebuilds exactly one pending reminder generation');

insert into race_jobs values ('lease', (
  select id from public.appointment_automation_jobs
  where appointment_id='f4000000-0000-4000-8000-000000000001' and type='reminder_email' and status='pending'
  order by generation desc limit 1
));
update public.appointment_automation_jobs set status='processing', attempts=1, locked_at=now()-interval '11 minutes',
  lease_expires_at=now()-interval '10 minutes', locked_by='expired_worker_test', lease_token='f6100000-0000-4000-8000-000000000005'
where id=(select id from race_jobs where name='lease');
select extensions.is(public.finish_appointment_automation_job((select id from race_jobs where name='lease'),'expired_worker_test','f6100000-0000-4000-8000-000000000005','skipped',null,null), false, 'worker cannot finalize after its lease expires');
select extensions.ok(exists(select 1 from public.claim_due_appointment_automation_jobs('replacement_worker_test',1,60) where id=(select id from race_jobs where name='lease')), 'expired lease is claimed by a replacement worker');
select extensions.is(public.finish_appointment_automation_job((select id from race_jobs where name='lease'),'expired_worker_test','f6100000-0000-4000-8000-000000000005','skipped',null,null), false, 'old worker cannot finalize after replacement claim');
select public.finish_appointment_automation_job((select id from race_jobs where name='lease'),'replacement_worker_test',
  (select lease_token from public.appointment_automation_jobs where id=(select id from race_jobs where name='lease')),'skipped',null,null);

update public.clinics set timezone='Invalid/Test_Zone' where id='f2000000-0000-4000-8000-000000000001';
insert into public.appointments(id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at)
values ('f4000000-0000-4000-8000-000000000005','f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002',
  'Invalid timezone fixture',now()+interval '6 days',now()+interval '6 days 1 hour');
select extensions.ok(exists(select 1 from public.appointments where id='f4000000-0000-4000-8000-000000000005')
  and not exists(select 1 from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000005'),
  'invalid clinic timezone fails closed for automation without blocking the appointment');
update public.clinics set timezone='America/Mexico_City' where id='f2000000-0000-4000-8000-000000000001';
select extensions.ok(exists(select 1 from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000005' and status='pending'),
  'restoring a valid timezone rebuilds the pending reminder');

update public.appointments set status='completed' where id='f4000000-0000-4000-8000-000000000003';
select extensions.is(
  (select count(*)::integer from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000003' and type='review_request_email'),
  1, 'complete creates exactly one review request job'
);
update public.appointments set title=title || ' adjusted' where id='f4000000-0000-4000-8000-000000000003';
select extensions.is(
  (select count(*)::integer from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000003' and type='review_request_email'),
  1, 'unrelated updates cannot duplicate the review job'
);

update public.appointment_automation_jobs set status='processing', attempts=1, locked_at=now(),
  lease_expires_at=now()+interval '1 minute', locked_by='review_idempotency_test', lease_token='f6100000-0000-4000-8000-000000000006'
where appointment_id='f4000000-0000-4000-8000-000000000003' and type='review_request_email';
select extensions.is(
  (select count(*)::integer from public.issue_review_invitation_for_automation(
    (select id from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000003' and type='review_request_email'),
    'review_idempotency_test', 'f6100000-0000-4000-8000-000000000006'
  )), 1, 'review job issues one valid invitation'
);
select extensions.is(
  (select count(*)::integer from public.issue_review_invitation_for_automation(
    (select id from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000003' and type='review_request_email'),
    'review_idempotency_test', 'f6100000-0000-4000-8000-000000000006'
  )), 0, 'review job cannot regenerate an existing invitation'
);
select extensions.is(
  (select count(*)::integer from public.review_invitations where appointment_id='f4000000-0000-4000-8000-000000000003'),
  1, 'review idempotency leaves exactly one invitation'
);
select public.begin_appointment_automation_delivery(
  (select id from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000003' and type='review_request_email'),
  'review_idempotency_test', 'f6100000-0000-4000-8000-000000000006'
);
select extensions.ok(public.record_review_email_result_for_automation(
  (select id from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000003' and type='review_request_email'),
  'review_idempotency_test',
  'f6100000-0000-4000-8000-000000000006',
  (select id from public.review_invitations where appointment_id='f4000000-0000-4000-8000-000000000003'),
  false, 'provider_error'
) , 'provider failure result is recorded');
select extensions.ok(exists(
  select 1 from public.review_invitations where appointment_id='f4000000-0000-4000-8000-000000000003' and delivery_status='failed'
), 'provider failure preserves the invitation for manual recovery');

update public.clinic_subscriptions set status='inactive' where clinic_id='f2000000-0000-4000-8000-000000000001';
insert into public.appointments(id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at)
values ('f4000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'Inactive subscription', now()+interval '5 days', now()+interval '5 days 1 hour');
select extensions.is((select count(*)::integer from public.appointment_automation_jobs where appointment_id='f4000000-0000-4000-8000-000000000004'), 0, 'inactive subscription enqueues nothing');
update public.clinic_subscriptions set status='active' where clinic_id='f2000000-0000-4000-8000-000000000001';

select extensions.dblink_connect('runner_one', 'host=host.docker.internal port=54322 dbname=' || current_database() || ' user=supabase_admin password=postgres');
select extensions.dblink_connect('runner_two', 'host=host.docker.internal port=54322 dbname=' || current_database() || ' user=supabase_admin password=postgres');
select extensions.dblink_send_query('runner_one', $$select count(*) from public.claim_due_appointment_automation_jobs('runner_one_test',1,60)$$);
select extensions.dblink_send_query('runner_two', $$select count(*) from public.claim_due_appointment_automation_jobs('runner_two_test',1,60)$$);
create temporary table runner_claims(claimed bigint);
insert into runner_claims select claimed from extensions.dblink_get_result('runner_one') as result(claimed bigint);
insert into runner_claims select claimed from extensions.dblink_get_result('runner_two') as result(claimed bigint);
select extensions.is((select sum(claimed)::integer from runner_claims), 1, 'two concurrent runners claim the same due job exactly once');
select extensions.is((select attempts from public.appointment_automation_jobs where id='f5000000-0000-4000-8000-000000000001'), 1, 'concurrent claim increments attempts exactly once');
select extensions.dblink_disconnect('runner_one');
select extensions.dblink_disconnect('runner_two');

update public.appointment_automation_jobs set lease_expires_at=now()-interval '1 second'
where id='f5000000-0000-4000-8000-000000000001';
select extensions.is(
  (select count(*)::integer from public.claim_due_appointment_automation_jobs('lease_recovery_test',1,60)),
  1, 'expired lease is recoverable'
);
select extensions.is((select attempts from public.appointment_automation_jobs where id='f5000000-0000-4000-8000-000000000001'), 2, 'lease recovery records a second attempt');

select extensions.ok(public.finish_appointment_automation_job(
  'f5000000-0000-4000-8000-000000000001', 'lease_recovery_test',
  (select lease_token from public.appointment_automation_jobs where id='f5000000-0000-4000-8000-000000000001'),
  'retry', 'timeout', now()+interval '5 minutes'
), 'compare-and-set accepts the owning worker retry');
select extensions.is((select status from public.appointment_automation_jobs where id='f5000000-0000-4000-8000-000000000001'), 'retry_pending', 'retry uses retry_pending with backoff');

update public.appointment_automation_jobs set status='processing', attempts=max_attempts,
  locked_at=now(), lease_expires_at=now()+interval '1 minute', locked_by='max_attempt_test', lease_token='f6100000-0000-4000-8000-000000000007'
where id='f5000000-0000-4000-8000-000000000001';
select extensions.ok(public.finish_appointment_automation_job(
  'f5000000-0000-4000-8000-000000000001', 'max_attempt_test', 'f6100000-0000-4000-8000-000000000007',
  'retry', 'timeout', now()+interval '5 minutes'
), 'max-attempt finalization succeeds');
select extensions.is((select status from public.appointment_automation_jobs where id='f5000000-0000-4000-8000-000000000001'), 'failed', 'max attempts becomes terminal failed');

insert into public.appointment_automation_jobs(id, clinic_id, appointment_id, type, source_version, scheduled_for,
  next_attempt_at, status, attempts, max_attempts, dedupe_key, locked_at, lease_expires_at, locked_by)
values ('f5000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000002',
  'f4000000-0000-4000-8000-000000000002','reminder_email',now(),now(),now(),'processing',1,1,
  'max-expired-fixture',now()-interval '2 minutes',now()-interval '1 minute','dead_worker_test');
select count(*) from public.claim_due_appointment_automation_jobs('terminalizer_test',1,60);
select extensions.ok(exists(select 1 from public.appointment_automation_jobs where id='f5000000-0000-4000-8000-000000000002' and status='failed' and last_error_code='lease_expired'), 'expired processing job at max attempts becomes terminal failed');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.get_appointment_automation_dashboard_for_current_user('f2000000-0000-4000-8000-000000000001', 25)),
  0, 'dashboard RPC preserves tenant isolation'
);
reset role;
select extensions.ok(
  not exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('appointment_automation_jobs','appointment_automation_scheduler_state') and grantee in ('anon','authenticated','PUBLIC')),
  'clients have no direct grants on jobs or heartbeat'
);

select * from extensions.finish();
rollback;

-- Remove committed deterministic fixtures after the concurrency proof.
delete from public.review_invitations where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.appointment_automation_jobs where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.audit_logs where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.appointments where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.bot_settings where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.doctor_public_profiles where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.clinical_change_events where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.clinical_records where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.patients where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.clinic_subscriptions where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.clinic_members where clinic_id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.clinics where id in ('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002');
delete from public.profiles where id in ('f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003');
delete from auth.users where id in ('f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003');
