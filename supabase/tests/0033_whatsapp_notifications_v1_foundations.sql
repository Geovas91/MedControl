-- Run after `npx supabase db reset --local`.
create extension if not exists pgtap with schema extensions;

begin;
select extensions.plan(35);

select extensions.has_table('public', 'whatsapp_provider_accounts', 'provider accounts table exists');
select extensions.has_table('public', 'whatsapp_integrations', 'integrations table exists');
select extensions.has_table('public', 'whatsapp_templates', 'templates table exists');
select extensions.has_table('public', 'patient_communication_preferences', 'communication preferences table exists');
select extensions.has_table('public', 'whatsapp_message_deliveries', 'deliveries table exists');

insert into public.clinics(id, name, timezone) values
  ('a2000000-0000-4000-8000-000000000001', 'WhatsApp Clinic A', 'America/Mexico_City'),
  ('a2000000-0000-4000-8000-000000000002', 'WhatsApp Clinic B', 'America/Mexico_City');
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'WhatsApp Patient A', 'Patient', 'PAC-WAPATIENTA'),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'WhatsApp Patient B', 'Patient', 'PAC-WAPATIENTB');
insert into public.appointments(id, clinic_id, patient_id, title, starts_at, ends_at) values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'WhatsApp fixture A', now()+interval '5 days', now()+interval '5 days 1 hour'),
  ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'WhatsApp fixture B', now()+interval '5 days', now()+interval '5 days 1 hour');

insert into public.whatsapp_provider_accounts(
  id, provider, scope, owner_clinic_id, waba_id, phone_number_id, display_phone_last4, status
) values
  ('a5000000-0000-4000-8000-000000000001', 'meta_cloud', 'platform_shared', null, '100000000000001', '200000000000001', '0001', 'disconnected'),
  ('a5000000-0000-4000-8000-000000000002', 'meta_cloud', 'clinic_owned', 'a2000000-0000-4000-8000-000000000002', '100000000000002', '200000000000002', '0002', 'disconnected');

insert into public.whatsapp_integrations(id, clinic_id, provider_account_id)
values ('a6000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001');
select extensions.is(
  (select count(*)::integer from public.whatsapp_integrations where clinic_id='a2000000-0000-4000-8000-000000000001'),
  1, 'shared provider account can be linked explicitly to a clinic'
);
select extensions.throws_ok(
  $$insert into public.whatsapp_integrations(clinic_id,provider_account_id) values ('a2000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002')$$,
  '23503', 'WhatsApp integration tenant mismatch.', 'clinic-owned provider account cannot cross tenants'
);

insert into public.whatsapp_templates(
  id, provider_account_id, logical_key, provider_template_name, language_code,
  version, status, allowed_variables, approved_at
) values (
  'a7000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001',
  'appointment_reminder', 'appointment_reminder_es_mx_v1', 'es_MX', 1, 'approved',
  array['appointment_date','appointment_time'], now()
);
select extensions.is(
  (select allowed_variables from public.whatsapp_templates where id='a7000000-0000-4000-8000-000000000001'),
  array['appointment_date','appointment_time']::text[], 'template variables are fixed to the v1 allowlist'
);

insert into public.appointment_automation_jobs(
  id, clinic_id, appointment_id, type, channel, source_version, scheduled_for, next_attempt_at, dedupe_key
) values
  ('a8000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'reminder_email', 'email', now(), now(), now(), 'shared-dedupe'),
  ('a8000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'reminder_whatsapp', 'whatsapp', now(), now(), now(), 'shared-dedupe');
select extensions.is(
  (select count(*)::integer from public.appointment_automation_jobs where clinic_id='a2000000-0000-4000-8000-000000000001' and dedupe_key='shared-dedupe'),
  2, 'email and WhatsApp may use the same tenant dedupe key independently'
);
select extensions.ok(
  exists(select 1 from public.appointment_automation_jobs where id='a8000000-0000-4000-8000-000000000001' and type='reminder_email' and channel='email'),
  'existing email job shape remains valid'
);
select extensions.ok(
  exists(select 1 from public.appointment_automation_jobs where id='a8000000-0000-4000-8000-000000000002' and type='reminder_whatsapp' and channel='whatsapp'),
  'WhatsApp reminder job shape is valid'
);
select extensions.throws_ok(
  $$insert into public.appointment_automation_jobs(clinic_id,appointment_id,type,channel,source_version,scheduled_for,next_attempt_at,dedupe_key) values ('a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','reminder_whatsapp','whatsapp',now(),now(),now(),'shared-dedupe')$$,
  '23505', 'duplicate key value violates unique constraint "appointment_automation_jobs_dedupe_unique"',
  'same-channel duplicate is rejected'
);
select extensions.throws_ok(
  $$insert into public.appointment_automation_jobs(clinic_id,appointment_id,type,channel,source_version,scheduled_for,next_attempt_at,dedupe_key) values ('a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','reminder_whatsapp','email',now(),now(),now(),'invalid-pair')$$,
  '23514', 'new row for relation "appointment_automation_jobs" violates check constraint "appointment_automation_jobs_type_channel_check"',
  'WhatsApp job cannot use the email channel'
);

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider, current_period_end)
values ('a2000000-0000-4000-8000-000000000001', 'basic', 'active', 'manual', now() + interval '30 days');
insert into public.bot_settings(
  clinic_id, enabled, channel, reminder_enabled, reminder_hours_before,
  quiet_hours_start, quiet_hours_end, review_request_enabled
) values (
  'a2000000-0000-4000-8000-000000000001', true, 'email', true, 24, null, null, true
);
select extensions.lives_ok(
  $$insert into public.appointments(id,clinic_id,patient_id,title,starts_at,ends_at) values ('a4000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','Automatic email fixture',now()+interval '6 days',now()+interval '6 days 1 hour')$$,
  'appointment insert remains compatible with channel-scoped dedupe'
);
select extensions.is(
  (select count(*)::integer from public.appointment_automation_jobs where appointment_id='a4000000-0000-4000-8000-000000000003' and type='reminder_email' and channel='email'),
  1, 'email reminder still enqueues automatically'
);
select extensions.lives_ok(
  $$update public.appointments set starts_at=starts_at+interval '2 hours',ends_at=ends_at+interval '2 hours' where id='a4000000-0000-4000-8000-000000000003'$$,
  'appointment reschedule remains compatible with channel-scoped dedupe'
);
select extensions.ok(
  (select count(*)=1 from public.appointment_automation_jobs where appointment_id='a4000000-0000-4000-8000-000000000003' and type='reminder_email' and status='cancelled')
  and (select count(*)=1 from public.appointment_automation_jobs where appointment_id='a4000000-0000-4000-8000-000000000003' and type='reminder_email' and status='pending'),
  'reschedule preserves cancelled and pending email generations'
);
insert into public.appointments(id,clinic_id,patient_id,title,starts_at,ends_at)
values (
  'a4000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', 'Automatic review fixture',
  now()-interval '2 days', now()-interval '2 days'+interval '1 hour'
);
select extensions.lives_ok(
  $$update public.appointments set status='completed' where id='a4000000-0000-4000-8000-000000000004'$$,
  'appointment completion remains compatible with channel-scoped dedupe'
);
select extensions.is(
  (select count(*)::integer from public.appointment_automation_jobs where appointment_id='a4000000-0000-4000-8000-000000000004' and type='review_request_email' and channel='email'),
  1, 'review request email still enqueues automatically'
);
select extensions.is(
  (select count(*)::integer from public.appointment_automation_jobs where appointment_id in ('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000004') and type='reminder_whatsapp'),
  0, 'appointment automation does not enqueue WhatsApp jobs automatically'
);

insert into public.patient_communication_preferences(clinic_id, patient_id)
values ('a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001');
select extensions.is(
  (select whatsapp_status from public.patient_communication_preferences where patient_id='a3000000-0000-4000-8000-000000000001'),
  'not_set', 'consent defaults to not_set'
);
update public.patient_communication_preferences set
  whatsapp_status='opted_in', phone_e164='+525512345678', opt_in_at=now(),
  source='patient_portal', terms_version='v1'
where clinic_id='a2000000-0000-4000-8000-000000000001' and patient_id='a3000000-0000-4000-8000-000000000001';
select extensions.is(
  (select whatsapp_status from public.patient_communication_preferences where patient_id='a3000000-0000-4000-8000-000000000001'),
  'opted_in', 'complete explicit consent can opt in'
);
update public.patient_communication_preferences set phone_e164='+14155552671'
where clinic_id='a2000000-0000-4000-8000-000000000001' and patient_id='a3000000-0000-4000-8000-000000000001';
select extensions.ok(
  exists(select 1 from public.patient_communication_preferences
    where patient_id='a3000000-0000-4000-8000-000000000001'
      and whatsapp_status='not_set' and opt_in_at is null and source is null and terms_version is null),
  'changing the consented phone invalidates prior consent'
);
select extensions.throws_ok(
  $$insert into public.patient_communication_preferences(clinic_id,patient_id) values ('a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002')$$,
  '23503', 'insert or update on table "patient_communication_preferences" violates foreign key constraint "patient_communication_preferences_patient_fk"',
  'communication preferences cannot cross tenants'
);

insert into public.whatsapp_message_deliveries(
  id, clinic_id, appointment_id, job_id, integration_id, template_id, provider_account_id, destination_hmac
) values (
  'a9000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002',
  'a6000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001', repeat('a',64)
);
select extensions.is(
  (select status from public.whatsapp_message_deliveries where id='a9000000-0000-4000-8000-000000000001'),
  'sending', 'technical delivery begins in sending state'
);
select extensions.throws_ok(
  $$insert into public.whatsapp_message_deliveries(clinic_id,appointment_id,job_id,integration_id,template_id,provider_account_id,destination_hmac) values ('a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',repeat('b',64))$$,
  '23514', 'WhatsApp delivery requires a WhatsApp reminder job.', 'email job cannot create a WhatsApp delivery'
);
update public.whatsapp_message_deliveries set
  status='accepted', provider_message_id='wamid.test-foundation', accepted_at=now()
where id='a9000000-0000-4000-8000-000000000001';
update public.whatsapp_message_deliveries set status='delivered', delivered_at=now()
where id='a9000000-0000-4000-8000-000000000001';
select extensions.is(
  (select status from public.whatsapp_message_deliveries where id='a9000000-0000-4000-8000-000000000001'),
  'delivered', 'delivery status advances monotonically'
);
select extensions.throws_ok(
  $$update public.whatsapp_message_deliveries set status='sent',sent_at=now() where id='a9000000-0000-4000-8000-000000000001'$$,
  '42501', 'WhatsApp delivery status cannot regress.', 'delivery status cannot regress'
);

select extensions.ok(
  not has_table_privilege('authenticated','public.whatsapp_provider_accounts','select')
  and not has_table_privilege('authenticated','public.whatsapp_integrations','select')
  and not has_table_privilege('authenticated','public.whatsapp_templates','select')
  and not has_table_privilege('authenticated','public.patient_communication_preferences','select')
  and not has_table_privilege('authenticated','public.whatsapp_message_deliveries','select'),
  'authenticated clients have no direct reads on WhatsApp foundations'
);
select extensions.ok(
  not has_table_privilege('authenticated','public.whatsapp_provider_accounts','insert')
  and not has_table_privilege('authenticated','public.whatsapp_integrations','insert')
  and not has_table_privilege('authenticated','public.whatsapp_templates','insert')
  and not has_table_privilege('authenticated','public.patient_communication_preferences','insert')
  and not has_table_privilege('authenticated','public.whatsapp_message_deliveries','insert'),
  'authenticated clients have no direct writes on WhatsApp foundations'
);
select extensions.ok(
  not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='whatsapp_message_deliveries'
      and column_name in ('phone','phone_e164','message','message_body','template_variables','patient_name','webhook_payload')),
  'deliveries expose no recipient, content, PHI or raw webhook columns'
);
select extensions.ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='whatsapp_message_deliveries_provider_message_unique_idx'),
  'provider message mapping has a partial unique index'
);
select extensions.ok(
  exists(select 1 from pg_constraint where conname='appointment_automation_jobs_dedupe_unique'),
  'job dedupe constraint remains present after channel scoping'
);
select extensions.ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='whatsapp_provider_accounts') = false,
  'provider accounts fail closed with no client RLS policy'
);
select extensions.ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='patient_communication_preferences') = false,
  'consent preferences fail closed with no client RLS policy'
);

select * from extensions.finish();
rollback;
