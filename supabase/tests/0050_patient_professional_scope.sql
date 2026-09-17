begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(19);

insert into auth.users(id,email) values
  ('50100000-0000-4000-8000-000000000001','scope-owner@example.test'),
  ('50100000-0000-4000-8000-000000000002','scope-doctor-a@example.test'),
  ('50100000-0000-4000-8000-000000000003','scope-doctor-b@example.test'),
  ('50100000-0000-4000-8000-000000000004','scope-assistant@example.test'),
  ('50100000-0000-4000-8000-000000000005','scope-admin@example.test'),
  ('50100000-0000-4000-8000-000000000006','scope-foreign@example.test');
insert into public.clinics(id,name,timezone) values
  ('50200000-0000-4000-8000-000000000001','Scope North','America/Mexico_City'),
  ('50200000-0000-4000-8000-000000000002','Scope Foreign','America/Mexico_City');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values
  ('50200000-0000-4000-8000-000000000001','pro','active','manual');
insert into public.clinic_members(id,clinic_id,user_id,role,status,is_professional) values
  ('50300000-0000-4000-8000-000000000001','50200000-0000-4000-8000-000000000001','50100000-0000-4000-8000-000000000001','owner','active',false),
  ('50300000-0000-4000-8000-000000000002','50200000-0000-4000-8000-000000000001','50100000-0000-4000-8000-000000000002','doctor','active',true),
  ('50300000-0000-4000-8000-000000000003','50200000-0000-4000-8000-000000000001','50100000-0000-4000-8000-000000000003','doctor','active',true),
  ('50300000-0000-4000-8000-000000000004','50200000-0000-4000-8000-000000000001','50100000-0000-4000-8000-000000000004','assistant','active',false),
  ('50300000-0000-4000-8000-000000000005','50200000-0000-4000-8000-000000000001','50100000-0000-4000-8000-000000000005','admin','active',false),
  ('50300000-0000-4000-8000-000000000006','50200000-0000-4000-8000-000000000002','50100000-0000-4000-8000-000000000006','doctor','active',true);
insert into public.patients(id,clinic_id,full_name,first_names,internal_identifier) values
  ('50400000-0000-4000-8000-000000000001','50200000-0000-4000-8000-000000000001','Patient A','Patient A','PAC-SCOPEA01'),
  ('50400000-0000-4000-8000-000000000002','50200000-0000-4000-8000-000000000001','Patient B','Patient B','PAC-SCOPEB01'),
  ('50400000-0000-4000-8000-000000000003','50200000-0000-4000-8000-000000000002','Patient Foreign','Patient Foreign','PAC-SCOPEF01');
insert into public.patient_professional_assignments(clinic_id,patient_id,clinic_member_id,source) values
  ('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001','50300000-0000-4000-8000-000000000002','manual'),
  ('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000002','50300000-0000-4000-8000-000000000003','manual');
insert into public.clinical_records(id,clinic_id,patient_id) values
  ('50500000-0000-4000-8000-000000000001','50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001'),
  ('50500000-0000-4000-8000-000000000002','50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000002');
insert into public.medical_notes(id,clinic_id,patient_id,doctor_id,status,note_data) values
  ('50600000-0000-4000-8000-000000000001','50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001','50100000-0000-4000-8000-000000000002','draft','{}'),
  ('50600000-0000-4000-8000-000000000002','50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000002','50100000-0000-4000-8000-000000000003','draft','{}');

set local role authenticated;
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000002',true);
select extensions.ok(public.has_patient_professional_scope('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001'),'doctor A has patient A scope');
select extensions.ok(not public.has_patient_professional_scope('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000002'),'doctor A lacks patient B scope');
select extensions.is((select count(*)::integer from public.patients where clinic_id='50200000-0000-4000-8000-000000000001'),1,'doctor A directory is scope limited');
select extensions.is((select count(*)::integer from public.medical_notes where clinic_id='50200000-0000-4000-8000-000000000001'),1,'doctor A clinical notes are scope limited');
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000003',true);
select extensions.is((select count(*)::integer from public.patients where clinic_id='50200000-0000-4000-8000-000000000001'),1,'doctor B directory is scope limited symmetrically');
select extensions.ok(public.has_patient_professional_scope('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000002'),'doctor B has patient B scope');
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000004',true);
select extensions.is((select count(*)::integer from public.patients where clinic_id='50200000-0000-4000-8000-000000000001'),2,'assistant retains administrative directory');
select extensions.is((select count(*)::integer from public.medical_notes where clinic_id='50200000-0000-4000-8000-000000000001'),0,'assistant cannot read clinical notes');
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000005',true);
select extensions.is((select count(*)::integer from public.patients where clinic_id='50200000-0000-4000-8000-000000000001'),2,'nonprofessional admin retains administrative directory');
select extensions.is((select count(*)::integer from public.clinical_records where clinic_id='50200000-0000-4000-8000-000000000001'),0,'nonprofessional admin cannot read clinical records');
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000001',true);
select extensions.is(public.set_patient_professional_assignment_for_current_user('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001','50300000-0000-4000-8000-000000000003',true),true,'admin owner can assign a care relationship');
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000003',true);
select extensions.ok(public.has_patient_professional_scope('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001'),'manual assignment grants scope');
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000001',true);
select extensions.is(public.set_patient_professional_assignment_for_current_user('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001','50300000-0000-4000-8000-000000000003',false),true,'relationship can be ended without deletion');
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000003',true);
select extensions.ok(not public.has_patient_professional_scope('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001'),'inactive relationship blocks clinical scope');
reset role;
select extensions.ok((select exists(select 1 from public.patient_professional_assignments where patient_id='50400000-0000-4000-8000-000000000001' and clinic_member_id='50300000-0000-4000-8000-000000000003' and not is_active and ended_at is not null)),'ended relationship preserves history');
set local role authenticated;
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000005',true);
select extensions.throws_ok($$select public.set_patient_professional_assignment_for_current_user('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001','50300000-0000-4000-8000-000000000004',true)$$,'23514',null,'assistant cannot be assigned as professional');
select set_config('request.jwt.claim.sub','50100000-0000-4000-8000-000000000006',true);
select extensions.ok(not public.has_patient_professional_scope('50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001'),'cross tenant scope is denied');
reset role;

insert into public.appointments(id,clinic_id,patient_id,doctor_id,title,starts_at,ends_at,status) values
  ('50700000-0000-4000-8000-000000000001','50200000-0000-4000-8000-000000000001','50400000-0000-4000-8000-000000000001','50100000-0000-4000-8000-000000000003','Provisional care',now()+interval '2 days',now()+interval '2 days 1 hour','scheduled');
select extensions.ok((select exists(select 1 from public.patient_professional_assignments where clinic_id='50200000-0000-4000-8000-000000000001' and patient_id='50400000-0000-4000-8000-000000000001' and clinic_member_id='50300000-0000-4000-8000-000000000003' and is_active)),'active appointment creates provisional scope');
update public.appointments set status='cancelled' where id='50700000-0000-4000-8000-000000000001';
select extensions.ok(not exists(select 1 from public.patient_professional_assignments where clinic_id='50200000-0000-4000-8000-000000000001' and patient_id='50400000-0000-4000-8000-000000000001' and clinic_member_id='50300000-0000-4000-8000-000000000003' and is_active and source='appointment'),'cancelled-only appointment does not retain appointment scope');
select extensions.finish();
rollback;
