-- Clinical-note finalization. This migration is intentionally not applied by the application.

alter table public.medical_notes
  add column if not exists finalized_by uuid references auth.users(id);

create index if not exists medical_notes_finalized_by_idx
  on public.medical_notes(finalized_by)
  where finalized_by is not null;

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

  if new.status = 'finalized' then
    if auth.uid() is null
      or new.id is distinct from old.id
      or new.clinic_id is distinct from old.clinic_id
      or new.patient_id is distinct from old.patient_id
      or new.doctor_id is distinct from old.doctor_id
      or new.appointment_id is distinct from old.appointment_id
      or new.template_id is distinct from old.template_id
      or new.specialty is distinct from old.specialty
      or new.clinical_impression is distinct from old.clinical_impression
      or new.diagnosis is distinct from old.diagnosis
      or new.icd10_code is distinct from old.icd10_code
      or new.note_data is distinct from old.note_data
      or new.finalized_at is distinct from old.finalized_at
      or new.finalized_by is distinct from old.finalized_by
      or new.created_at is distinct from old.created_at then
      raise exception 'Invalid clinical note finalization';
    end if;

    new.finalized_at = now();
    new.finalized_by = auth.uid();
    -- The generic medical_notes_set_updated_at trigger also runs BEFORE UPDATE.
    -- Both triggers assign now(), so the persisted timestamp is deterministic
    -- regardless of PostgreSQL trigger execution order and never client-supplied.
    new.updated_at = now();
    return new;
  end if;

  if new.status <> 'draft'
    or new.finalized_at is distinct from old.finalized_at
    or new.finalized_by is distinct from old.finalized_by then
    raise exception 'Invalid clinical note update';
  end if;

  return new;
end;
$$;

drop trigger if exists medical_notes_protect_finalization on public.medical_notes;
create trigger medical_notes_protect_finalization
before update or delete on public.medical_notes
for each row execute function public.protect_clinical_note_finalization();

comment on column public.medical_notes.finalized_by is
  'Authenticated user who atomically finalized the draft; separate from the note doctor.';
comment on function public.protect_clinical_note_finalization() is
  'Allows only draft edits and the atomic draft-to-finalized transition; finalized notes are immutable and finalization assigns audit timestamps itself.';

create or replace function public.get_clinic_member_display_name_for_current_user(
  p_clinic_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  member_name text;
begin
  if auth.uid() is null
    or not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor']) then
    return null;
  end if;

  select profile.full_name
    into member_name
  from public.clinic_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.clinic_id = p_clinic_id
    and member.user_id = p_user_id
  limit 1;

  return member_name;
end;
$$;

revoke all on function public.get_clinic_member_display_name_for_current_user(uuid, uuid) from public;
grant execute on function public.get_clinic_member_display_name_for_current_user(uuid, uuid) to authenticated;

comment on function public.get_clinic_member_display_name_for_current_user(uuid, uuid) is
  'Returns only full_name for a current or historical member of the caller-authorized clinic.';
