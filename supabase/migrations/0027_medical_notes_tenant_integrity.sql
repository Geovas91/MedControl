-- Keep the existing medical_notes model while enforcing tenant/patient integrity
-- and the application permission model at the database boundary.

do $$
begin
  if exists (
    select 1
    from public.medical_notes as note
    left join public.patients as patient on patient.id = note.patient_id
    where patient.id is null
      or patient.clinic_id <> note.clinic_id
  ) then
    raise exception 'medical_notes contains cross-tenant patient relationships';
  end if;
end;
$$;

alter table public.medical_notes
  add constraint medical_notes_clinic_patient_fk
  foreign key (clinic_id, patient_id)
  references public.patients(clinic_id, id)
  on delete cascade;

-- These ordered indexes replace the original single-column clinic/patient
-- indexes and support the stable pagination used by both global and patient
-- note histories. The status index is separate because status is optional.
drop index public.medical_notes_clinic_id_idx;
drop index public.medical_notes_patient_id_idx;

create index medical_notes_clinic_created_id_idx
  on public.medical_notes(clinic_id, created_at desc, id desc);

create index medical_notes_clinic_status_created_id_idx
  on public.medical_notes(clinic_id, status, created_at desc, id desc);

create index medical_notes_patient_created_id_idx
  on public.medical_notes(patient_id, created_at desc, id desc);

-- RLS defines which rows may be read or written, but it does not protect
-- TRUNCATE. Remove broad historical defaults and expose only the operations
-- required by the existing create, edit and finalize flows.
revoke all on table public.medical_notes from public, anon, authenticated;
grant select, insert, update on table public.medical_notes to authenticated;

-- Every existing application flow attributes a new note to the authenticated
-- actor. Keep that invariant in RLS so the table grant cannot be used to forge
-- another author; tenant, role and write entitlement checks remain unchanged.
drop policy if exists "Doctors and admins can insert medical notes" on public.medical_notes;
create policy "Doctors and admins can insert medical notes" on public.medical_notes
for insert with check (
  doctor_id = auth.uid()
  and public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin'])
  and public.clinic_has_write_entitlement(clinic_id)
);

create or replace function public.protect_clinical_note_finalization()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'finalized' then
      raise exception 'Finalized clinical notes cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'finalized' then
    raise exception 'Finalized clinical notes cannot be modified';
  end if;

  if old.status <> 'draft' then
    raise exception 'Clinical note status cannot be modified';
  end if;

  if new.id is distinct from old.id
    or new.clinic_id is distinct from old.clinic_id
    or new.patient_id is distinct from old.patient_id
    or new.doctor_id is distinct from old.doctor_id
    or new.appointment_id is distinct from old.appointment_id
    or new.template_id is distinct from old.template_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Clinical note identity and relationships cannot be modified';
  end if;

  if new.status = 'finalized' then
    if auth.uid() is null
      or new.specialty is distinct from old.specialty
      or new.clinical_impression is distinct from old.clinical_impression
      or new.diagnosis is distinct from old.diagnosis
      or new.icd10_code is distinct from old.icd10_code
      or new.note_data is distinct from old.note_data
      or new.finalized_at is distinct from old.finalized_at
      or new.finalized_by is distinct from old.finalized_by then
      raise exception 'Invalid clinical note finalization';
    end if;

    new.finalized_at = now();
    new.finalized_by = auth.uid();
    new.updated_at = now();
    return new;
  end if;

  if new.status <> 'draft'
    or new.finalized_at is distinct from old.finalized_at
    or new.finalized_by is distinct from old.finalized_by then
    raise exception 'Invalid clinical note update';
  end if;

  if auth.uid() is not null
    and old.doctor_id is distinct from auth.uid()
    and not public.has_clinic_role(old.clinic_id, array['owner', 'admin']) then
    raise exception 'Only the author or a clinic owner/admin can edit a clinical note draft';
  end if;

  return new;
end;
$$;

comment on constraint medical_notes_clinic_patient_fk on public.medical_notes is
  'Prevents a medical note from referencing a patient outside the note tenant.';

comment on function public.protect_clinical_note_finalization() is
  'Keeps note identity and relationships immutable, limits draft content edits to the author or owner/admin, and preserves atomic immutable finalization.';
