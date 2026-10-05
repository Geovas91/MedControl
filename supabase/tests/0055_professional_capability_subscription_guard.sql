begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(34);

insert into auth.users(id,email) values
  ('55100000-0000-4000-8000-000000000001','guard-owner@example.test'),
  ('55100000-0000-4000-8000-000000000002','guard-target@example.test'),
  ('55100000-0000-4000-8000-000000000003','guard-doctor@example.test'),
  ('55100000-0000-4000-8000-000000000004','guard-assistant@example.test'),
  ('55100000-0000-4000-8000-000000000005','guard-foreign@example.test');
insert into public.clinics(id,name,timezone) values
  ('55200000-0000-4000-8000-000000000001','Guard Clinic','America/Mexico_City'),
  ('55200000-0000-4000-8000-000000000002','Guard Foreign','America/Mexico_City');
insert into public.clinic_members(id,clinic_id,user_id,role,status) values
  ('55300000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000001','55100000-0000-4000-8000-000000000001','owner','active'),
  ('55300000-0000-4000-8000-000000000002','55200000-0000-4000-8000-000000000001','55100000-0000-4000-8000-000000000002','admin','active'),
  ('55300000-0000-4000-8000-000000000003','55200000-0000-4000-8000-000000000001','55100000-0000-4000-8000-000000000003','doctor','active'),
  ('55300000-0000-4000-8000-000000000004','55200000-0000-4000-8000-000000000001','55100000-0000-4000-8000-000000000004','assistant','active'),
  ('55300000-0000-4000-8000-000000000005','55200000-0000-4000-8000-000000000002','55100000-0000-4000-8000-000000000005','owner','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','55100000-0000-4000-8000-000000000001',true);
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true)$$,'42501','Professional capability is unavailable.','missing subscription rejects grant');
reset role;
select extensions.is((select is_professional from public.clinic_members where id='55300000-0000-4000-8000-000000000002'),false,'missing grant leaves target unchanged');
update public.clinic_members set is_professional=true where id='55300000-0000-4000-8000-000000000002';
insert into public.doctor_public_profiles(id,clinic_id,clinic_member_id,slug,display_name,specialty,is_published) values
  ('55400000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002','guard-target','Guard Target','General',true);
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'missing subscription permits safe removal');
select extensions.is((select is_published from public.doctor_public_profiles where id='55400000-0000-4000-8000-000000000001'),false,'removal unpublishes public profile');
reset role;

insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values ('55200000-0000-4000-8000-000000000001','pro','inactive','manual');
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true)$$,'42501','Professional capability is unavailable.','inactive rejects grant');
reset role;
update public.clinic_members set is_professional=true where id='55300000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'inactive permits safe removal');
reset role;
update public.clinic_subscriptions set status='cancelled' where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true)$$,'42501',null,'cancelled rejects grant');
reset role;
update public.clinic_members set is_professional=true where id='55300000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'cancelled permits safe removal');
reset role;
update public.clinic_subscriptions set status='past_due' where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true)$$,'42501',null,'past_due rejects grant');
reset role;
update public.clinic_members set is_professional=true where id='55300000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'past_due permits safe removal');
reset role;
update public.clinic_subscriptions set status='trialing',current_period_end=now()-interval '1 day' where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true)$$,'42501',null,'expired trial rejects grant');
reset role;
update public.clinic_members set is_professional=true where id='55300000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'expired trial permits safe removal');
reset role;
update public.clinic_subscriptions set current_period_end=null where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true)$$,'42501',null,'trial without end rejects grant');
reset role;
update public.clinic_members set is_professional=true where id='55300000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'trial without end permits safe removal');
reset role;
update public.clinic_subscriptions set current_period_end=now()+interval '1 day' where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true),true,'valid trial permits grant');
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'valid trial permits removal');
reset role;
update public.clinic_subscriptions set status='active',current_period_end=null where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true),true,'active Pro permits grant');
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'active Pro permits removal');
reset role;
update public.clinic_subscriptions set plan_id='basic' where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true)$$,'42501',null,'Basic doctor limit rejects grant');
reset role;
update public.clinic_subscriptions set plan_id='pro' where clinic_id='55200000-0000-4000-8000-000000000001';
insert into auth.users(id,email) select ('55100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'guard-extra-'||n||'@example.test' from generate_series(6,9) n;
insert into public.clinic_members(id,clinic_id,user_id,role,status) select ('55300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'55200000-0000-4000-8000-000000000001',('55100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'doctor','active' from generate_series(6,9) n;
update public.clinic_subscriptions set plan_id='plus' where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true)$$,'42501',null,'Plus professional limit rejects grant');
reset role;
update public.clinic_subscriptions set plan_id='pro' where clinic_id='55200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true),true,'Pro remains unlimited');
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000003',false)$$,'22023',null,'doctor cannot lose required capability');
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000004',true)$$,'22023',null,'assistant cannot gain capability');
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000005',true)$$,'22023',null,'cross-tenant target denied');
select set_config('request.jwt.claim.sub','55100000-0000-4000-8000-000000000002',true);
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false)$$,'42501',null,'admin self-change denied (owner self-management covered by 0057)');
select set_config('request.jwt.claim.sub','55100000-0000-4000-8000-000000000004',true);
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false)$$,'42501',null,'assistant actor denied');
select set_config('request.jwt.claim.sub','55100000-0000-4000-8000-000000000001',true);
reset role;
insert into public.patients(id,clinic_id,full_name,first_names,internal_identifier) values ('55500000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000001','Guard Patient','Guard','PAC-GUARD001');
insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at,status) values ('55600000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000001','55500000-0000-4000-8000-000000000001','55100000-0000-4000-8000-000000000002','Guard Appointment',now()+interval '7 days',now()+interval '7 days 1 hour','scheduled');
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false)$$,'P0001','professional_has_future_appointments','scheduled future appointment blocks removal');
reset role;
update public.appointments set status='confirmed' where id='55600000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false)$$,'P0001','professional_has_future_appointments','confirmed future appointment blocks removal');
reset role;
update public.appointments set status='waiting',starts_at=now()+interval '1 hour',ends_at=now()+interval '2 hours' where id='55600000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false)$$,'P0001','professional_has_future_appointments','waiting future appointment blocks removal');
reset role;
update public.appointments set status='cancelled' where id='55600000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'cancelled appointment permits removal');
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',true),true,'grant remains possible after cancelled appointment');
reset role;
insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at,status) values ('55600000-0000-4000-8000-000000000002','55200000-0000-4000-8000-000000000001','55500000-0000-4000-8000-000000000001','55100000-0000-4000-8000-000000000002','Historical Guard Appointment',now()-interval '7 days',now()-interval '7 days'+interval '1 hour','scheduled');
update public.appointments set status='completed' where id='55600000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('55200000-0000-4000-8000-000000000001','55300000-0000-4000-8000-000000000002',false),true,'completed appointment permits removal');
reset role;
select extensions.ok(not has_function_privilege('anon','public.set_clinic_member_professional_capability_for_current_user(uuid,uuid,boolean)','execute'),'anon cannot execute RPC');
select extensions.ok(has_function_privilege('authenticated','public.set_clinic_member_professional_capability_for_current_user(uuid,uuid,boolean)','execute'),'authenticated may execute guarded RPC');
reset role;

select extensions.finish();
rollback;
