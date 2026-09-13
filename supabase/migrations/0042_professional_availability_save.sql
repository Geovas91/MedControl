create or replace function public.save_professional_availability_for_current_user(
  p_clinic_id uuid, p_clinic_member_id uuid, p_effective_from date, p_intervals jsonb
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare caller_id uuid := auth.uid(); item record;
begin
  if caller_id is null or p_effective_from is null or jsonb_typeof(p_intervals) <> 'array' then raise exception 'invalid availability input' using errcode = '22023'; end if;
  if jsonb_array_length(p_intervals) > 42 then raise exception 'too many availability intervals' using errcode = '22023'; end if;
  if not exists (select 1 from public.clinic_members m where m.id = p_clinic_member_id and m.clinic_id = p_clinic_id and m.status = 'active' and m.role in ('owner','doctor')) then raise exception 'invalid professional' using errcode = '42501'; end if;
  if not exists (select 1 from public.clinic_members m where m.clinic_id = p_clinic_id and m.user_id = caller_id and m.status = 'active' and (m.role in ('owner','admin') or (m.role = 'doctor' and m.id = p_clinic_member_id))) then raise exception 'not authorized' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('professional_availability:' || p_clinic_member_id::text, 0));
  for item in select x.weekday, x.start_time, x.end_time from jsonb_to_recordset(p_intervals) as x(weekday int, start_time text, end_time text) loop
    if item.weekday not between 1 and 7 or item.start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item.end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item.start_time >= item.end_time then raise exception 'invalid availability interval' using errcode = '22023'; end if;
  end loop;
  update public.professional_availability_rules set is_active = false where clinic_id = p_clinic_id and clinic_member_id = p_clinic_member_id and is_active and effective_from >= p_effective_from;
  update public.professional_availability_rules set effective_until = p_effective_from - 1 where clinic_id = p_clinic_id and clinic_member_id = p_clinic_member_id and is_active and effective_from < p_effective_from and (effective_until is null or effective_until >= p_effective_from);
  insert into public.professional_availability_rules (clinic_id, clinic_member_id, weekday, start_time, end_time, effective_from, is_active, created_by)
    select p_clinic_id, p_clinic_member_id, x.weekday, x.start_time::time, x.end_time::time, p_effective_from, true, caller_id from jsonb_to_recordset(p_intervals) as x(weekday int, start_time text, end_time text);
  return true;
end; $$;
revoke all on function public.save_professional_availability_for_current_user(uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.save_professional_availability_for_current_user(uuid, uuid, date, jsonb) to authenticated;
