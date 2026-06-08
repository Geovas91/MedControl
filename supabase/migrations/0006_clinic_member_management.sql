-- Clinic member management helpers for dashboard team administration.
-- These functions keep RLS narrow while allowing owners/admins to list and add existing MedControl users.

create or replace function public.list_clinic_members_for_current_user(target_clinic_id uuid)
returns table (
  id uuid,
  clinic_id uuid,
  user_id uuid,
  full_name text,
  email text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required to inspect clinic members.';
  end if;

  if not public.is_clinic_member(target_clinic_id) and not public.is_platform_admin() then
    raise exception 'You do not have access to this clinic.';
  end if;

  return query
    select
      clinic_members.id,
      clinic_members.clinic_id,
      clinic_members.user_id,
      profiles.full_name,
      profiles.email,
      clinic_members.role::text,
      clinic_members.status::text,
      clinic_members.created_at
    from public.clinic_members
    left join public.profiles on profiles.id = clinic_members.user_id
    where clinic_members.clinic_id = target_clinic_id
    order by clinic_members.created_at asc;
end;
$$;

create or replace function public.add_clinic_member_by_email_for_current_user(
  target_clinic_id uuid,
  member_email text,
  member_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(nullif(trim(member_email), ''));
  normalized_role text := lower(nullif(trim(member_role), ''));
  target_user_id uuid;
  existing_membership_id uuid;
  existing_membership_role text;
  current_plan_id text;
  active_doctor_count integer;
  new_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to add clinic members.';
  end if;

  if not public.has_clinic_role(target_clinic_id, array['owner', 'admin']) then
    raise exception 'Only clinic owners and admins can add members.';
  end if;

  if normalized_role not in ('doctor', 'admin', 'assistant') then
    raise exception 'Unsupported clinic role.';
  end if;

  if normalized_email is null then
    raise exception 'Email is required.';
  end if;

  select profiles.id
    into target_user_id
  from public.profiles
  where lower(profiles.email) = normalized_email
  limit 1;

  if target_user_id is null then
    raise exception 'No existe un usuario de MedControl con ese correo. Pídele que cree su cuenta antes de agregarlo.';
  end if;

  select clinic_members.id, clinic_members.role::text
    into existing_membership_id, existing_membership_role
  from public.clinic_members
  where clinic_members.clinic_id = target_clinic_id
    and clinic_members.user_id = target_user_id
  limit 1;

  if normalized_role = 'doctor' and coalesce(existing_membership_role, '') <> 'doctor' then
    current_plan_id := coalesce(
      (
        select clinic_subscriptions.plan_id
        from public.clinic_subscriptions
        where clinic_subscriptions.clinic_id = target_clinic_id
        limit 1
      ),
      'basic'
    );

    active_doctor_count := public.count_clinic_doctors_for_current_user(target_clinic_id);

    if current_plan_id = 'basic' and active_doctor_count >= 1 then
      raise exception 'Tu plan MedControl Básico permite 1 médico. Para agregar más médicos, cambia a MedControl Plus.';
    end if;

    if current_plan_id = 'plus' and active_doctor_count >= 5 then
      raise exception 'Tu plan MedControl Plus permite hasta 5 médicos por clínica. Para agregar más médicos, cambia a MedControl Pro.';
    end if;
  end if;

  insert into public.clinic_members (clinic_id, user_id, role, status)
  values (target_clinic_id, target_user_id, normalized_role::public.clinic_member_role, 'active')
  on conflict (clinic_id, user_id) do update
    set role = excluded.role,
        status = 'active'
  returning id into new_membership_id;

  return new_membership_id;
end;
$$;

comment on function public.list_clinic_members_for_current_user(uuid) is
  'Lists members for a clinic visible to the authenticated user without exposing unrelated clinics.';
comment on function public.add_clinic_member_by_email_for_current_user(uuid, text, text) is
  'Adds an existing MedControl user to a clinic and enforces doctor limits for Basic and Plus plans.';
