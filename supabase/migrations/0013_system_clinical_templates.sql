-- Global, read-only system templates. This migration is not applied by the app.

alter table public.medical_note_templates
  alter column clinic_id drop not null,
  add column if not exists system_key text;

create unique index if not exists medical_note_templates_system_key_unique_idx
  on public.medical_note_templates(system_key)
  where system_key is not null;

alter table public.medical_note_templates
  add constraint medical_note_templates_system_shape_check check (
    (is_system_template and clinic_id is null and created_by is null and system_key is not null)
    or (not is_system_template and clinic_id is not null and system_key is null)
  ) not valid;

drop policy if exists "Clinical roles can read medical note templates" on public.medical_note_templates;
drop policy if exists "Doctors and admins can manage medical note templates" on public.medical_note_templates;

create policy "Clinical roles can read clinic or system templates" on public.medical_note_templates for select
  using (
    is_system_template = true
    or public.has_clinic_role(clinic_id, array['owner', 'admin', 'doctor'])
  );

create policy "Clinical roles can insert clinic templates" on public.medical_note_templates for insert
  with check (
    is_system_template = false
    and clinic_id is not null
    and public.has_clinic_role(clinic_id, array['owner', 'admin', 'doctor'])
  );

create policy "Clinical roles can update clinic templates" on public.medical_note_templates for update
  using (
    is_system_template = false
    and public.has_clinic_role(clinic_id, array['owner', 'admin', 'doctor'])
  )
  with check (
    is_system_template = false
    and clinic_id is not null
    and public.has_clinic_role(clinic_id, array['owner', 'admin', 'doctor'])
  );

comment on column public.medical_note_templates.system_key is
  'Stable identifier for a global CliniControl system template; null for clinic-owned templates.';
