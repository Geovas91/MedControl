-- Run after `npx supabase db reset --local`.
create extension if not exists pgtap with schema extensions;

begin;
select extensions.plan(35);

insert into auth.users(id,email,email_confirmed_at) values
  ('39000000-0000-4000-8000-000000000001','basic-owner@example.test',now()),
  ('39000000-0000-4000-8000-000000000002','plus-owner@example.test',now()),
  ('39000000-0000-4000-8000-000000000003','pro-owner@example.test',now()),
  ('39000000-0000-4000-8000-000000000004','basic-admin@example.test',now()),
  ('39000000-0000-4000-8000-000000000005','basic-assistant@example.test',now()),
  ('39000000-0000-4000-8000-000000000006','basic-invitee@example.test',now()),
  ('39000000-0000-4000-8000-000000000007','basic-suspended@example.test',now()),
  ('39000000-0000-4000-8000-000000000008','plus-invitee@example.test',now()),
  ('39000000-0000-4000-8000-000000000009','pro-invitee@example.test',now());

insert into public.profiles(id,email,full_name) select id,email,email from auth.users where id::text like '39000000-%';

insert into public.clinics(id,name) values
  ('39100000-0000-4000-8000-000000000001','Commercial Basic Clinic'),
  ('39100000-0000-4000-8000-000000000002','Commercial Plus Clinic'),
  ('39100000-0000-4000-8000-000000000003','Commercial Pro Clinic');

insert into public.clinic_subscriptions(clinic_id,plan_id,status) values
  ('39100000-0000-4000-8000-000000000001','basic','active'),
  ('39100000-0000-4000-8000-000000000002','plus','active'),
  ('39100000-0000-4000-8000-000000000003','pro','active');

insert into public.clinic_members(clinic_id,user_id,role,status) values
  ('39100000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000001','owner','active'),
  ('39100000-0000-4000-8000-000000000002','39000000-0000-4000-8000-000000000002','owner','active'),
  ('39100000-0000-4000-8000-000000000003','39000000-0000-4000-8000-000000000003','owner','active'),
  ('39100000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000004','admin','active'),
  ('39100000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000005','assistant','active'),
  ('39100000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000007','assistant','suspended');

select extensions.is(public.clinic_plan_includes_commercial_feature_internal('39100000-0000-4000-8000-000000000001','additional_staff'),false,'Basic excludes additional staff');
select extensions.is(public.clinic_plan_includes_commercial_feature_internal('39100000-0000-4000-8000-000000000002','additional_staff'),true,'Plus includes additional staff');
select extensions.is(public.clinic_plan_includes_commercial_feature_internal('39100000-0000-4000-8000-000000000003','appointment_assistant'),true,'Pro includes Appointment Assistant');
select extensions.ok(not has_function_privilege('authenticated','public.clinic_plan_includes_commercial_feature_internal(uuid,text)','execute'),'commercial helper is not client-callable');

set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000001',true);
select extensions.throws_ok(
  $$select * from public.create_clinic_member_invitation_for_current_user('39100000-0000-4000-8000-000000000001','new-admin@example.test','admin')$$,
  '42501','Additional staff is unavailable for the current plan.','Basic admin invitation is denied');
select extensions.throws_ok(
  $$select * from public.create_clinic_member_invitation_for_current_user('39100000-0000-4000-8000-000000000001','new-assistant@example.test','assistant')$$,
  '42501','Additional staff is unavailable for the current plan.','Basic assistant invitation is denied');
reset role;

select extensions.is((select status::text from public.clinic_members where clinic_id='39100000-0000-4000-8000-000000000001' and user_id='39000000-0000-4000-8000-000000000004'),'active','grandfathered Basic admin remains active');
select extensions.is((select status::text from public.clinic_members where clinic_id='39100000-0000-4000-8000-000000000001' and user_id='39000000-0000-4000-8000-000000000005'),'active','grandfathered Basic assistant remains active');

set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000002',true);
select extensions.lives_ok(
  $$select * from public.create_clinic_member_invitation_for_current_user('39100000-0000-4000-8000-000000000002','plus-invitee@example.test','admin')$$,
  'Plus admin invitation is allowed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000003',true);
select extensions.lives_ok(
  $$select * from public.create_clinic_member_invitation_for_current_user('39100000-0000-4000-8000-000000000003','pro-invitee@example.test','assistant')$$,
  'Pro assistant invitation is allowed');
reset role;

create temp table plus_accept_token on commit drop as
  select token_hash from public.clinic_member_invitations
  where clinic_id='39100000-0000-4000-8000-000000000002' and normalized_email='plus-invitee@example.test';
create temp table pro_accept_token on commit drop as
  select token_hash from public.clinic_member_invitations
  where clinic_id='39100000-0000-4000-8000-000000000003' and normalized_email='pro-invitee@example.test';
grant select on plus_accept_token, pro_accept_token to authenticated;

insert into public.clinic_member_invitations(clinic_id,invited_email,normalized_email,role,token_hash,expires_at,created_by) values
  ('39100000-0000-4000-8000-000000000001','basic-invitee@example.test','basic-invitee@example.test','admin',repeat('a',64),now()+interval '1 day','39000000-0000-4000-8000-000000000001'),
  ('39100000-0000-4000-8000-000000000001','basic-suspended@example.test','basic-suspended@example.test','assistant',repeat('b',64),now()+interval '1 day','39000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000006',true);
select extensions.throws_ok(
  $$select public.accept_clinic_member_invitation_for_current_user(repeat('a',64))$$,
  '42501','Invitation is unavailable.','Basic additional-staff acceptance is denied');
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000007',true);
select extensions.throws_ok(
  $$select public.accept_clinic_member_invitation_for_current_user(repeat('b',64))$$,
  '42501','Invitation is unavailable.','Basic suspended assistant cannot be reactivated');
reset role;
select extensions.is((select status::text from public.clinic_members where clinic_id='39100000-0000-4000-8000-000000000001' and user_id='39000000-0000-4000-8000-000000000007'),'suspended','denied reactivation preserves suspended status');

set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000008',true);
select extensions.lives_ok(
  $$select public.accept_clinic_member_invitation_for_current_user((select token_hash from plus_accept_token))$$,
  'Plus admin acceptance is allowed');
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000009',true);
select extensions.lives_ok(
  $$select public.accept_clinic_member_invitation_for_current_user((select token_hash from pro_accept_token))$$,
  'Pro assistant acceptance is allowed');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000001',true);
select extensions.throws_ok(
  $$select * from public.save_appointment_assistant_settings_for_current_user('39100000-0000-4000-8000-000000000001',true,true,24,null,null,true)$$,
  '42501','Assistant settings are unavailable.','Basic Assistant configuration is denied');
select extensions.throws_ok(
  $$select * from public.save_appointment_assistant_settings_for_current_user('39100000-0000-4000-8000-000000000002',true,true,24,null,null,true)$$,
  '42501','Assistant settings are unavailable.','cross-tenant Assistant configuration is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000002',true);
select extensions.lives_ok(
  $$select * from public.save_appointment_assistant_settings_for_current_user('39100000-0000-4000-8000-000000000002',true,true,24,null,null,true)$$,
  'Plus Assistant configuration is allowed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000003',true);
select extensions.lives_ok(
  $$select * from public.save_appointment_assistant_settings_for_current_user('39100000-0000-4000-8000-000000000003',true,true,24,null,null,true)$$,
  'Pro Assistant configuration is allowed');
reset role;

-- A pre-downgrade Basic configuration is retained as history but cannot create new jobs.
insert into public.bot_settings(clinic_id,enabled,channel,reminder_enabled,reminder_hours_before,review_request_enabled,max_reminders_per_patient,escalation_behavior)
values ('39100000-0000-4000-8000-000000000001',true,'email',true,24,true,1,'none');

insert into public.patients(id,clinic_id,primary_doctor_id,full_name,email) values
  ('39200000-0000-4000-8000-000000000001','39100000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000001','Basic Patient','basic-patient@example.test'),
  ('39200000-0000-4000-8000-000000000002','39100000-0000-4000-8000-000000000002','39000000-0000-4000-8000-000000000002','Plus Patient','plus-patient@example.test'),
  ('39200000-0000-4000-8000-000000000003','39100000-0000-4000-8000-000000000003','39000000-0000-4000-8000-000000000003','Pro Patient','pro-patient@example.test');
insert into public.clinical_records(id,clinic_id,patient_id,created_by) values
  ('39300000-0000-4000-8000-000000000001','39100000-0000-4000-8000-000000000001','39200000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000001');

insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at) values
  ('39400000-0000-4000-8000-000000000001','39100000-0000-4000-8000-000000000001','39200000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000001','Basic appointment',now()+interval '3 days',now()+interval '3 days 1 hour'),
  ('39400000-0000-4000-8000-000000000002','39100000-0000-4000-8000-000000000002','39200000-0000-4000-8000-000000000002','39000000-0000-4000-8000-000000000002','Plus appointment',now()+interval '3 days',now()+interval '3 days 1 hour'),
  ('39400000-0000-4000-8000-000000000003','39100000-0000-4000-8000-000000000003','39200000-0000-4000-8000-000000000003','39000000-0000-4000-8000-000000000003','Pro appointment',now()+interval '3 days',now()+interval '3 days 1 hour');

select extensions.is((select count(*)::integer from public.appointment_automation_jobs where appointment_id='39400000-0000-4000-8000-000000000001'),0,'Basic appointment creates no Assistant job');
select extensions.is((select count(*)::integer from public.appointment_automation_jobs where appointment_id='39400000-0000-4000-8000-000000000002'),1,'Plus appointment creates an Assistant job');
select extensions.is((select count(*)::integer from public.appointment_automation_jobs where appointment_id='39400000-0000-4000-8000-000000000003'),1,'Pro appointment creates an Assistant job');

update public.clinic_subscriptions set plan_id='basic' where clinic_id='39100000-0000-4000-8000-000000000002';
insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at) values
  ('39400000-0000-4000-8000-000000000004','39100000-0000-4000-8000-000000000002','39200000-0000-4000-8000-000000000002','39000000-0000-4000-8000-000000000002','Post downgrade appointment',now()+interval '4 days',now()+interval '4 days 1 hour');
select extensions.is((select count(*)::integer from public.appointment_automation_jobs where appointment_id='39400000-0000-4000-8000-000000000004'),0,'downgrade blocks new Assistant jobs');

update public.appointment_automation_jobs set next_attempt_at=now()-interval '1 minute',scheduled_for=now()-interval '1 minute'
where appointment_id='39400000-0000-4000-8000-000000000002';
set local role service_role;
create temp table commercial_claim on commit drop as
  select * from public.claim_due_appointment_automation_jobs('commercial_worker',1,90);
select extensions.is((select count(*)::integer from commercial_claim),1,'pre-downgrade pending job remains claimable');
select extensions.is(public.begin_appointment_automation_delivery((select id from commercial_claim),'commercial_worker',(select lease_token from commercial_claim)),true,'existing job may begin safe delivery');
select extensions.is(public.mark_appointment_automation_delivery_accepted((select id from commercial_claim),'commercial_worker',(select lease_token from commercial_claim)),true,'existing provider acceptance remains recordable');
select extensions.is(public.finish_appointment_automation_job((select id from commercial_claim),'commercial_worker',(select lease_token from commercial_claim),'succeeded',null,null),true,'existing accepted job may finish after downgrade');
reset role;
select extensions.is((select status from public.appointment_automation_jobs where id=(select id from commercial_claim)),'succeeded','downgrade reconciliation persists terminal success');

set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000001',true);
select extensions.lives_ok(
  $$select * from public.prepare_appointment_email_invite('39400000-0000-4000-8000-000000000001','REQUEST','commercial-basic-ics',(select updated_at from public.appointments where id='39400000-0000-4000-8000-000000000001'))$$,
  'Basic retains ICS email invitations');
select extensions.lives_ok(
  $$select public.create_consent_for_current_user('39100000-0000-4000-8000-000000000001','39200000-0000-4000-8000-000000000001','Consentimiento personalizado','especialidad-v1','Contenido personalizado por especialidad',null)$$,
  'Basic retains personalized consent creation');
reset role;

insert into public.doctor_public_profiles(clinic_id,profile_id,clinic_member_id,slug,display_name,specialty,is_published)
select '39100000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000001',id,'commercial-basic-owner','Basic Owner','Medicina general',true
from public.clinic_members where clinic_id='39100000-0000-4000-8000-000000000001' and user_id='39000000-0000-4000-8000-000000000001';
update public.appointments
set starts_at=now()-interval '2 hours', ends_at=now()-interval '1 hour', status='completed'
where id='39400000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000001',true);
select extensions.lives_ok(
  $$select * from public.issue_review_invitation_for_current_user('39100000-0000-4000-8000-000000000001','39400000-0000-4000-8000-000000000001')$$,
  'Basic retains manual Verified Reviews');
select extensions.lives_ok(
  $$select * from public.create_support_ticket_for_current_user('39100000-0000-4000-8000-000000000001','configuration','informational','Commercial entitlement question','No clinical information included',array['subscription_active'])$$,
  'Basic retains Service Bot Tier 1 tickets');
reset role;

select extensions.is((select count(*)::integer from public.appointment_automation_jobs where appointment_id='39400000-0000-4000-8000-000000000001' and type='review_request_email'),0,'Basic manual Review does not re-enable Assistant automation');
select extensions.ok(pg_get_functiondef('public.prepare_appointment_email_invite(uuid,text,text,timestamptz)'::regprocedure) not like '%clinic_plan_includes_commercial_feature_internal%','ICS RPC remains independent from plan feature gates');
select extensions.ok(pg_get_functiondef('public.create_consent_for_current_user(uuid,uuid,text,text,text,uuid)'::regprocedure) not like '%clinic_plan_includes_commercial_feature_internal%','custom consent RPC remains independent from plan feature gates');

select * from extensions.finish();
rollback;
