begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(28);
insert into auth.users(id,email) values
  ('49100000-0000-4000-8000-000000000001','pending-owner@example.test'),
  ('49100000-0000-4000-8000-000000000002','pending-other@example.test'),
  ('49100000-0000-4000-8000-000000000003','pending-foreign@example.test');
insert into public.clinics(id,name,timezone) values
  ('49200000-0000-4000-8000-000000000001','Pending Clinic','America/Mexico_City'),
  ('49200000-0000-4000-8000-000000000002','Pending Foreign','America/Mexico_City');
insert into public.clinic_members(id,clinic_id,user_id,role,status) values
  ('49300000-0000-4000-8000-000000000001','49200000-0000-4000-8000-000000000001','49100000-0000-4000-8000-000000000001','owner','active'),
  ('49300000-0000-4000-8000-000000000002','49200000-0000-4000-8000-000000000001','49100000-0000-4000-8000-000000000002','assistant','active'),
  ('49300000-0000-4000-8000-000000000003','49200000-0000-4000-8000-000000000002','49100000-0000-4000-8000-000000000003','owner','active');
select extensions.ok(has_function_privilege('authenticated','public.create_assistant_pending_action_for_current_user(uuid,text,jsonb,timestamptz)','execute'),'authenticated can prepare');
select extensions.ok(not has_function_privilege('anon','public.create_assistant_pending_action_for_current_user(uuid,text,jsonb,timestamptz)','execute'),'anon cannot prepare');
set local role authenticated;
select set_config('request.jwt.claim.sub','49100000-0000-4000-8000-000000000001',true);
select extensions.is((select status from public.create_assistant_pending_action_for_current_user('49200000-0000-4000-8000-000000000001','cancel_appointment','{"appointment_id":"40100000-0000-4000-8000-000000000001","expected_status":"scheduled"}',now()+interval '5 minutes')),'pending','owner prepares pending action');
select extensions.is((select status from public.claim_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions limit 1))),'claimed','first confirmation atomically claims action');
select extensions.is((select status from public.claim_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions limit 1))),'already_claimed','second confirmation cannot reclaim or execute action');
select extensions.is(public.finish_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions limit 1),'executed',null),'executed','claimed action becomes executed');
select extensions.is((select status from public.claim_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions limit 1))),'executed','executed action cannot execute twice');
select extensions.throws_ok($$select public.create_assistant_pending_action_for_current_user('49200000-0000-4000-8000-000000000001','unknown_tool','{}',now()+interval '5 minutes')$$,'22023',null,'unknown tool rejected');
select extensions.throws_ok($$select public.create_assistant_pending_action_for_current_user('49200000-0000-4000-8000-000000000001','cancel_appointment','{"prompt":"secret"}',now()+interval '5 minutes')$$,'22023',null,'raw prompt payload rejected');
select extensions.throws_ok($$select public.create_assistant_pending_action_for_current_user('49200000-0000-4000-8000-000000000002','cancel_appointment','{}',now()+interval '5 minutes')$$,'42501',null,'cross tenant is rejected');
select set_config('request.jwt.claim.sub','49100000-0000-4000-8000-000000000002',true);
select extensions.throws_ok($$select public.claim_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions limit 1))$$,'42501',null,'other clinic member cannot claim actor proposal');
reset role;

insert into public.assistant_pending_actions(id,clinic_id,actor_user_id,actor_clinic_member_id,tool_name,validated_arguments,status,created_at,expires_at)
values ('49400000-0000-4000-8000-000000000001','49200000-0000-4000-8000-000000000001','49100000-0000-4000-8000-000000000001','49300000-0000-4000-8000-000000000001','cancel_appointment','{}','pending',now()-interval '2 minutes',now()-interval '1 minute');
set local role authenticated;
select set_config('request.jwt.claim.sub','49100000-0000-4000-8000-000000000001',true);
select extensions.is((select status from public.claim_assistant_pending_action_for_current_user('49400000-0000-4000-8000-000000000001')),'expired','expired proposal is never claimed');
select extensions.is((select status from public.create_assistant_pending_action_for_current_user('49200000-0000-4000-8000-000000000001','cancel_appointment','{}',now()+interval '5 minutes')),'pending','owner can prepare a cancellable proposal');
select extensions.is(public.cancel_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions where status='pending' order by created_at desc limit 1)),'cancelled','pending proposal can be cancelled');
select extensions.is((select status from public.claim_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions where status='cancelled' order by created_at desc limit 1))),'cancelled','cancelled proposal cannot execute');
select extensions.is((select status from public.create_assistant_pending_action_for_current_user('49200000-0000-4000-8000-000000000001','cancel_appointment','{}',now()+interval '5 minutes')),'pending','owner can prepare a failure fixture');
select extensions.is((select status from public.claim_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions where status='pending' order by created_at desc limit 1))),'claimed','failure fixture is claimed once');
select extensions.is(public.finish_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions where status='claimed' order by claimed_at desc limit 1),'failed','conflict'),'failed','failed action becomes terminal');
select extensions.is((select status from public.claim_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions where status='failed' order by failed_at desc limit 1))),'failed','failed action is never retried automatically');
select extensions.ok(not has_table_privilege('authenticated','public.assistant_pending_actions','insert,update,delete'),'authenticated has no direct mutation privilege');
select extensions.throws_ok($$update public.assistant_pending_actions set validated_arguments='{"patient_id":"tamper"}' where id='49400000-0000-4000-8000-000000000001'$$,'42501',null,'validated arguments cannot be mutated through table access');
reset role;
select extensions.ok(not has_table_privilege('anon','public.assistant_pending_actions','select,insert,update,delete'),'anon has no table access');
insert into auth.users(id,email) values ('49100000-0000-4000-8000-000000000004','pending-doctor@example.test');
insert into public.clinic_members(id,clinic_id,user_id,role,status,is_professional) values
  ('49300000-0000-4000-8000-000000000004','49200000-0000-4000-8000-000000000001','49100000-0000-4000-8000-000000000004','doctor','active',true);
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values ('49200000-0000-4000-8000-000000000001','pro','active','manual');
insert into public.patients(id,clinic_id,full_name,first_names,internal_identifier) values ('49500000-0000-4000-8000-000000000001','49200000-0000-4000-8000-000000000001','Pending Action Patient','Pending Action Patient','PAC-PENDING01');
set local role authenticated;
select set_config('request.jwt.claim.sub','49100000-0000-4000-8000-000000000001',true);
select extensions.is((select status from public.create_assistant_pending_action_for_current_user('49200000-0000-4000-8000-000000000001','create_appointment','{"patient_id":"49500000-0000-4000-8000-000000000001","professional_clinic_member_id":"49300000-0000-4000-8000-000000000004","local_date":"2030-01-07","local_time":"09:00","duration_minutes":30}',now()+interval '5 minutes')),'pending','create proposal accepts canonical professional identity');
select extensions.is((select count(*)::int from public.appointments where clinic_id='49200000-0000-4000-8000-000000000001'),0,'create proposal does not mutate appointments before confirmation');
select extensions.is((select count(*)::int from public.appointment_events where clinic_id='49200000-0000-4000-8000-000000000001'),0,'create proposal does not emit appointment events before confirmation');
select extensions.ok((select validated_arguments ? 'professional_clinic_member_id' and not (validated_arguments ? 'professional_id') and not (validated_arguments ? 'patient_name') from public.assistant_pending_actions where tool_name='create_appointment'),'create proposal stores only canonical operational identifiers');
reset role;
update public.clinic_members set status='suspended' where id='49300000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','49100000-0000-4000-8000-000000000001',true);
select extensions.throws_ok($$select * from public.claim_assistant_pending_action_for_current_user((select id from public.assistant_pending_actions where tool_name='create_appointment'))$$,'42501',null,'confirmation revalidates active membership after proposal');
reset role;
select extensions.is((select count(*)::int from public.appointments where clinic_id='49200000-0000-4000-8000-000000000001'),0,'revoked actor cannot mutate domain through a prepared proposal');
select extensions.finish();
rollback;
