create or replace function public.manage_professional_availability_exception(
  p_action text, p_exception_id uuid, p_clinic_id uuid, p_clinic_member_id uuid,
  p_exception_type text, p_start_date date, p_start_time text,
  p_end_date date, p_end_time text, p_all_day boolean, p_reason text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_timezone text; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_action not in ('create','update','deactivate') then raise exception 'Invalid exception action.' using errcode='22023'; end if;
  if not public.has_clinic_role(p_clinic_id, array['owner','admin','doctor','assistant']) then raise exception 'Exception unavailable.' using errcode='42501'; end if;
  if not exists (select 1 from public.clinic_members m where m.id=p_clinic_member_id and m.clinic_id=p_clinic_id and m.status='active' and m.role in ('owner','doctor')) then raise exception 'Professional is unavailable.' using errcode='22023'; end if;
  if not exists (select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.status='active' and (m.role in ('owner','admin') or (m.role='doctor' and m.id=p_clinic_member_id))) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if p_action in ('update','deactivate') then
    select e.id into v_id from public.professional_availability_exceptions e where e.id=p_exception_id and e.clinic_id=p_clinic_id and e.clinic_member_id=p_clinic_member_id and e.is_active;
    if v_id is null then raise exception 'Exception unavailable.' using errcode='22023'; end if;
    if p_action='deactivate' then update public.professional_availability_exceptions set is_active=false where id=v_id; return v_id; end if;
  end if;
  if p_exception_type not in ('available','unavailable') or p_start_date is null or p_end_date is null or char_length(coalesce(p_reason,''))>300 then raise exception 'Invalid exception input.' using errcode='22023'; end if;
  select c.timezone into v_timezone from public.clinics c where c.id=p_clinic_id;
  if p_all_day then
    if p_end_date < p_start_date then raise exception 'Invalid exception range.' using errcode='22023'; end if;
    v_start := p_start_date::timestamp at time zone v_timezone;
    v_end := (p_end_date + 1)::timestamp at time zone v_timezone;
  else
    if p_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid exception time.' using errcode='22023'; end if;
    v_start := (p_start_date::text || ' ' || p_start_time)::timestamp at time zone v_timezone;
    v_end := (p_end_date::text || ' ' || p_end_time)::timestamp at time zone v_timezone;
    if v_end <= v_start then raise exception 'Invalid exception range.' using errcode='22023'; end if;
  end if;
  if v_end - v_start > interval '366 days' then raise exception 'Exception range is too long.' using errcode='22023'; end if;
  if p_action='create' then
    insert into public.professional_availability_exceptions(clinic_id,clinic_member_id,exception_type,start_at,end_at,reason,created_by) values(p_clinic_id,p_clinic_member_id,p_exception_type,v_start,v_end,nullif(btrim(p_reason),''),v_actor) returning id into v_id;
  else
    update public.professional_availability_exceptions set exception_type=p_exception_type,start_at=v_start,end_at=v_end,reason=nullif(btrim(p_reason),'') where id=v_id;
  end if;
  return v_id;
end; $$;
revoke all on function public.manage_professional_availability_exception(text,uuid,uuid,uuid,text,date,text,date,text,boolean,text) from public, anon;
grant execute on function public.manage_professional_availability_exception(text,uuid,uuid,uuid,text,date,text,date,text,boolean,text) to authenticated;
