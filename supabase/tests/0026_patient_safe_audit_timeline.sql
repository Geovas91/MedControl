-- Run after a local reset that applies migration 0026.
begin;

insert into auth.users(id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'audit-owner-a@example.test'),
  ('b1000000-0000-4000-8000-000000000002', 'audit-doctor-a@example.test'),
  ('b1000000-0000-4000-8000-000000000003', 'audit-owner-b@example.test'),
  ('b1000000-0000-4000-8000-000000000004', 'audit-admin-a@example.test'),
  ('b1000000-0000-4000-8000-000000000005', 'audit-assistant-a@example.test');

insert into public.profiles(id, full_name, email) values
  ('b1000000-0000-4000-8000-000000000001', 'Owner Clínica A', 'audit-owner-a@example.test'),
  ('b1000000-0000-4000-8000-000000000002', 'Doctor Clínica A', 'audit-doctor-a@example.test'),
  ('b1000000-0000-4000-8000-000000000003', 'Owner Clínica B', 'audit-owner-b@example.test'),
  ('b1000000-0000-4000-8000-000000000004', 'Admin Clínica A', 'audit-admin-a@example.test'),
  ('b1000000-0000-4000-8000-000000000005', 'Assistant Clínica A', 'audit-assistant-a@example.test');

insert into public.clinics(id, name) values
  ('b2000000-0000-4000-8000-000000000001', 'Audit Clinic A'),
  ('b2000000-0000-4000-8000-000000000002', 'Audit Clinic B');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'doctor', 'active'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', 'admin', 'active'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000005', 'assistant', 'active');

insert into public.patients(id, clinic_id, full_name, first_names, paternal_surname, internal_identifier, status, created_by) values
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Paciente Audit A', 'Paciente', 'Audit A', 'PAC-AUDIT0001', 'active', 'b1000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Paciente Audit A2', 'Paciente', 'Audit A2', 'PAC-AUDIT0002', 'active', 'b1000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002', 'Paciente Audit B', 'Paciente', 'Audit B', 'PAC-AUDIT0003', 'active', 'b1000000-0000-4000-8000-000000000003');

insert into public.clinical_records(id, clinic_id, patient_id, status, created_by) values
  ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'active', 'b1000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000003', 'active', 'b1000000-0000-4000-8000-000000000003');

insert into public.initial_clinical_histories(id, clinic_id, clinical_record_id, patient_id, created_by) values
  ('b5000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');

insert into public.vital_sign_measurements(id, clinic_id, clinical_record_id, patient_id, temperature_c, recorded_by, created_by) values
  ('b6000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 36.8, 'b1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002');

insert into public.consents(id, clinic_id, patient_id, clinical_record_id, consent_type, consent_version, consent_text, status, created_by) values
  ('b7000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'Consentimiento auditado', 'v1', 'Contenido seguro', 'pending', 'b1000000-0000-4000-8000-000000000001');

insert into public.audit_logs(id, clinic_id, actor_user_id, entity_type, entity_id, action, metadata) values
  ('b8000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'patient', 'b3000000-0000-4000-8000-000000000001', 'patient_and_record_created', jsonb_build_object('secret', 'must-not-be-returned')),
  ('b8000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'consent', 'b7000000-0000-4000-8000-000000000001', 'consent_created', jsonb_build_object('token_hash', repeat('f', 64))),
  ('b8000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'patient', 'b3000000-0000-4000-8000-000000000002', 'other_patient_secret', jsonb_build_object('secret', 'other-patient'));

do $$
declare
  v_rpc regprocedure := 'public.list_patient_audit_timeline_for_current_user(uuid,uuid,timestamp with time zone,uuid,integer)'::regprocedure;
begin
  if not has_function_privilege('authenticated', v_rpc, 'execute')
    or has_function_privilege('anon', v_rpc, 'execute') then
    raise exception '0026 audit RPC grants are incorrect';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = v_rpc::oid
      and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
  ) then raise exception '0026 audit RPC lacks fixed SECURITY DEFINER properties'; end if;
  if pg_get_function_result(v_rpc::oid) ~* 'metadata|previous_values|new_values|changed_fields' then
    raise exception '0026 audit RPC exposes sensitive payload columns';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

do $$
begin
  if not exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      null, null,
      100
    ) where action = 'consent_created'
      and related_consent_id = 'b7000000-0000-4000-8000-000000000001'
      and actor_name = 'Owner Clínica A'
  ) then raise exception 'Owner cannot see the patient consent event safely'; end if;
  if not exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      null, null,
      100
    ) where resource_type = 'vital_sign_measurements'
  ) then raise exception 'Patient clinical change events are not related correctly'; end if;
  if exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      null, null,
      100
    ) where action = 'other_patient_secret'
  ) then raise exception 'Same-tenant cross-patient audit event leaked'; end if;
  if (select count(*) from public.list_patient_audit_timeline_for_current_user(
    'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    null, null,
    1
  )) <> 1 then raise exception 'Audit limit is not enforced'; end if;
  if exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000002',
      'b3000000-0000-4000-8000-000000000003',
      null, null,
      100
    )
  ) then raise exception 'Cross-tenant audit access leaked'; end if;
end
$$;

do $$
declare
  v_first_id uuid;
  v_first_at timestamptz;
begin
  select event_id, occurred_at into strict v_first_id, v_first_at
  from public.list_patient_audit_timeline_for_current_user(
    'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    null, null, 1
  );
  if exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      v_first_at, v_first_id, 100
    ) where event_id = v_first_id
  ) then raise exception 'Audit cursor repeated its boundary event'; end if;
  if not exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      v_first_at, v_first_id, 100
    )
  ) then raise exception 'Audit cursor hid older events'; end if;
end
$$;

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      null, null,
      100
    )
  ) then raise exception 'Doctor gained access to owner/admin patient audit'; end if;
end
$$;

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000004', true);
do $$
begin
  if not exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      null, null,
      100
    ) where action = 'patient_and_record_created'
  ) then raise exception 'Admin cannot see the patient audit timeline'; end if;
end
$$;

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000005', true);
do $$
begin
  if exists (
    select 1 from public.list_patient_audit_timeline_for_current_user(
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      null, null,
      100
    )
  ) then raise exception 'Assistant gained access to owner/admin patient audit'; end if;
end
$$;

reset role;
rollback;
