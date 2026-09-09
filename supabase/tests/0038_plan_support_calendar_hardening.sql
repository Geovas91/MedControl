-- Run after `npx supabase db reset --local`.
create extension if not exists pgtap with schema extensions;

begin;
select extensions.plan(24);

insert into auth.users(id,email,email_confirmed_at) values
 ('38000000-0000-4000-8000-000000000001','owner@example.test',now()),
 ('38000000-0000-4000-8000-000000000002','platform@example.test',now()),
 ('38000000-0000-4000-8000-000000000003','doctor@example.test',now());
insert into public.clinics(id,name) values
 ('38100000-0000-4000-8000-000000000001','Hardening Clinic A'),
 ('38100000-0000-4000-8000-000000000002','Hardening Clinic B');
insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('38100000-0000-4000-8000-000000000001','38000000-0000-4000-8000-000000000001','owner','active'),
 ('38100000-0000-4000-8000-000000000001','38000000-0000-4000-8000-000000000003','doctor','active');
insert into public.platform_admins(user_id,email,role)
 values('38000000-0000-4000-8000-000000000002','platform@example.test','support');

select extensions.ok(pg_get_functiondef('public.accept_clinic_member_invitation_for_current_user(text)'::regprocedure)
 like '%pg_advisory_xact_lock%clinic_doctor_limit:%','doctor acceptance uses a clinic-wide transaction lock');
select extensions.ok(pg_get_functiondef('public.accept_clinic_member_invitation_for_current_user(text)'::regprocedure)
 like '%cm.status=''active'' and cm.role in (''owner'',''doctor'')%','owner and active doctors preserve the existing seat count');
select extensions.ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='clinic_members' and cmd in ('INSERT','UPDATE','ALL')),
 'direct authenticated member activation remains unavailable through RLS');
select extensions.ok((select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc
 where oid='public.accept_clinic_member_invitation_for_current_user(text)'::regprocedure),'doctor acceptance keeps fixed SECURITY DEFINER context');

select extensions.ok(not has_function_privilege('authenticated','public.transition_admin_support_ticket(uuid,text,text,uuid)','execute')
 and not has_function_privilege('anon','public.transition_admin_support_ticket(uuid,text,text,uuid)','execute'),'admin transition RPC has no client execution grant');
select extensions.ok(has_function_privilege('service_role','public.transition_admin_support_ticket(uuid,text,text,uuid)','execute'),
 'service role may execute atomic admin transition');
select extensions.ok(not has_function_privilege('authenticated','public.add_admin_support_message(uuid,text,text,uuid)','execute')
 and has_function_privilege('service_role','public.add_admin_support_message(uuid,text,text,uuid)','execute'),'admin message RPC is server-only');
select extensions.ok((select bool_and(prosecdef and proconfig @> array['search_path=public, pg_temp']) from pg_proc where oid in
 ('public.transition_admin_support_ticket(uuid,text,text,uuid)'::regprocedure,
  'public.add_admin_support_message(uuid,text,text,uuid)'::regprocedure,
  'public.record_google_calendar_event_result(uuid,uuid,uuid,timestamptz,text,text,text)'::regprocedure)),
 'new RPCs use SECURITY DEFINER and fixed search paths');

insert into public.support_tickets(id,reference_code,clinic_id,created_by,category,severity,status,subject,summary)
 values('38200000-0000-4000-8000-000000000001','AAAABBBBCCCC0038','38100000-0000-4000-8000-000000000001',
 '38000000-0000-4000-8000-000000000003','appointments','normal','open','Safe subject','Safe operational summary');
create temp table transition_result as select * from public.transition_admin_support_ticket(
 '38200000-0000-4000-8000-000000000001','open','triaged','38000000-0000-4000-8000-000000000002');
select extensions.is((select count(*)::integer from transition_result),1,'valid compare-and-set transition returns one row');
select extensions.is((select status from public.support_tickets where id='38200000-0000-4000-8000-000000000001'),'triaged','valid transition updates ticket');
select extensions.is((select count(*)::integer from public.support_ticket_events where ticket_id='38200000-0000-4000-8000-000000000001' and event_type='support_ticket_status_changed'),1,'valid transition creates exactly one event');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id='38200000-0000-4000-8000-000000000001' and action='support_ticket_triaged'),1,'valid transition creates exactly one audit row');
select extensions.is((select count(*)::integer from public.transition_admin_support_ticket(
 '38200000-0000-4000-8000-000000000001','open','triaged','38000000-0000-4000-8000-000000000002')),0,'stale expected status is a no-op');
select extensions.is((select count(*)::integer from public.support_ticket_events where ticket_id='38200000-0000-4000-8000-000000000001' and event_type='support_ticket_status_changed'),1,'stale transition creates no orphan event');

create temp table internal_result as select * from public.add_admin_support_message(
 '38200000-0000-4000-8000-000000000001','Safe internal note','internal','38000000-0000-4000-8000-000000000002');
create temp table public_result as select * from public.add_admin_support_message(
 '38200000-0000-4000-8000-000000000001','Safe public reply','requester','38000000-0000-4000-8000-000000000002');
select extensions.is((select visibility from public.support_ticket_messages where id=(select message_id from internal_result)),'internal','internal note stays internal');
select extensions.is((select visibility from public.support_ticket_messages where id=(select message_id from public_result)),'requester','public reply stays requester-visible');
select extensions.is((select count(*)::integer from public.support_ticket_events where id in ((select event_id from internal_result),(select event_id from public_result))),2,'each message has one stable event id');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id='38200000-0000-4000-8000-000000000001' and action in ('support_ticket_internal_note_added','support_ticket_admin_reply_added')),2,'message and audit writes stay consistent');

insert into public.patients(id,clinic_id,full_name,first_names,internal_identifier)
 values('38300000-0000-4000-8000-000000000001','38100000-0000-4000-8000-000000000001','Calendar Patient','Calendar Patient','PAC-HARD0038');
insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at)
 values('38400000-0000-4000-8000-000000000001','38100000-0000-4000-8000-000000000001','38300000-0000-4000-8000-000000000001',
 '38000000-0000-4000-8000-000000000003','Safe calendar appointment',now()+interval '1 day',now()+interval '1 day 1 hour');
insert into public.calendar_integrations(id,clinic_id,user_id,provider,provider_calendar_id,calendar_name,sync_direction,
 refresh_token_encrypted,scopes,status,connected_at,token_encryption_version)
 values('38500000-0000-4000-8000-000000000001','38100000-0000-4000-8000-000000000001','38000000-0000-4000-8000-000000000003',
 'google','primary','Primary','clinicontrol_to_provider','v1.test.ciphertext.tag',array['https://www.googleapis.com/auth/calendar.events.owned'],'connected',now(),1);
insert into public.google_calendar_events(id,clinic_id,appointment_id,integration_id,doctor_user_id,google_event_id,appointment_version,sync_status)
 values('38600000-0000-4000-8000-000000000001','38100000-0000-4000-8000-000000000001','38400000-0000-4000-8000-000000000001',
 '38500000-0000-4000-8000-000000000001','38000000-0000-4000-8000-000000000003','safe-event-id',now(),'pending');

select extensions.ok(not has_function_privilege('authenticated','public.record_google_calendar_event_result(uuid,uuid,uuid,timestamptz,text,text,text)','execute')
 and has_function_privilege('service_role','public.record_google_calendar_event_result(uuid,uuid,uuid,timestamptz,text,text,text)','execute'),
 'Calendar result persistence is server-only');
select extensions.ok(public.record_google_calendar_event_result(
 '38600000-0000-4000-8000-000000000001','38500000-0000-4000-8000-000000000001','38100000-0000-4000-8000-000000000001',now(),
 'synced','provider-event-id',null),'matching Calendar mapping and integration persist atomically');
select extensions.is((select sync_status from public.google_calendar_events where id='38600000-0000-4000-8000-000000000001'),'synced','mapping records synced only after persistence');
select extensions.ok((select last_sync_at is not null and last_error_code is null from public.calendar_integrations where id='38500000-0000-4000-8000-000000000001'),
 'integration result is persisted with mapping');
select extensions.is(public.record_google_calendar_event_result(
 '38600000-0000-4000-8000-000000000001','38500000-0000-4000-8000-000000000001','38100000-0000-4000-8000-000000000002',now(),
 'deleted','provider-event-id',null),false,'wrong tenant mapping cannot be persisted');
select extensions.is((select sync_status from public.google_calendar_events where id='38600000-0000-4000-8000-000000000001'),'synced','wrong tenant attempt leaves mapping unchanged');

select * from extensions.finish();
rollback;
