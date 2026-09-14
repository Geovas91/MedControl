create or replace function public.get_professional_availability_week(
  p_clinic_id uuid,
  p_clinic_member_id uuid,
  p_effective_date date
)
returns table (weekday smallint, start_time time without time zone, end_time time without time zone)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_effective_date is null then
    raise exception 'An effective date is required.' using errcode = '22023';
  end if;
  if not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor', 'assistant']) then
    raise exception 'Availability is unavailable.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.clinic_members member
    where member.id = p_clinic_member_id
      and member.clinic_id = p_clinic_id
      and member.status = 'active'
      and member.role in ('owner', 'doctor')
  ) then
    raise exception 'Professional is unavailable for this clinic.' using errcode = '22023';
  end if;

  return query
  select rule.weekday, rule.start_time, rule.end_time
  from public.professional_availability_rules rule
  where rule.clinic_id = p_clinic_id
    and rule.clinic_member_id = p_clinic_member_id
    and rule.is_active
    and rule.effective_from <= p_effective_date
    and (rule.effective_until is null or rule.effective_until >= p_effective_date)
  order by rule.weekday, rule.start_time, rule.id;
end;
$$;

revoke all on function public.get_professional_availability_week(uuid, uuid, date) from public, anon;
grant execute on function public.get_professional_availability_week(uuid, uuid, date) to authenticated;

comment on function public.get_professional_availability_week(uuid, uuid, date) is
  'Returns all active recurring local working intervals effective on a clinic-local date, grouped by ISO weekday.';
