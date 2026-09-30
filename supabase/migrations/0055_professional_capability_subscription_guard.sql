-- Guard new professional grants by the effective clinic subscription; preserve safe removals.

create or replace function public.set_clinic_member_professional_capability_for_current_user(
  p_clinic_id uuid,
  p_clinic_member_id uuid,
  p_is_professional boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.clinic_member_role;
  v_target public.clinic_members%rowtype;
  v_plan_id text;
  v_professional_count integer;
  v_unpublished_profile_count integer := 0;
begin
  if v_actor_id is null or p_is_professional is null then
    raise exception 'Professional capability is unavailable.' using errcode = '42501';
  end if;
  select role into v_actor_role from public.clinic_members
    where clinic_id = p_clinic_id and user_id = v_actor_id and status = 'active';
  if v_actor_role not in ('owner', 'admin') then
    raise exception 'Professional capability is unavailable.' using errcode = '42501';
  end if;
  select * into v_target from public.clinic_members
    where id = p_clinic_member_id and clinic_id = p_clinic_id and status = 'active' for update;
  if not found then raise exception 'Clinic member is unavailable.' using errcode = '22023'; end if;
  if v_target.user_id = v_actor_id then
    raise exception 'A member cannot change their own professional capability.' using errcode = '42501';
  end if;
  if v_target.role = 'doctor' and not p_is_professional then
    raise exception 'Doctors must remain professional.' using errcode = '22023';
  end if;
  if v_target.role = 'assistant' and p_is_professional then
    raise exception 'Assistants cannot become professionals.' using errcode = '22023';
  end if;
  -- Serialize capability removal with appointment creation and rescheduling for
  -- this clinic/professional pair. Both paths use this same advisory lock.
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text || ':' || v_target.user_id::text, 0));
  if not p_is_professional and v_target.is_professional and exists (
    select 1
    from public.appointments appointment
    where appointment.clinic_id = p_clinic_id
      and appointment.doctor_id = v_target.user_id
      and appointment.starts_at > now()
      and appointment.status in ('scheduled', 'confirmed', 'waiting')
  ) then
    raise exception 'professional_has_future_appointments' using errcode = 'P0001';
  end if;
  if p_is_professional and not v_target.is_professional then
    if not public.clinic_has_write_entitlement(p_clinic_id) then
      raise exception 'Professional capability is unavailable.' using errcode = '42501';
    end if;
    select plan_id into v_plan_id from public.clinic_subscriptions where clinic_id = p_clinic_id;
    if v_plan_id is null then
      raise exception 'Professional capability is unavailable.' using errcode = '42501';
    end if;
    select count(*)::integer into v_professional_count from public.clinic_members
      where clinic_id = p_clinic_id and status = 'active' and is_professional;
    if v_plan_id = 'basic' and v_professional_count >= 1 then raise exception 'Doctor limit reached for the current plan.' using errcode = '42501'; end if;
    if v_plan_id = 'plus' and v_professional_count >= 5 then raise exception 'Doctor limit reached for the current plan.' using errcode = '42501'; end if;
  end if;
  update public.clinic_members set is_professional = p_is_professional where id = v_target.id;
  if not p_is_professional and v_target.is_professional then
    update public.doctor_public_profiles
      set is_published = false
      where clinic_id = p_clinic_id
        and (clinic_member_id = v_target.id or profile_id = v_target.user_id)
        and is_published;
    get diagnostics v_unpublished_profile_count = row_count;
  end if;
  insert into public.audit_logs(clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      p_clinic_id,
      v_actor_id,
      'clinic_member',
      v_target.id,
      'professional_capability_changed',
      jsonb_build_object(
        'enabled', p_is_professional,
        'public_profiles_unpublished', v_unpublished_profile_count
      )
    );
  return true;
end;
$$;
revoke all on function public.set_clinic_member_professional_capability_for_current_user(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_clinic_member_professional_capability_for_current_user(uuid, uuid, boolean) to authenticated;
