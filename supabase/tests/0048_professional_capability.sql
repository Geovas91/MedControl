begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(33);

insert into auth.users(id,email) values
  ('48100000-0000-4000-8000-000000000001','cap-owner@example.test'),
  ('48100000-0000-4000-8000-000000000002','cap-owner-target@example.test'),
  ('48100000-0000-4000-8000-000000000003','cap-admin@example.test'),
  ('48100000-0000-4000-8000-000000000004','cap-doctor@example.test'),
  ('48100000-0000-4000-8000-000000000005','cap-assistant@example.test'),
  ('48100000-0000-4000-8000-000000000006','cap-foreign@example.test');
insert into public.clinics(id,name,timezone) values
  ('48200000-0000-4000-8000-000000000001','Capability Clinic','America/Mexico_City'),
  ('48200000-0000-4000-8000-000000000002','Capability Foreign','America/Mexico_City');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values ('48200000-0000-4000-8000-000000000001','pro','active','manual');
insert into public.clinic_members(id,clinic_id,user_id,role,status) values
  ('48300000-0000-4000-8000-000000000001','48200000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000001','owner','active'),
  ('48300000-0000-4000-8000-000000000002','48200000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000002','owner','active'),
  ('48300000-0000-4000-8000-000000000003','48200000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000003','admin','active'),
  ('48300000-0000-4000-8000-000000000004','48200000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000004','doctor','active'),
  ('48300000-0000-4000-8000-000000000005','48200000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000005','assistant','active'),
  ('48300000-0000-4000-8000-000000000006','48200000-0000-4000-8000-000000000002','48100000-0000-4000-8000-000000000006','assistant','active');
insert into public.patients(id,clinic_id,full_name,first_names,internal_identifier) values ('48400000-0000-4000-8000-000000000001','48200000-0000-4000-8000-000000000001','Capability Patient','Capability Patient','PAC-CAP00001');

set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.is((select is_professional from public.list_clinic_members_for_current_user('48200000-0000-4000-8000-000000000001') where id='48300000-0000-4000-8000-000000000001'),false,'new owner is not automatically professional');
select extensions.is((select is_professional from public.list_clinic_members_for_current_user('48200000-0000-4000-8000-000000000001') where id='48300000-0000-4000-8000-000000000003'),false,'new admin is not automatically professional');
select extensions.is((select is_professional from public.list_clinic_members_for_current_user('48200000-0000-4000-8000-000000000001') where id='48300000-0000-4000-8000-000000000004'),true,'doctor is always professional');
select extensions.is((select is_professional from public.list_clinic_members_for_current_user('48200000-0000-4000-8000-000000000001') where id='48300000-0000-4000-8000-000000000005'),false,'assistant is never professional');
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',true),true,'owner enables another owner professional capability');
select extensions.is((select is_professional from public.list_clinic_members_for_current_user('48200000-0000-4000-8000-000000000001') where id='48300000-0000-4000-8000-000000000002'),true,'owner professional capability persists');
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000003',true),true,'owner enables admin professional capability');
select extensions.is((select is_professional from public.list_clinic_members_for_current_user('48200000-0000-4000-8000-000000000001') where id='48300000-0000-4000-8000-000000000003'),true,'admin professional capability persists');
select extensions.lives_ok($$select public.save_professional_availability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',date '2030-01-01','[{"weekday":1,"start_time":"09:00","end_time":"13:00"}]'::jsonb)$$,'professional owner can receive availability');
select extensions.lives_ok($$select public.save_professional_availability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000003',date '2030-01-01','[{"weekday":1,"start_time":"09:00","end_time":"13:00"}]'::jsonb)$$,'professional admin can receive availability');
select extensions.throws_ok($$select public.save_professional_availability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000001',date '2030-01-01','[]'::jsonb)$$,'42501',null,'non-professional owner cannot receive availability');
select extensions.lives_ok($$select public.save_professional_availability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000004',date '2030-01-01','[{"weekday":1,"start_time":"09:00","end_time":"13:00"}]'::jsonb)$$,'doctor can receive availability');
select extensions.throws_ok($$select public.save_professional_availability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000005',date '2030-01-01','[]'::jsonb)$$,'42501',null,'assistant cannot receive availability');
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000003',true);
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000003',false)$$,'42501',null,'member cannot change own capability');
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000004',false)$$,'22023',null,'doctor cannot become non-professional');
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000005',true)$$,'22023',null,'assistant cannot become professional');
reset role;
insert into public.doctor_public_profiles(id,clinic_id,clinic_member_id,slug,display_name,specialty,is_published) values
  ('48500000-0000-4000-8000-000000000001','48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002','capability-target-owner','Capability Owner','General',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',false),true,'professional owner without future appointments can be disabled');
select extensions.is((select is_published from public.doctor_public_profiles where id='48500000-0000-4000-8000-000000000001'),false,'disabling professional capability unpublishes the associated public profile');
select extensions.throws_ok($$select * from public.get_professional_available_slots('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',date '2030-01-07',30,30)$$,'22023',null,'non-professional member cannot produce slots');
reset role;
select extensions.is((select count(*)::integer from public.professional_availability_rules where clinic_member_id='48300000-0000-4000-8000-000000000002'),1,'availability rules remain stored while capability is disabled');
set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',true),true,'reactivating capability keeps existing availability eligible');
select extensions.is((select is_published from public.doctor_public_profiles where id='48500000-0000-4000-8000-000000000001'),false,'reactivating capability does not republish the public profile');
reset role;
insert into public.medical_notes(id,clinic_id,patient_id,doctor_id,status,clinical_impression,note_data) values
  ('48700000-0000-4000-8000-000000000001','48200000-0000-4000-8000-000000000001','48400000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000002','draft','Historical capability note','{"content":"Historical capability note"}');
insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at,status) values
  ('48600000-0000-4000-8000-000000000001','48200000-0000-4000-8000-000000000001','48400000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000002','Future capability appointment',now()+interval '7 days',now()+interval '7 days 1 hour','scheduled');
set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',false)$$,'P0001','professional_has_future_appointments','future scheduled appointment blocks capability removal');
reset role;
update public.appointments set status='confirmed' where id='48600000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',false)$$,'P0001','professional_has_future_appointments','future confirmed appointment blocks capability removal');
reset role;
update public.appointments
  set starts_at=now()+interval '1 hour', ends_at=now()+interval '2 hours', status='waiting'
  where id='48600000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.throws_ok($$select public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',false)$$,'P0001','professional_has_future_appointments','future waiting appointment blocks capability removal');
reset role;
update public.appointments set status='cancelled' where id='48600000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',false),true,'future cancelled appointment does not block capability removal');
select extensions.throws_ok($$select * from public.create_appointment_for_current_user('48200000-0000-4000-8000-000000000001','48400000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000002','No assignment to disabled professional',null,null,null,timestamptz '2030-01-07 15:00+00',timestamptz '2030-01-07 16:00+00')$$,'22023',null,'disabled professional cannot receive new appointments');
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',true),true,'owner can reactivate a professional after cancelling future appointments');
reset role;
insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at,status) values
  ('48600000-0000-4000-8000-000000000002','48200000-0000-4000-8000-000000000001','48400000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000002','Completed historical appointment',now()-interval '7 days',now()-interval '7 days'+interval '1 hour','scheduled');
update public.appointments set status='completed' where id='48600000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000001',true);
select extensions.is(public.set_clinic_member_professional_capability_for_current_user('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000002',false),true,'completed historical appointment does not block capability removal');
reset role;
select extensions.is((select count(*)::integer from public.appointments where doctor_id='48100000-0000-4000-8000-000000000002'),2,'capability removal preserves appointment history and authorship');
select extensions.ok((select exists(select 1 from public.medical_notes where id='48700000-0000-4000-8000-000000000001' and doctor_id='48100000-0000-4000-8000-000000000002')),'capability removal preserves clinical note history and authorship');
set local role authenticated;
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000005',true);
select extensions.ok((select appointment_id is not null from public.create_appointment_for_current_user('48200000-0000-4000-8000-000000000001','48400000-0000-4000-8000-000000000001','48100000-0000-4000-8000-000000000003','Assistant schedules professional admin',null,null,null,timestamptz '2030-01-07 15:00+00',timestamptz '2030-01-07 16:00+00')),'assistant schedules a professional admin without becoming professional');
select set_config('request.jwt.claim.sub','48100000-0000-4000-8000-000000000006',true);
select extensions.throws_ok($$select * from public.get_professional_availability_week('48200000-0000-4000-8000-000000000001','48300000-0000-4000-8000-000000000003',date '2030-01-07')$$,'42501',null,'cross-tenant availability access is denied');
reset role;
select extensions.finish();
rollback;


