begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(25);

insert into auth.users(id, email) values
  ('53100000-0000-4000-8000-000000000001', 'suggest-owner@example.test'),
  ('53100000-0000-4000-8000-000000000002', 'suggest-admin@example.test'),
  ('53100000-0000-4000-8000-000000000003', 'suggest-assistant@example.test'),
  ('53100000-0000-4000-8000-000000000004', 'suggest-doctor-1@example.test'),
  ('53100000-0000-4000-8000-000000000005', 'suggest-doctor-2@example.test'),
  ('53100000-0000-4000-8000-000000000006', 'suggest-doctor-3@example.test'),
  ('53100000-0000-4000-8000-000000000007', 'suggest-inactive@example.test'),
  ('53100000-0000-4000-8000-000000000008', 'suggest-foreign@example.test');
insert into public.clinics(id, name, timezone) values
  ('53200000-0000-4000-8000-000000000001', 'Suggest North', 'America/Mexico_City'),
  ('53200000-0000-4000-8000-000000000002', 'Suggest Foreign', 'America/Mexico_City');
insert into public.clinic_members(id, clinic_id, user_id, role, status, is_professional) values
  ('53300000-0000-4000-8000-000000000001', '53200000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000001', 'owner', 'active', false),
  ('53300000-0000-4000-8000-000000000002', '53200000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000002', 'admin', 'active', false),
  ('53300000-0000-4000-8000-000000000003', '53200000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000003', 'assistant', 'active', false),
  ('53300000-0000-4000-8000-000000000004', '53200000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000004', 'doctor', 'active', true),
  ('53300000-0000-4000-8000-000000000005', '53200000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000005', 'doctor', 'active', true),
  ('53300000-0000-4000-8000-000000000006', '53200000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000006', 'doctor', 'active', true),
  ('53300000-0000-4000-8000-000000000007', '53200000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000007', 'doctor', 'active', true),
  ('53300000-0000-4000-8000-000000000008', '53200000-0000-4000-8000-000000000002', '53100000-0000-4000-8000-000000000008', 'doctor', 'active', true);
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, archived_at) values
  ('53400000-0000-4000-8000-000000000001', '53200000-0000-4000-8000-000000000001', 'Assigned Two', 'Assigned Two', 'PAC-SUGGESTA01', null),
  ('53400000-0000-4000-8000-000000000002', '53200000-0000-4000-8000-000000000001', 'Unassigned', 'Unassigned', 'PAC-SUGGESTB01', null),
  ('53400000-0000-4000-8000-000000000003', '53200000-0000-4000-8000-000000000001', 'Shared', 'Shared', 'PAC-SUGGESTC01', null),
  ('53400000-0000-4000-8000-000000000004', '53200000-0000-4000-8000-000000000002', 'Foreign', 'Foreign', 'PAC-SUGGESTD01', null),
  ('53400000-0000-4000-8000-000000000005', '53200000-0000-4000-8000-000000000001', 'Archived', 'Archived', 'PAC-SUGGESTE01', now()),
  ('53400000-0000-4000-8000-000000000006', '53200000-0000-4000-8000-000000000001', 'Suspended Assignment', 'Suspended Assignment', 'PAC-SUGGESTF01', null),
  ('53400000-0000-4000-8000-000000000007', '53200000-0000-4000-8000-000000000001', 'Ended Assignment', 'Ended Assignment', 'PAC-SUGGESTG01', null);
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, status)
values ('53400000-0000-4000-8000-000000000008', '53200000-0000-4000-8000-000000000001', 'Inactive', 'Inactive', 'PAC-SUGGESTH01', 'inactive');
insert into public.patient_professional_assignments(clinic_id, patient_id, clinic_member_id, source, is_active) values
  ('53200000-0000-4000-8000-000000000001', '53400000-0000-4000-8000-000000000001', '53300000-0000-4000-8000-000000000005', 'manual', true),
  ('53200000-0000-4000-8000-000000000001', '53400000-0000-4000-8000-000000000003', '53300000-0000-4000-8000-000000000005', 'manual', true),
  ('53200000-0000-4000-8000-000000000001', '53400000-0000-4000-8000-000000000003', '53300000-0000-4000-8000-000000000006', 'manual', true),
  ('53200000-0000-4000-8000-000000000001', '53400000-0000-4000-8000-000000000006', '53300000-0000-4000-8000-000000000007', 'manual', true),
  ('53200000-0000-4000-8000-000000000001', '53400000-0000-4000-8000-000000000007', '53300000-0000-4000-8000-000000000004', 'manual', false);
update public.clinic_members set status = 'suspended' where id = '53300000-0000-4000-8000-000000000007';

set local role authenticated;
select set_config('request.jwt.claim.sub', '53100000-0000-4000-8000-000000000001', true);
select extensions.is((select string_agg(right(professional_clinic_member_id::text, 1), ',' order by professional_clinic_member_id) from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000001')), '5', 'owner sees only assigned doctor');
select extensions.is((select string_agg(right(professional_clinic_member_id::text, 1), ',' order by professional_clinic_member_id) from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000002')), '4,5,6', 'owner sees all active professionals for unassigned patient');
select extensions.is((select string_agg(right(professional_clinic_member_id::text, 1), ',' order by professional_clinic_member_id) from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000003')), '5,6', 'shared assignments show both professionals');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000004')), 0, 'cross-tenant patient returns no IDs');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000005')), 0, 'archived patient returns no IDs');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000008')), 0, 'inactive patient returns no IDs');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000006')), 0, 'suspended assigned professional is excluded without fallback');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000007')), 3, 'inactive assignment is ignored and permits active professionals');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000000')), 0, 'unknown patient returns no IDs');
select extensions.throws_ok($$select * from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000002','53400000-0000-4000-8000-000000000004')$$, '42501', null, 'owner cannot query another clinic');
select set_config('request.jwt.claim.sub', '53100000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000002')), 3, 'admin can suggest active professionals for unassigned patient');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000001')), 1, 'admin sees assigned doctor only');
select set_config('request.jwt.claim.sub', '53100000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000002')), 3, 'assistant can suggest active professionals for unassigned patient');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000001')), 1, 'assistant sees assigned doctor only');
select extensions.is((select count(*)::integer from public.patient_professional_assignments where clinic_id='53200000-0000-4000-8000-000000000001'), 0, 'assistant cannot read assignment rows directly');
select set_config('request.jwt.claim.sub', '53100000-0000-4000-8000-000000000005', true);
select extensions.is((select string_agg(right(professional_clinic_member_id::text, 1), ',' order by professional_clinic_member_id) from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000001')), '5', 'doctor sees own assigned identity');
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000002')), 0, 'doctor sees no professionals for unassigned patient');
select extensions.is((select string_agg(right(professional_clinic_member_id::text, 1), ',' order by professional_clinic_member_id) from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000003')), '5', 'doctor sees own identity for shared patient only');
select set_config('request.jwt.claim.sub', '53100000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000001')), 0, 'doctor cannot see another doctor assignment');
select set_config('request.jwt.claim.sub', '53100000-0000-4000-8000-000000000007', true);
select extensions.throws_ok($$select * from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000001')$$, '42501', null, 'suspended actor is rejected');
select set_config('request.jwt.claim.sub', '53100000-0000-4000-8000-000000000008', true);
select extensions.throws_ok($$select * from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000001')$$, '42501', null, 'cross-tenant actor is rejected');
select set_config('request.jwt.claim.sub', '', true);
select extensions.throws_ok($$select * from public.list_patient_eligible_professionals_for_scheduling('53200000-0000-4000-8000-000000000001','53400000-0000-4000-8000-000000000001')$$, '42501', null, 'missing authenticated actor is rejected');
reset role;
select extensions.ok(not has_function_privilege('anon', 'public.list_patient_eligible_professionals_for_scheduling(uuid,uuid)', 'execute'), 'anon cannot execute RPC');
select extensions.ok(has_function_privilege('authenticated', 'public.list_patient_eligible_professionals_for_scheduling(uuid,uuid)', 'execute'), 'authenticated role can execute RPC');
select extensions.ok((select 'search_path=public, pg_temp' = any(proconfig) from pg_proc where oid = 'public.list_patient_eligible_professionals_for_scheduling(uuid,uuid)'::regprocedure), 'security definer uses fixed search_path');
select extensions.finish();
rollback;
