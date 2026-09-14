begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(24);

insert into auth.users(id,email) values
  ('47100000-0000-4000-8000-000000000001','rbac-owner@example.test'),
  ('47100000-0000-4000-8000-000000000002','rbac-admin@example.test'),
  ('47100000-0000-4000-8000-000000000003','rbac-doctor@example.test'),
  ('47100000-0000-4000-8000-000000000004','rbac-other-doctor@example.test'),
  ('47100000-0000-4000-8000-000000000005','rbac-assistant@example.test'),
  ('47100000-0000-4000-8000-000000000006','rbac-foreign-assistant@example.test');
insert into public.clinics(id,name,timezone) values
  ('47200000-0000-4000-8000-000000000001','RBAC Clinic','America/Mexico_City'),
  ('47200000-0000-4000-8000-000000000002','RBAC Foreign','America/Mexico_City');
insert into public.clinic_members(id,clinic_id,user_id,role,status) values
  ('47300000-0000-4000-8000-000000000001','47200000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000001','owner','active'),
  ('47300000-0000-4000-8000-000000000002','47200000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000002','admin','active'),
  ('47300000-0000-4000-8000-000000000003','47200000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000003','doctor','active'),
  ('47300000-0000-4000-8000-000000000004','47200000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000004','doctor','active'),
  ('47300000-0000-4000-8000-000000000005','47200000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000005','assistant','active'),
  ('47300000-0000-4000-8000-000000000006','47200000-0000-4000-8000-000000000002','47100000-0000-4000-8000-000000000006','assistant','active');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values ('47200000-0000-4000-8000-000000000001','pro','active','manual');
insert into public.patients(id,clinic_id,full_name,first_names,internal_identifier) values ('47400000-0000-4000-8000-000000000001','47200000-0000-4000-8000-000000000001','RBAC Patient','RBAC Patient','PAC-RBAC0001');
insert into public.professional_availability_rules(clinic_id,clinic_member_id,weekday,start_time,end_time,effective_from) values ('47200000-0000-4000-8000-000000000001','47300000-0000-4000-8000-000000000003',1,'09:00','13:00',date '2026-01-01');
insert into public.professional_availability_rules(clinic_id,clinic_member_id,weekday,start_time,end_time,effective_from) values ('47200000-0000-4000-8000-000000000001','47300000-0000-4000-8000-000000000004',1,'09:00','13:00',date '2026-01-01');
insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at,status) values
  ('47500000-0000-4000-8000-000000000001','47200000-0000-4000-8000-000000000001','47400000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000003','Doctor own',timestamptz '2030-01-07 15:00+00',timestamptz '2030-01-07 16:00+00','scheduled'),
  ('47500000-0000-4000-8000-000000000002','47200000-0000-4000-8000-000000000001','47400000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000003','Assistant lifecycle',timestamptz '2030-01-07 16:00+00',timestamptz '2030-01-07 17:00+00','scheduled'),
  ('47500000-0000-4000-8000-000000000003','47200000-0000-4000-8000-000000000001','47400000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000004','Other doctor',timestamptz '2030-01-08 15:00+00',timestamptz '2030-01-08 16:00+00','scheduled'),
  ('47500000-0000-4000-8000-000000000004','47200000-0000-4000-8000-000000000001','47400000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000003','Owner lifecycle',timestamptz '2030-01-07 17:00+00',timestamptz '2030-01-07 18:00+00','scheduled'),
  ('47500000-0000-4000-8000-000000000005','47200000-0000-4000-8000-000000000001','47400000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000004','Admin lifecycle',timestamptz '2030-01-07 18:00+00',timestamptz '2030-01-07 19:00+00','scheduled');

set local role authenticated;
select set_config('request.jwt.claim.sub','47100000-0000-4000-8000-000000000001',true);
select extensions.ok((select appointment_id is not null from public.create_appointment_for_current_user('47200000-0000-4000-8000-000000000001','47400000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000004','Owner create',null,null,null,timestamptz '2030-01-07 16:00+00',timestamptz '2030-01-07 17:00+00')),'owner can create appointments');
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000004','confirm','scheduled',null,null)),'confirmed','owner confirms clinic appointment');
select extensions.lives_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000004','reschedule','confirmed',timestamptz '2030-01-07 17:15+00',timestamptz '2030-01-07 17:45+00')$$,'owner reschedules clinic appointment');
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000004','cancel','confirmed',null,null)),'cancelled','owner cancels clinic appointment');
select set_config('request.jwt.claim.sub','47100000-0000-4000-8000-000000000002',true);
select extensions.ok((select appointment_id is not null from public.create_appointment_for_current_user('47200000-0000-4000-8000-000000000001','47400000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000004','Admin create',null,null,null,timestamptz '2030-01-07 17:00+00',timestamptz '2030-01-07 18:00+00')),'admin can create appointments');
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000005','confirm','scheduled',null,null)),'confirmed','admin confirms clinic appointment');
select extensions.lives_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000005','reschedule','confirmed',timestamptz '2030-01-07 18:15+00',timestamptz '2030-01-07 18:45+00')$$,'admin reschedules clinic appointment');
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000005','cancel','confirmed',null,null)),'cancelled','admin cancels clinic appointment');
select set_config('request.jwt.claim.sub','47100000-0000-4000-8000-000000000005',true);
select extensions.ok((select appointment_id is not null from public.create_appointment_for_current_user('47200000-0000-4000-8000-000000000001','47400000-0000-4000-8000-000000000001','47100000-0000-4000-8000-000000000004','Assistant create',null,null,null,timestamptz '2030-01-07 15:00+00',timestamptz '2030-01-07 16:00+00')),'assistant can create appointments');
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000002','confirm','scheduled',null,null)),'confirmed','assistant confirms clinic appointment');
select extensions.lives_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000002','reschedule','confirmed',timestamptz '2030-01-07 18:00+00',timestamptz '2030-01-07 19:00+00')$$,'assistant reschedules clinic appointment through lifecycle RPC');
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000002','cancel','confirmed',null,null)),'cancelled','assistant cancels clinic appointment');
select extensions.is((select count(*)::int from public.appointment_events where appointment_id='47500000-0000-4000-8000-000000000002' and actor_user_id='47100000-0000-4000-8000-000000000005'),3,'assistant lifecycle actions write appointment events');
select extensions.throws_ok($$select public.save_professional_availability_for_current_user('47200000-0000-4000-8000-000000000001','47300000-0000-4000-8000-000000000003',date '2030-01-01','[]'::jsonb)$$,'42501',null,'assistant cannot modify professional availability');
select extensions.lives_ok($$select * from public.get_professional_availability_week('47200000-0000-4000-8000-000000000001','47300000-0000-4000-8000-000000000003',date '2030-01-07')$$,'assistant can read professional availability');
select set_config('request.jwt.claim.sub','47100000-0000-4000-8000-000000000003',true);
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000001','confirm','scheduled',null,null)),'confirmed','doctor confirms own appointment');
select extensions.lives_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000001','reschedule','confirmed',timestamptz '2030-01-07 18:00+00',timestamptz '2030-01-07 19:00+00')$$,'doctor reschedules own appointment');
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000001','cancel','confirmed',null,null)),'cancelled','doctor cancels own appointment');
select extensions.throws_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000003','cancel','scheduled',null,null)$$,'42501',null,'doctor cannot cancel another doctor appointment');
select extensions.throws_ok($$select * from public.get_professional_availability_week('47200000-0000-4000-8000-000000000001','47300000-0000-4000-8000-000000000004',date '2030-01-07')$$,'42501',null,'doctor cannot read another professional availability');
select set_config('request.jwt.claim.sub','47100000-0000-4000-8000-000000000006',true);
select extensions.throws_ok($$select * from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000001','cancel','confirmed',null,null)$$,'42501',null,'assistant cross-tenant lifecycle is denied');
select set_config('request.jwt.claim.sub','47100000-0000-4000-8000-000000000001',true);
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000001','cancel','cancelled',null,null)),'cancelled','owner cancellation remains idempotent');
select set_config('request.jwt.claim.sub','47100000-0000-4000-8000-000000000002',true);
select extensions.is((select status::text from public.mutate_appointment_lifecycle_for_current_user('47200000-0000-4000-8000-000000000001','47500000-0000-4000-8000-000000000001','cancel','cancelled',null,null)),'cancelled','admin cancellation is idempotent');
select extensions.is((select count(*)::int from public.appointment_events where appointment_id='47500000-0000-4000-8000-000000000001' and event_type='cancelled'),1,'idempotent lifecycle keeps one cancellation event');

reset role;
select extensions.finish();
rollback;
