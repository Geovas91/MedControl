begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(18);

insert into auth.users(id,email) values
  ('46100000-0000-4000-8000-000000000001','lifecycle-owner@example.test'),
  ('46100000-0000-4000-8000-000000000002','lifecycle-doctor@example.test'),
  ('46100000-0000-4000-8000-000000000003','lifecycle-assistant@example.test'),
  ('46100000-0000-4000-8000-000000000004','lifecycle-outsider@example.test');
insert into public.clinics(id,name,timezone) values
  ('46200000-0000-4000-8000-000000000001','Lifecycle Clinic','America/Mexico_City'),
  ('46200000-0000-4000-8000-000000000002','Lifecycle Foreign','America/Mexico_City');
insert into public.clinic_members(id,clinic_id,user_id,role,status) values
  ('46300000-0000-4000-8000-000000000001','46200000-0000-4000-8000-000000000001','46100000-0000-4000-8000-000000000001','owner','active'),
  ('46300000-0000-4000-8000-000000000002','46200000-0000-4000-8000-000000000001','46100000-0000-4000-8000-000000000002','doctor','active'),
  ('46300000-0000-4000-8000-000000000003','46200000-0000-4000-8000-000000000001','46100000-0000-4000-8000-000000000003','assistant','active'),
  ('46300000-0000-4000-8000-000000000004','46200000-0000-4000-8000-000000000002','46100000-0000-4000-8000-000000000004','doctor','active');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values ('46200000-0000-4000-8000-000000000001','pro','active','manual');
insert into public.patients(id,clinic_id,full_name,first_names,internal_identifier) values ('46400000-0000-4000-8000-000000000001','46200000-0000-4000-8000-000000000001','Lifecycle Patient','Lifecycle Patient','PAC-LIFE0001');
insert into public.professional_availability_rules(clinic_id,clinic_member_id,weekday,start_time,end_time,effective_from) values ('46200000-0000-4000-8000-000000000001','46300000-0000-4000-8000-000000000002',1,'09:00','13:00',date '2026-01-01');
insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at,status) values
  ('46500000-0000-4000-8000-000000000001','46200000-0000-4000-8000-000000000001','46400000-0000-4000-8000-000000000001','46100000-0000-4000-8000-000000000002','Scheduled',timestamptz '2030-01-07 15:00+00',timestamptz '2030-01-07 16:00+00','scheduled'),
  ('46500000-0000-4000-8000-000000000002','46200000-0000-4000-8000-000000000001','46400000-0000-4000-8000-000000000001','46100000-0000-4000-8000-000000000002','Second',timestamptz '2030-01-07 17:00+00',timestamptz '2030-01-07 18:00+00','scheduled');

select extensions.ok(has_function_privilege('authenticated','public.mutate_appointment_lifecycle_for_current_user(uuid,uuid,text,public.appointment_status,timestamptz,timestamptz)','execute'),'lifecycle RPC is authenticated');
select extensions.ok(not has_function_privilege('anon','public.mutate_appointment_lifecycle_for_current_user(uuid,uuid,text,public.appointment_status,timestamptz,timestamptz)','execute'),'lifecycle RPC excludes anon');
set local role authenticated; select set_config('request.jwt.claim.sub','46100000-0000-4000-8000-000000000001',true);
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','confirm','scheduled',null,null)),'confirmed','owner confirms scheduled appointment');
select extensions.is((select changed from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','confirm','confirmed',null,null)),false,'confirm confirmed is idempotent');
select extensions.is((select count(*)::int from public.appointment_events where appointment_id='46500000-0000-4000-8000-000000000001' and event_type='confirmed'),1,'confirmed event is not duplicated');
select extensions.lives_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','reschedule','confirmed',timestamptz '2030-01-07 16:00+00',timestamptz '2030-01-07 17:00+00')$$,'reschedule fits exact configured availability');
select extensions.is((select starts_at from public.appointments where id='46500000-0000-4000-8000-000000000001'),timestamptz '2030-01-07 16:00+00','reschedule persists new instant');
select extensions.throws_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','reschedule','confirmed',timestamptz '2030-01-07 20:00+00',timestamptz '2030-01-07 21:00+00')$$,'23P01',null,'outside availability is rejected');
insert into public.professional_availability_exceptions(clinic_id,clinic_member_id,exception_type,start_at,end_at) values ('46200000-0000-4000-8000-000000000001','46300000-0000-4000-8000-000000000002','unavailable',timestamptz '2030-01-07 15:00+00',timestamptz '2030-01-07 16:00+00');
select extensions.throws_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','reschedule','confirmed',timestamptz '2030-01-07 15:00+00',timestamptz '2030-01-07 16:00+00')$$,'23P01',null,'unavailable exception is enforced');
insert into public.professional_availability_exceptions(clinic_id,clinic_member_id,exception_type,start_at,end_at) values ('46200000-0000-4000-8000-000000000001','46300000-0000-4000-8000-000000000002','available',timestamptz '2030-01-07 20:00+00',timestamptz '2030-01-07 21:00+00');
select extensions.lives_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','reschedule','confirmed',timestamptz '2030-01-07 20:00+00',timestamptz '2030-01-07 21:00+00')$$,'extraordinary available exception is allowed');
select extensions.throws_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','reschedule','confirmed',timestamptz '2030-01-07 17:00+00',timestamptz '2030-01-07 18:00+00')$$,'23P01',null,'other appointment conflict is rejected');
select extensions.is((select changed from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','reschedule','confirmed',timestamptz '2030-01-07 20:00+00',timestamptz '2030-01-07 21:00+00')),false,'same schedule is idempotent');
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','cancel','confirmed',null,null)),'cancelled','confirmed appointment can be cancelled');
select extensions.is((select changed from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','cancel','cancelled',null,null)),false,'cancel cancelled is idempotent');
select extensions.is((select count(*)::int from public.appointment_events where appointment_id='46500000-0000-4000-8000-000000000001' and event_type='cancelled'),1,'cancel event is not duplicated');
select extensions.throws_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000001','confirm','cancelled',null,null)$$,'22023',null,'cancelled cannot be confirmed');
select set_config('request.jwt.claim.sub','46100000-0000-4000-8000-000000000003',true);
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000002','cancel','scheduled',null,null)),'cancelled','assistant cancels a clinic appointment');
select set_config('request.jwt.claim.sub','46100000-0000-4000-8000-000000000004',true);
select extensions.throws_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('46200000-0000-4000-8000-000000000001','46500000-0000-4000-8000-000000000002','cancel','scheduled',null,null)$$,'42501',null,'cross-tenant actor is denied');
reset role; select extensions.finish(); rollback;
