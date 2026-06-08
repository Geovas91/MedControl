-- Plan limit helpers for authenticated clinic members.
-- Counts clinical doctor seats without exposing membership rows across clinics.

create or replace function public.count_clinic_doctors_for_current_user(target_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required to inspect clinic plan limits.';
  end if;

  if not public.is_clinic_member(target_clinic_id) and not public.is_platform_admin() then
    raise exception 'You do not have access to this clinic.';
  end if;

  return (
    select count(*)::integer
    from public.clinic_members
    where clinic_members.clinic_id = target_clinic_id
      and clinic_members.status = 'active'
      and clinic_members.role in ('owner', 'doctor')
  );
end;
$$;

comment on function public.count_clinic_doctors_for_current_user(uuid) is
  'Counts active owner/doctor clinic members for plan-limit checks. Owners are counted as doctors for independent physician clinics.';
