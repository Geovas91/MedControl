begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(19);

insert into auth.users(id, email) values
  ('52100000-0000-4000-8000-000000000001', 'search-owner@example.test'),
  ('52100000-0000-4000-8000-000000000002', 'search-admin@example.test'),
  ('52100000-0000-4000-8000-000000000003', 'search-assistant@example.test'),
  ('52100000-0000-4000-8000-000000000004', 'search-doctor-1@example.test'),
  ('52100000-0000-4000-8000-000000000005', 'search-doctor-2@example.test'),
  ('52100000-0000-4000-8000-000000000006', 'search-doctor-3@example.test'),
  ('52100000-0000-4000-8000-000000000007', 'search-inactive@example.test'),
  ('52100000-0000-4000-8000-000000000008', 'search-foreign@example.test');
insert into public.clinics(id, name, timezone) values
  ('52200000-0000-4000-8000-000000000001', 'Search North', 'America/Mexico_City'),
  ('52200000-0000-4000-8000-000000000002', 'Search Foreign', 'America/Mexico_City');
insert into public.clinic_members(id, clinic_id, user_id, role, status, is_professional) values
  ('52300000-0000-4000-8000-000000000001', '52200000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000001', 'owner', 'active', false),
  ('52300000-0000-4000-8000-000000000002', '52200000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000002', 'admin', 'active', false),
  ('52300000-0000-4000-8000-000000000003', '52200000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000003', 'assistant', 'active', false),
  ('52300000-0000-4000-8000-000000000004', '52200000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000004', 'doctor', 'active', true),
  ('52300000-0000-4000-8000-000000000005', '52200000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000005', 'doctor', 'active', true),
  ('52300000-0000-4000-8000-000000000006', '52200000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000006', 'doctor', 'active', true),
  ('52300000-0000-4000-8000-000000000007', '52200000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000007', 'doctor', 'suspended', true),
  ('52300000-0000-4000-8000-000000000008', '52200000-0000-4000-8000-000000000002', '52100000-0000-4000-8000-000000000008', 'doctor', 'active', true);
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, archived_at) values
  ('52400000-0000-4000-8000-000000000001', '52200000-0000-4000-8000-000000000001', 'Juan A', 'Juan A', 'PAC-SEARCHA01', null),
  ('52400000-0000-4000-8000-000000000002', '52200000-0000-4000-8000-000000000001', 'Juan B', 'Juan B', 'PAC-SEARCHB01', null),
  ('52400000-0000-4000-8000-000000000003', '52200000-0000-4000-8000-000000000001', 'Juan C', 'Juan C', 'PAC-SEARCHC01', null),
  ('52400000-0000-4000-8000-000000000004', '52200000-0000-4000-8000-000000000001', 'Juan D', 'Juan D', 'PAC-SEARCHD01', null),
  ('52400000-0000-4000-8000-000000000005', '52200000-0000-4000-8000-000000000002', 'Juan Foreign', 'Juan Foreign', 'PAC-SEARCHF01', null),
  ('52400000-0000-4000-8000-000000000006', '52200000-0000-4000-8000-000000000001', 'Juan Archived', 'Juan Archived', 'PAC-SEARCHX01', now());
insert into public.patient_professional_assignments(clinic_id, patient_id, clinic_member_id, source) values
  ('52200000-0000-4000-8000-000000000001', '52400000-0000-4000-8000-000000000001', '52300000-0000-4000-8000-000000000005', 'manual'),
  ('52200000-0000-4000-8000-000000000001', '52400000-0000-4000-8000-000000000002', '52300000-0000-4000-8000-000000000004', 'manual'),
  ('52200000-0000-4000-8000-000000000001', '52400000-0000-4000-8000-000000000004', '52300000-0000-4000-8000-000000000005', 'manual'),
  ('52200000-0000-4000-8000-000000000001', '52400000-0000-4000-8000-000000000004', '52300000-0000-4000-8000-000000000006', 'manual'),
  ('52200000-0000-4000-8000-000000000002', '52400000-0000-4000-8000-000000000005', '52300000-0000-4000-8000-000000000008', 'manual');

set local role authenticated;
select set_config('request.jwt.claim.sub', '52100000-0000-4000-8000-000000000001', true);
select extensions.is((select string_agg(display_name, ',' order by display_name) from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan',9)), 'Juan A,Juan C,Juan D', 'owner sees selected assignments and unassigned, excluding other-only');
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','jUaN',9)), 3, 'name matching is case insensitive');
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan C',9)), 1, 'unassigned patient remains eligible for first appointment');
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan Foreign',9)), 0, 'cross-tenant patient never appears');
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan Archived',9)), 0, 'archived patient never appears');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000008','Juan',9)$$, '42501', null, 'cross-tenant professional is rejected');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000007','Juan',9)$$, '42501', null, 'inactive professional is rejected');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000001','Juan',9)$$, '42501', null, 'nonprofessional clinic member is rejected');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000002','52300000-0000-4000-8000-000000000008','Juan',9)$$, '42501', null, 'actor cannot search another clinic');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan%',9)$$, '22023', null, 'caller cannot expand search using SQL wildcards');
select set_config('request.jwt.claim.sub', '', true);
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan',9)$$, '42501', null, 'missing authenticated actor is rejected');
select set_config('request.jwt.claim.sub', '52100000-0000-4000-8000-000000000002', true);
select extensions.is((select string_agg(display_name, ',' order by display_name) from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan',9)), 'Juan A,Juan C,Juan D', 'admin has the same scoped scheduling results');
select set_config('request.jwt.claim.sub', '52100000-0000-4000-8000-000000000003', true);
select extensions.is((select string_agg(display_name, ',' order by display_name) from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan',9)), 'Juan A,Juan C,Juan D', 'assistant has the same scoped scheduling results');
select extensions.is((select count(*)::integer from public.patient_professional_assignments where clinic_id='52200000-0000-4000-8000-000000000001'), 0, 'RPC does not broaden assignment-table SELECT');
select set_config('request.jwt.claim.sub', '52100000-0000-4000-8000-000000000005', true);
select extensions.is((select string_agg(display_name, ',' order by display_name) from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan',9)), 'Juan A,Juan D', 'doctor sees only own assigned patients, not unassigned');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000004','Juan',9)$$, '42501', null, 'doctor cannot search as another professional');
reset role;
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier)
select ('52500000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '52200000-0000-4000-8000-000000000001', 'Juan Extra ' || value, 'Juan Extra ' || value, 'PAC-LIMIT' || lpad(value::text, 3, '0')
from generate_series(1, 12) as value;
set local role authenticated;
select set_config('request.jwt.claim.sub', '52100000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('52200000-0000-4000-8000-000000000001','52300000-0000-4000-8000-000000000005','Juan',999)), 9, 'server caps even an oversized requested limit');
reset role;
select extensions.ok(not has_function_privilege('anon', 'public.search_patient_names_for_scheduling(uuid,uuid,text,integer)', 'execute'), 'anon has no RPC grant');
select extensions.ok(has_function_privilege('authenticated', 'public.search_patient_names_for_scheduling(uuid,uuid,text,integer)', 'execute'), 'authenticated role has RPC grant');
select extensions.finish();
rollback;
