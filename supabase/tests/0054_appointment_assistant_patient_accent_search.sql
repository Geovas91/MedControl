begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(61);

insert into auth.users(id, email) values
  ('54100000-0000-4000-8000-000000000001', 'accent-owner@example.test'),
  ('54100000-0000-4000-8000-000000000002', 'accent-admin@example.test'),
  ('54100000-0000-4000-8000-000000000003', 'accent-assistant@example.test'),
  ('54100000-0000-4000-8000-000000000004', 'accent-doctor-1@example.test'),
  ('54100000-0000-4000-8000-000000000005', 'accent-doctor-2@example.test'),
  ('54100000-0000-4000-8000-000000000006', 'accent-suspended@example.test'),
  ('54100000-0000-4000-8000-000000000007', 'accent-foreign@example.test');
insert into public.clinics(id, name, timezone) values
  ('54200000-0000-4000-8000-000000000001', 'Accent North QA', 'America/Mexico_City'),
  ('54200000-0000-4000-8000-000000000002', 'Accent Foreign QA', 'America/Mexico_City');
insert into public.clinic_members(id, clinic_id, user_id, role, status, is_professional) values
  ('54300000-0000-4000-8000-000000000001', '54200000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000001', 'owner', 'active', false),
  ('54300000-0000-4000-8000-000000000002', '54200000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000002', 'admin', 'active', false),
  ('54300000-0000-4000-8000-000000000003', '54200000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000003', 'assistant', 'active', false),
  ('54300000-0000-4000-8000-000000000004', '54200000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000004', 'doctor', 'active', true),
  ('54300000-0000-4000-8000-000000000005', '54200000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000005', 'doctor', 'active', true),
  ('54300000-0000-4000-8000-000000000006', '54200000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000006', 'doctor', 'suspended', true),
  ('54300000-0000-4000-8000-000000000007', '54200000-0000-4000-8000-000000000002', '54100000-0000-4000-8000-000000000007', 'doctor', 'active', true);
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, archived_at) values
  ('54400000-0000-4000-8000-000000000001', '54200000-0000-4000-8000-000000000001', 'José Antonio Pérez González', 'José Antonio Pérez González', 'PAC-ACCENT01', null),
  ('54400000-0000-4000-8000-000000000002', '54200000-0000-4000-8000-000000000001', 'María Muñoz', 'María Muñoz', 'PAC-ACCENT02', null),
  ('54400000-0000-4000-8000-000000000003', '54200000-0000-4000-8000-000000000001', 'Ana Núñez', 'Ana Núñez', 'PAC-ACCENT03', null),
  ('54400000-0000-4000-8000-000000000004', '54200000-0000-4000-8000-000000000001', 'Andrés García', 'Andrés García', 'PAC-ACCENT04', null),
  ('54400000-0000-4000-8000-000000000005', '54200000-0000-4000-8000-000000000002', 'José Pérez Foreign', 'José Pérez Foreign', 'PAC-ACCENT05', null),
  ('54400000-0000-4000-8000-000000000006', '54200000-0000-4000-8000-000000000001', 'José Archivado', 'José Archivado', 'PAC-ACCENT06', now());
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, status)
values ('54400000-0000-4000-8000-000000000007', '54200000-0000-4000-8000-000000000001', 'Paciente Inactivo', 'Paciente Inactivo', 'PAC-ACCENT07', 'inactive');
insert into public.patient_professional_assignments(clinic_id, patient_id, clinic_member_id, source) values
  ('54200000-0000-4000-8000-000000000001', '54400000-0000-4000-8000-000000000001', '54300000-0000-4000-8000-000000000004', 'manual'),
  ('54200000-0000-4000-8000-000000000001', '54400000-0000-4000-8000-000000000002', '54300000-0000-4000-8000-000000000005', 'manual'),
  ('54200000-0000-4000-8000-000000000001', '54400000-0000-4000-8000-000000000004', '54300000-0000-4000-8000-000000000004', 'manual'),
  ('54200000-0000-4000-8000-000000000001', '54400000-0000-4000-8000-000000000004', '54300000-0000-4000-8000-000000000005', 'manual'),
  ('54200000-0000-4000-8000-000000000002', '54400000-0000-4000-8000-000000000005', '54300000-0000-4000-8000-000000000007', 'manual');

set local role authenticated;
select set_config('request.jwt.claim.sub', '54100000-0000-4000-8000-000000000001', true);
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Jose',9)), 'José Antonio Pérez González', 'Jose matches José without changing display name');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','José',9)), 'José Antonio Pérez González', 'José matches José');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Perez',9)), 'José Antonio Pérez González', 'Perez matches Pérez');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Pérez',9)), 'José Antonio Pérez González', 'Pérez matches Pérez');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Munoz',9)), 'María Muñoz', 'Munoz matches Muñoz');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Muñoz',9)), 'María Muñoz', 'Muñoz matches Muñoz');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Nunez',9)), 'Ana Núñez', 'Nunez matches Núñez');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Núñez',9)), 'Ana Núñez', 'Núñez matches Núñez');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Garcia',9)), 'Andrés García', 'Garcia matches García');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','jose perez',9)), 'José Antonio Pérez González', 'multi-term accent folding uses AND');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','AnToNiO GoNzAlEz',9)), 'José Antonio Pérez González', 'noncontiguous multi-term match');
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','jose nadie',9)), 0, 'unrelated token combination returns none');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','mArIa MuNoZ',9)), 'María Muñoz', 'mixed case and accents fold');
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Archivado',9)), 0, 'archived patient remains hidden by RLS');
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Inactivo',9)), 'Paciente Inactivo', 'directory preserves existing inactive patient behavior');
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000002','Foreign',9)), 0, 'owner cannot search another clinic');
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Foreign',9)), 0, 'cross-tenant patient never appears');
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Munoz',9)), 0, 'other-professional-only patient excluded from selected professional');
select extensions.is((select display_name from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Perez',9)), 'José Antonio Pérez González', 'scoped search folds Pérez and preserves display name');
select extensions.is((select display_name from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Nunez',9)), 'Ana Núñez', 'owner may schedule unassigned patient');
select extensions.is((select display_name from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Garcia',9)), 'Andrés García', 'shared assignment stays eligible');
select extensions.is((select display_name from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','jOsE pErEz',9)), 'José Antonio Pérez González', 'scoped multi-term mixed-case match');
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Inactivo',9)), 0, 'scoped search still excludes inactive patients');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000002','54300000-0000-4000-8000-000000000007','Jose',9)$$, '42501', null, 'scoped search rejects another clinic');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000006','Jose',9)$$, '42501', null, 'scoped search rejects suspended professional');
select extensions.throws_ok($$select * from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001',null,9)$$, '22023', null, 'invoker RPC rejects null query');
select extensions.throws_ok($$select * from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','J',9)$$, '22023', null, 'invoker RPC rejects short query');
select extensions.throws_ok($$select * from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001',repeat('x',81),9)$$, '22023', null, 'invoker RPC rejects long query');
select extensions.throws_ok($$select * from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Jo%',9)$$, '22023', null, 'invoker RPC rejects percent wildcard');
select extensions.throws_ok($$select * from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Jo_',9)$$, '22023', null, 'invoker RPC rejects underscore wildcard');
select extensions.throws_ok($$select * from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Jo' || chr(92) || 'se',9)$$, '22023', null, 'invoker RPC rejects backslash');
select extensions.throws_ok($$select * from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Jo' || chr(10) || 'se',9)$$, '22023', null, 'invoker RPC rejects control characters');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004',null,9)$$, '22023', null, 'scoped RPC rejects null query');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Jo%',9)$$, '22023', null, 'scoped RPC rejects percent wildcard');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Jo_',9)$$, '22023', null, 'scoped RPC rejects underscore wildcard');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Jo' || chr(92) || 'se',9)$$, '22023', null, 'scoped RPC rejects backslash');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Jo' || chr(10) || 'se',9)$$, '22023', null, 'scoped RPC rejects control characters');
select set_config('request.jwt.claim.sub', '54100000-0000-4000-8000-000000000002', true);
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Munoz',9)), 'María Muñoz', 'admin retains full clinic directory');
select extensions.is((select display_name from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Nunez',9)), 'Ana Núñez', 'admin retains unassigned first appointment');
select set_config('request.jwt.claim.sub', '54100000-0000-4000-8000-000000000003', true);
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Munoz',9)), 'María Muñoz', 'assistant retains full clinic directory');
select extensions.is((select display_name from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Nunez',9)), 'Ana Núñez', 'assistant retains unassigned first appointment');
select set_config('request.jwt.claim.sub', '54100000-0000-4000-8000-000000000004', true);
select extensions.is((select display_name from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Perez',9)), 'José Antonio Pérez González', 'doctor sees own assigned accented patient via RLS');
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Munoz',9)), 0, 'doctor does not see other-professional-only patient');
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Nunez',9)), 0, 'doctor does not see unassigned patient');
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Foreign',9)), 0, 'doctor cannot see cross-tenant patient');
select extensions.is((select display_name from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Perez',9)), 'José Antonio Pérez González', 'doctor can scope own professional');
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Nunez',9)), 0, 'doctor cannot schedule unassigned');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000005','Munoz',9)$$, '42501', null, 'doctor cannot scope another professional');
select set_config('request.jwt.claim.sub', '54100000-0000-4000-8000-000000000006', true);
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Jose',9)), 0, 'suspended actor sees no patients through invoker RLS');
select extensions.throws_ok($$select * from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Jose',9)$$, '42501', null, 'scoped search rejects suspended actor');
select set_config('request.jwt.claim.sub', '', true);
select extensions.throws_ok($$select * from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Jose',9)$$, '42501', null, 'invoker search requires authenticated actor');
reset role;
select extensions.ok(not has_function_privilege('anon', 'public.search_patient_names_for_assistant(uuid,text,integer)', 'execute'), 'anon cannot execute new RPC');
select extensions.ok(has_function_privilege('authenticated', 'public.search_patient_names_for_assistant(uuid,text,integer)', 'execute'), 'authenticated can execute new RPC');
select extensions.ok((select prosecdef = false from pg_proc where oid = 'public.search_patient_names_for_assistant(uuid,text,integer)'::regprocedure), 'new RPC is SECURITY INVOKER');
select extensions.ok((select proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = 'public.search_patient_names_for_assistant(uuid,text,integer)'::regprocedure), 'new RPC fixes search_path');
select extensions.ok(has_function_privilege('authenticated', 'public.search_patient_names_for_scheduling(uuid,uuid,text,integer)', 'execute'), 'scoped RPC keeps authenticated grant');
select extensions.ok(not has_function_privilege('anon', 'public.search_patient_names_for_scheduling(uuid,uuid,text,integer)', 'execute'), 'scoped RPC still denies anon');
insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier)
select ('54500000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '54200000-0000-4000-8000-000000000001', 'Extra ' || lpad(value::text, 2, '0'), 'Extra ' || lpad(value::text, 2, '0'), 'PAC-ACCEX' || lpad(value::text, 3, '0')
from generate_series(1, 12) as value;
set local role authenticated;
select set_config('request.jwt.claim.sub', '54100000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Extra',999)), 9, 'invoker RPC caps oversized limit to nine');
select extensions.is((select count(*)::integer from public.search_patient_names_for_scheduling('54200000-0000-4000-8000-000000000001','54300000-0000-4000-8000-000000000004','Extra',999)), 9, 'scoped RPC caps oversized limit to nine');
select extensions.is((select count(*)::integer from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Extra',0)), 1, 'invoker RPC floors limit at one');
select extensions.is((select string_agg(display_name, ',' order by display_name) from public.search_patient_names_for_assistant('54200000-0000-4000-8000-000000000001','Extra',2)), 'Extra 01,Extra 02', 'ordering remains deterministic');
select extensions.finish();
rollback;
