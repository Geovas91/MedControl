-- Run after a local `supabase db reset` with:
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0027_medical_notes_tenant_integrity.sql
begin;

insert into auth.users(id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'notes-owner-a@example.test'),
  ('c1000000-0000-4000-8000-000000000002', 'notes-doctor-a@example.test'),
  ('c1000000-0000-4000-8000-000000000003', 'notes-assistant-a@example.test'),
  ('c1000000-0000-4000-8000-000000000004', 'notes-doctor-b@example.test');

insert into public.clinics(id, name) values
  ('c2000000-0000-4000-8000-000000000001', 'Notas Clínica A'),
  ('c2000000-0000-4000-8000-000000000002', 'Notas Clínica B');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'doctor', 'active'),
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'assistant', 'active'),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000004', 'doctor', 'active');

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values
  ('c2000000-0000-4000-8000-000000000001', 'pro', 'active', 'manual'),
  ('c2000000-0000-4000-8000-000000000002', 'pro', 'active', 'manual');

insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier) values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Paciente A Uno', 'Paciente A Uno', 'PAC-NOTESA01'),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Paciente A Dos', 'Paciente A Dos', 'PAC-NOTESA02'),
  ('c3000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000002', 'Paciente B', 'Paciente B', 'PAC-NOTESB01');

insert into public.medical_notes(id, clinic_id, patient_id, doctor_id, status, clinical_impression, note_data) values
  ('c4000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'draft', 'Nota del doctor A', '{"content":"Contenido A"}'),
  ('c4000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'draft', 'Nota del owner A', '{"content":"Contenido owner"}'),
  ('c4000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000004', 'draft', 'Nota del doctor B', '{"content":"Contenido B"}');

do $$
begin
  if (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='medical_notes' and grantee='authenticated') <> 3
    or exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='medical_notes' and grantee='authenticated'
        and privilege_type not in ('SELECT', 'INSERT', 'UPDATE')
    ) then
    raise exception 'Authenticated medical_notes grants are broader than SELECT, INSERT, UPDATE';
  end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='medical_notes' and grantee='anon') then
    raise exception 'Anonymous medical_notes grants remain';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.medical_notes'::regclass
      and conname='medical_notes_clinic_patient_fk'
      and convalidated
  ) then
    raise exception 'The medical note tenant/patient foreign key is not validated';
  end if;
  if exists (
    select 1 from pg_proc
    where oid='public.protect_clinical_note_finalization()'::regprocedure
      and prosecdef
  ) then
    raise exception 'The clinical note protection trigger became SECURITY DEFINER';
  end if;
  if exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname in ('medical_notes_clinic_id_idx', 'medical_notes_patient_id_idx')
  ) or (
    select count(*) from pg_indexes
    where schemaname='public' and indexname in (
      'medical_notes_clinic_created_id_idx',
      'medical_notes_clinic_status_created_id_idx',
      'medical_notes_patient_created_id_idx'
    )
  ) <> 3 then
    raise exception 'Medical note pagination indexes are missing or redundant legacy indexes remain';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);

do $$
declare
  patient_reassignment_rejected boolean := false;
  foreign_draft_edit_rejected boolean := false;
  finalized_update_rejected boolean := false;
begin
  begin
    truncate table public.medical_notes;
    raise exception 'Authenticated user truncated clinical notes';
  exception when insufficient_privilege then null;
  end;

  if (select count(*) from public.medical_notes) <> 2 then
    raise exception 'Doctor did not receive exactly the notes from the active clinic';
  end if;
  if exists (select 1 from public.medical_notes where clinic_id = 'c2000000-0000-4000-8000-000000000002') then
    raise exception 'Cross-tenant medical note read was allowed';
  end if;

  insert into public.medical_notes(clinic_id, patient_id, doctor_id, status, note_data)
  values ('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', auth.uid(), 'draft', '{"content":"Nueva nota válida"}');

  update public.medical_notes
  set clinical_impression = 'Edición legítima del autor',
      note_data = '{"content":"Contenido actualizado por el autor"}'
  where id = 'c4000000-0000-4000-8000-000000000001';
  if not found then raise exception 'Doctor could not edit the clinical content of an own draft'; end if;

  begin
    insert into public.medical_notes(clinic_id, patient_id, doctor_id, status, note_data)
    values ('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000003', auth.uid(), 'draft', '{"content":"Cross tenant"}');
    raise exception 'Cross-tenant patient_id was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.medical_notes(clinic_id, patient_id, doctor_id, status, note_data)
    values ('c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003', auth.uid(), 'draft', '{"content":"Foreign clinic"}');
    raise exception 'Cross-tenant clinic insert was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.medical_notes(clinic_id, patient_id, doctor_id, status, note_data)
    values ('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'draft', '{"content":"Forged author"}');
    raise exception 'A doctor forged another clinical note author';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.medical_notes
    set patient_id = 'c3000000-0000-4000-8000-000000000002'
    where id = 'c4000000-0000-4000-8000-000000000001';
  exception when raise_exception then patient_reassignment_rejected := true;
  end;
  if not patient_reassignment_rejected then raise exception 'A draft patient_id was reassigned'; end if;

  begin
    update public.medical_notes
    set clinical_impression = 'Edición ajena'
    where id = 'c4000000-0000-4000-8000-000000000002';
  exception when raise_exception then foreign_draft_edit_rejected := true;
  end;
  if not foreign_draft_edit_rejected then raise exception 'Doctor edited another author draft'; end if;

  update public.medical_notes
  set status = 'finalized'
  where id = 'c4000000-0000-4000-8000-000000000002';
  if not found then raise exception 'Doctor could not finalize an authorized clinic draft'; end if;

  begin
    update public.medical_notes
    set clinical_impression = 'Alteración posterior a finalización'
    where id = 'c4000000-0000-4000-8000-000000000002';
  exception when raise_exception then finalized_update_rejected := true;
  end;
  if not finalized_update_rejected then raise exception 'A finalized clinical note accepted a direct update'; end if;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform id from public.medical_notes limit 1;
    raise exception 'Anonymous user read clinical notes';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.medical_notes) then
    raise exception 'Assistant read clinical notes';
  end if;
  begin
    insert into public.medical_notes(clinic_id, patient_id, doctor_id, status, note_data)
    values ('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', auth.uid(), 'draft', '{"content":"Assistant"}');
    raise exception 'Assistant created a clinical note';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
insert into public.medical_notes(clinic_id, patient_id, doctor_id, status, note_data)
values ('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', auth.uid(), 'draft', '{"content":"Nota válida del owner"}');
update public.medical_notes
set clinical_impression = 'Edición autorizada del owner'
where id = 'c4000000-0000-4000-8000-000000000001';

reset role;
rollback;
