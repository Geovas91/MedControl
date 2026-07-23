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

-- Older local seeds marked clinic-owned demo templates as system rows. They are
-- not global masters: preserve their identity and tenant ownership while
-- normalizing only that incompatible legacy shape before validating the rule.
update public.medical_note_templates as template
set is_system_template = false,
    system_key = null
where template.is_system_template = true
  and template.clinic_id is not null;

-- Do not rewrite any other clinic-owned rows. Fail the migration instead of
-- leaving an unvalidated invariant if pre-existing data still does not fit.
do $$
begin
  if exists (
    select 1
    from public.medical_note_templates as template
    where not (
      (template.is_system_template and template.clinic_id is null and template.created_by is null and template.system_key is not null)
      or (not template.is_system_template and template.clinic_id is not null and template.system_key is null)
    )
  ) then
    raise exception 'medical_note_templates contains rows incompatible with system template ownership; resolve them before applying migration 0013';
  end if;
end;
$$;

alter table public.medical_note_templates
  validate constraint medical_note_templates_system_shape_check;

drop policy if exists "Clinical roles can read medical note templates" on public.medical_note_templates;
drop policy if exists "Doctors and admins can manage medical note templates" on public.medical_note_templates;

create policy "Clinical roles can read clinic or system templates" on public.medical_note_templates for select
  using (
    (
      is_system_template = true
      and auth.uid() is not null
      and exists (
        select 1
        from public.clinic_members as member
        where member.user_id = auth.uid()
          and member.status = 'active'
          and member.role in ('owner', 'admin', 'doctor')
      )
    )
    or public.has_clinic_role(clinic_id, array['owner', 'admin', 'doctor'])
  );

create policy "Owners and admins can insert clinic templates" on public.medical_note_templates for insert
  with check (
    is_system_template = false
    and clinic_id is not null
    and system_key is null
    and created_by = auth.uid()
    and public.has_clinic_role(clinic_id, array['owner', 'admin'])
  );

create policy "Owners and admins can update clinic templates" on public.medical_note_templates for update
  using (
    is_system_template = false
    and public.has_clinic_role(clinic_id, array['owner', 'admin'])
  )
  with check (
    is_system_template = false
    and clinic_id is not null
    and system_key is null
    and public.has_clinic_role(clinic_id, array['owner', 'admin'])
  );

-- RLS also blocks anonymous reads, but remove the direct privilege as defense
-- in depth. Authenticated access remains governed by the policies above.
revoke select on table public.medical_note_templates from anon;

comment on column public.medical_note_templates.system_key is
  'Stable identifier for a global CliniControl system template; null for clinic-owned templates.';
