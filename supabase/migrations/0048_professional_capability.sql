-- B4.4: make professional capability explicit and independent from clinic role.
-- Existing owner and doctor memberships retain their established scheduling access;
-- new owner/admin memberships are non-professional until explicitly configured.

alter table public.clinic_members
  add column is_professional boolean not null default false;

update public.clinic_members
set is_professional = true
where role in ('owner', 'doctor');

create or replace function public.enforce_clinic_member_professional_capability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'doctor' then
    new.is_professional := true;
  elsif new.role = 'assistant' then
    new.is_professional := false;
  elsif tg_op = 'update'
    and new.is_professional
    and not old.is_professional
    and new.user_id = auth.uid() then
    raise exception 'A member cannot grant themselves professional capability.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clinic_members_enforce_professional_capability
before insert or update of role, is_professional on public.clinic_members
for each row execute function public.enforce_clinic_member_professional_capability();

alter table public.clinic_members
  add constraint clinic_members_professional_role_check
  check ((role <> 'doctor' or is_professional) and (role <> 'assistant' or not is_professional)) not valid;
alter table public.clinic_members
  validate constraint clinic_members_professional_role_check;

create index clinic_members_professional_lookup_idx
  on public.clinic_members (clinic_id, id)
  where status = 'active' and is_professional;

create or replace function public.has_clinic_professional_capability(p_clinic_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.clinic_members member
    where member.clinic_id = p_clinic_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.is_professional
  );
$$;
revoke all on function public.has_clinic_professional_capability(uuid) from public, anon;
grant execute on function public.has_clinic_professional_capability(uuid) to authenticated;

create or replace function public.count_clinic_doctors_for_current_user(target_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required to inspect clinic plan limits.'; end if;
  if not public.is_clinic_member(target_clinic_id) and not public.is_platform_admin() then raise exception 'You do not have access to this clinic.'; end if;
  return (
    select count(*)::integer from public.clinic_members member
    where member.clinic_id = target_clinic_id and member.status = 'active' and member.is_professional
  );
end;
$$;

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
    select plan_id into v_plan_id from public.clinic_subscriptions where clinic_id = p_clinic_id;
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

-- The member list is a protected projection. Recreate it to expose the explicit
-- capability only to a member of the same clinic or platform administration.
drop function public.list_clinic_members_for_current_user(uuid);
create function public.list_clinic_members_for_current_user(target_clinic_id uuid)
returns table (
  id uuid, clinic_id uuid, user_id uuid, full_name text, email text,
  role text, status text, is_professional boolean, created_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp stable
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required to inspect clinic members.'; end if;
  if not public.is_clinic_member(target_clinic_id) and not public.is_platform_admin() then raise exception 'You do not have access to this clinic.'; end if;
  return query select member.id, member.clinic_id, member.user_id, profile.full_name, profile.email,
    member.role::text, member.status::text, member.is_professional, member.created_at
  from public.clinic_members member
  left join public.profiles profile on profile.id = member.user_id
  where member.clinic_id = target_clinic_id order by member.created_at asc;
end;
$$;
revoke all on function public.list_clinic_members_for_current_user(uuid) from public, anon;
grant execute on function public.list_clinic_members_for_current_user(uuid) to authenticated;

create or replace function public.validate_professional_availability_rule()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.clinic_members member
    where member.id = new.clinic_member_id and member.clinic_id = new.clinic_id
      and member.status = 'active' and member.is_professional
  ) then raise exception 'Professional is unavailable for this clinic.' using errcode = '22023'; end if;
  return new;
end;
$$;

create or replace function public.save_professional_availability_for_current_user(
  p_clinic_id uuid, p_clinic_member_id uuid, p_effective_from date, p_intervals jsonb
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare caller_id uuid := auth.uid(); item record;
begin
  if caller_id is null or p_effective_from is null or jsonb_typeof(p_intervals) <> 'array' then raise exception 'invalid availability input' using errcode = '22023'; end if;
  if jsonb_array_length(p_intervals) > 42 then raise exception 'too many availability intervals' using errcode = '22023'; end if;
  if not exists (select 1 from public.clinic_members m where m.id = p_clinic_member_id and m.clinic_id = p_clinic_id and m.status = 'active' and m.is_professional) then raise exception 'invalid professional' using errcode = '42501'; end if;
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
end;
$$;

-- Professional capability replaces role-derived eligibility in scheduling functions.


create or replace function public.get_professional_availability_for_date(
  p_clinic_id uuid,
  p_clinic_member_id uuid,
  p_local_date date
)
returns table (start_time time without time zone, end_time time without time zone)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_local_date is null then
    raise exception 'A local date is required.' using errcode = '22023';
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
      and member.is_professional
  ) then
    raise exception 'Professional is unavailable for this clinic.' using errcode = '22023';
  end if;

  return query
  select rule.start_time, rule.end_time
  from public.professional_availability_rules rule
  where rule.clinic_id = p_clinic_id
    and rule.clinic_member_id = p_clinic_member_id
    and rule.weekday = extract(isodow from p_local_date)::smallint
    and rule.is_active
    and rule.effective_from <= p_local_date
    and (rule.effective_until is null or rule.effective_until >= p_local_date)
  order by rule.start_time, rule.id;
end;
$$;


create or replace function public.get_professional_available_slots(
  p_clinic_id uuid, p_clinic_member_id uuid, p_local_date date,
  p_duration_minutes integer, p_slot_interval_minutes integer,
  p_buffer_before_minutes integer default 0, p_buffer_after_minutes integer default 0
) returns table(start_at timestamptz, end_at timestamptz, local_start text, local_end text)
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare v_timezone text; v_doctor_id uuid; v_day_start timestamptz; v_day_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_local_date is null or p_duration_minutes not between 1 and 120 or p_slot_interval_minutes not between 1 and 120 or p_buffer_before_minutes not between 0 and 120 or p_buffer_after_minutes not between 0 and 120 then raise exception 'Slot input is invalid.' using errcode = '22023'; end if;
  if not public.has_clinic_role(p_clinic_id, array['owner','admin','doctor','assistant']) then raise exception 'Availability is unavailable.' using errcode = '42501'; end if;
  select clinic.timezone, member.user_id into v_timezone, v_doctor_id from public.clinics clinic join public.clinic_members member on member.clinic_id=clinic.id where clinic.id=p_clinic_id and member.id=p_clinic_member_id and member.status='active' and member.is_professional;
  if v_timezone is null then raise exception 'Professional is unavailable for this clinic.' using errcode = '22023'; end if;
  v_day_start := p_local_date::timestamp at time zone v_timezone; v_day_end := (p_local_date + 1)::timestamp at time zone v_timezone;
  return query
  with working as (
    select (p_local_date::timestamp + rule.start_time) at time zone v_timezone as starts_at, (p_local_date::timestamp + rule.end_time) at time zone v_timezone as ends_at
    from public.professional_availability_rules rule where rule.clinic_id=p_clinic_id and rule.clinic_member_id=p_clinic_member_id and rule.weekday=extract(isodow from p_local_date)::smallint and rule.is_active and rule.effective_from<=p_local_date and (rule.effective_until is null or rule.effective_until>=p_local_date)
    union all
    select greatest(exception.start_at,v_day_start), least(exception.end_at,v_day_end) from public.professional_availability_exceptions exception where exception.clinic_id=p_clinic_id and exception.clinic_member_id=p_clinic_member_id and exception.exception_type='available' and exception.is_active and exception.start_at<v_day_end and exception.end_at>v_day_start
  ), candidates as (
    select distinct candidate as slot_start, candidate + make_interval(mins => p_duration_minutes) as slot_end from working work_window cross join lateral generate_series(work_window.starts_at, work_window.ends_at-make_interval(mins=>p_duration_minutes), make_interval(mins=>p_slot_interval_minutes)) candidate where work_window.ends_at>work_window.starts_at
  ), blockers as (
    select exception.start_at, exception.end_at from public.professional_availability_exceptions exception where exception.clinic_id=p_clinic_id and exception.clinic_member_id=p_clinic_member_id and exception.exception_type='unavailable' and exception.is_active and exception.start_at<v_day_end and exception.end_at>v_day_start
    union all
    select appointment.starts_at-make_interval(mins=>p_buffer_before_minutes), appointment.ends_at+make_interval(mins=>p_buffer_after_minutes) from public.appointments appointment where appointment.clinic_id=p_clinic_id and appointment.doctor_id=v_doctor_id and appointment.status<>'cancelled' and appointment.starts_at<v_day_end and appointment.ends_at>v_day_start
  ) select candidate.slot_start, candidate.slot_end, to_char(candidate.slot_start at time zone v_timezone,'HH24:MI'), to_char(candidate.slot_end at time zone v_timezone,'HH24:MI') from candidates candidate where not exists(select 1 from blockers blocker where blocker.start_at<candidate.slot_end and blocker.end_at>candidate.slot_start) order by candidate.slot_start;
end; $$;


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
  if not exists (select 1 from public.clinic_members m where m.id=p_clinic_member_id and m.clinic_id=p_clinic_id and m.status='active' and m.is_professional) then raise exception 'Professional is unavailable.' using errcode='22023'; end if;
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


create or replace function public.is_professional_interval_available_internal(
  p_clinic_id uuid,
  p_doctor_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_excluding_appointment_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_timezone text;
  v_member_id uuid;
  v_local_date date;
  v_local_end_date date;
  v_has_rules boolean;
  v_in_window boolean;
begin
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then return false; end if;
  select clinic.timezone, member.id into v_timezone, v_member_id
  from public.clinics clinic
  join public.clinic_members member on member.clinic_id = clinic.id
  where clinic.id = p_clinic_id and member.user_id = p_doctor_id
    and member.status = 'active' and member.is_professional;
  if not found then return false; end if;
  v_local_date := (p_starts_at at time zone v_timezone)::date;
  v_local_end_date := ((p_ends_at - interval '1 microsecond') at time zone v_timezone)::date;
  if v_local_date <> v_local_end_date then return false; end if;

  select exists(
    select 1 from public.professional_availability_rules rule
    where rule.clinic_id = p_clinic_id and rule.clinic_member_id = v_member_id
      and rule.is_active and rule.effective_from <= v_local_date
      and (rule.effective_until is null or rule.effective_until >= v_local_date)
  ) into v_has_rules;

  -- Availability is opt-in for legacy clinics. Once a rule is effective, exact intervals are enforced.
  if not v_has_rules then
    return not exists (
      select 1 from public.professional_availability_exceptions exception
      where exception.clinic_id = p_clinic_id and exception.clinic_member_id = v_member_id
        and exception.is_active and exception.exception_type = 'unavailable'
        and exception.start_at < p_ends_at and exception.end_at > p_starts_at
    ) and not exists (
      select 1 from public.appointments appointment
      where appointment.clinic_id = p_clinic_id and appointment.doctor_id = p_doctor_id
        and appointment.id is distinct from p_excluding_appointment_id
        and appointment.status <> 'cancelled'
        and appointment.starts_at < p_ends_at and appointment.ends_at > p_starts_at
    );
  end if;

  select exists(
    select 1 from (
      select (v_local_date + rule.start_time) at time zone v_timezone as start_at,
             (v_local_date + rule.end_time) at time zone v_timezone as end_at
      from public.professional_availability_rules rule
      where rule.clinic_id = p_clinic_id and rule.clinic_member_id = v_member_id
        and rule.weekday = extract(isodow from v_local_date)::smallint
        and rule.is_active and rule.effective_from <= v_local_date
        and (rule.effective_until is null or rule.effective_until >= v_local_date)
      union all
      select exception.start_at, exception.end_at
      from public.professional_availability_exceptions exception
      where exception.clinic_id = p_clinic_id and exception.clinic_member_id = v_member_id
        and exception.is_active and exception.exception_type = 'available'
        and exception.start_at <= p_starts_at and exception.end_at >= p_ends_at
    ) availability_window
    where availability_window.start_at <= p_starts_at and availability_window.end_at >= p_ends_at
  ) into v_in_window;

  return v_in_window
    and not exists (
      select 1 from public.professional_availability_exceptions exception
      where exception.clinic_id = p_clinic_id and exception.clinic_member_id = v_member_id
        and exception.is_active and exception.exception_type = 'unavailable'
        and exception.start_at < p_ends_at and exception.end_at > p_starts_at
    )
    and not exists (
      select 1 from public.appointments appointment
      where appointment.clinic_id = p_clinic_id and appointment.doctor_id = p_doctor_id
        and appointment.id is distinct from p_excluding_appointment_id
        and appointment.status <> 'cancelled'
        and appointment.starts_at < p_ends_at and appointment.ends_at > p_starts_at
    );
end;
$$;


create or replace function public.create_appointment_for_current_user(
  p_clinic_id uuid, p_patient_id uuid, p_doctor_id uuid, p_title text,
  p_appointment_type text, p_location text, p_meeting_url text,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns table(appointment_id uuid, appointment_updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor_id uuid := auth.uid(); v_appointment public.appointments%rowtype; v_role public.clinic_member_role;
begin
  if v_actor_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select member.role into v_role from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=v_actor_id and member.status='active';
  if v_role is null or v_role not in ('owner','doctor','admin','assistant') or not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Appointment creation is not allowed.' using errcode='42501'; end if;
  if p_patient_id is null or not exists(select 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id) then raise exception 'Patient is unavailable.' using errcode='22023'; end if;
  if p_doctor_id is null then raise exception 'Doctor is unavailable.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text || ':' || p_doctor_id::text, 0));
  if not exists(select 1 from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=p_doctor_id and member.status='active' and member.is_professional) then raise exception 'Doctor is unavailable.' using errcode='22023'; end if;
  if nullif(btrim(p_title),'') is null or char_length(btrim(p_title))>120 or char_length(coalesce(p_appointment_type,''))>80 or char_length(coalesce(p_location,''))>200 or char_length(coalesce(p_meeting_url,''))>500 or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Appointment input is invalid.' using errcode='22023'; end if;
  if exists(select 1 from public.appointments appointment where appointment.clinic_id=p_clinic_id and appointment.doctor_id=p_doctor_id and appointment.status<>'cancelled' and appointment.starts_at<p_ends_at and appointment.ends_at>p_starts_at) then raise exception 'Appointment time conflict.' using errcode='23P01'; end if;
  if not public.is_professional_interval_available_internal(p_clinic_id,p_doctor_id,p_starts_at,p_ends_at,null) then raise exception 'Appointment time is unavailable.' using errcode='23P01'; end if;
  insert into public.appointments(clinic_id,patient_id,doctor_id,title,appointment_type,location,meeting_url,starts_at,ends_at,status)
  values(p_clinic_id,p_patient_id,p_doctor_id,btrim(p_title),nullif(btrim(p_appointment_type),''),nullif(btrim(p_location),''),nullif(btrim(p_meeting_url,''),''),p_starts_at,p_ends_at,'scheduled') returning * into v_appointment;
  insert into public.appointment_events(clinic_id,appointment_id,event_type,actor_user_id,actor_role,new_status,new_starts_at,new_ends_at)
  values(p_clinic_id,v_appointment.id,'created',v_actor_id,v_role,'scheduled',v_appointment.starts_at,v_appointment.ends_at);
  appointment_id:=v_appointment.id; appointment_updated_at:=v_appointment.updated_at; return next;
end;
$$;


create or replace function public.mutate_appointment_lifecycle_for_current_user(
  p_clinic_id uuid, p_appointment_id uuid, p_operation text,
  p_expected_status public.appointment_status default null,
  p_new_starts_at timestamptz default null, p_new_ends_at timestamptz default null
)
returns table(appointment_id uuid, status public.appointment_status, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz, changed boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid:=auth.uid(); v_role public.clinic_member_role; v_appointment public.appointments%rowtype; v_old_status public.appointment_status; v_old_starts_at timestamptz; v_old_ends_at timestamptz;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select member.role into v_role from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=v_actor and member.status='active';
  if v_role is null or v_role not in ('owner','admin','doctor','assistant') then raise exception 'Appointment lifecycle is not allowed.' using errcode='42501'; end if;
  select * into v_appointment from public.appointments where id=p_appointment_id and clinic_id=p_clinic_id for update;
  if not found then raise exception 'Appointment is unavailable.' using errcode='22023'; end if;
  if v_role='doctor' and v_appointment.doctor_id is distinct from v_actor then raise exception 'Appointment lifecycle is not allowed.' using errcode='42501'; end if;
  if p_expected_status is not null and v_appointment.status <> p_expected_status and not ((p_operation='confirm' and v_appointment.status='confirmed') or (p_operation='cancel' and v_appointment.status='cancelled')) then raise exception 'Appointment state is stale.' using errcode='40001'; end if;
  v_old_status:=v_appointment.status;
  if p_operation='confirm' then
    if v_appointment.status='confirmed' then appointment_id:=v_appointment.id; status:=v_appointment.status; starts_at:=v_appointment.starts_at; ends_at:=v_appointment.ends_at; updated_at:=v_appointment.updated_at; changed:=false; return next; return; end if;
    if v_appointment.status<>'scheduled' or (v_appointment.starts_at at time zone (select timezone from public.clinics where id=p_clinic_id))::date < (now() at time zone (select timezone from public.clinics where id=p_clinic_id))::date then raise exception 'Appointment cannot be confirmed.' using errcode='22023'; end if;
    update public.appointments set status='confirmed' where id=v_appointment.id returning * into v_appointment;
    insert into public.appointment_events(clinic_id,appointment_id,event_type,actor_user_id,actor_role,old_status,new_status) values(p_clinic_id,v_appointment.id,'confirmed',v_actor,v_role,v_old_status,v_appointment.status);
  elsif p_operation='cancel' then
    if v_appointment.status='cancelled' then appointment_id:=v_appointment.id; status:=v_appointment.status; starts_at:=v_appointment.starts_at; ends_at:=v_appointment.ends_at; updated_at:=v_appointment.updated_at; changed:=false; return next; return; end if;
    if v_appointment.status not in ('scheduled','confirmed','waiting') then raise exception 'Appointment cannot be cancelled.' using errcode='22023'; end if;
    update public.appointments set status='cancelled' where id=v_appointment.id returning * into v_appointment;
    insert into public.appointment_events(clinic_id,appointment_id,event_type,actor_user_id,actor_role,old_status,new_status) values(p_clinic_id,v_appointment.id,'cancelled',v_actor,v_role,v_old_status,v_appointment.status);
  elsif p_operation='reschedule' then
    if v_appointment.status not in ('scheduled','confirmed') or p_new_starts_at is null or p_new_ends_at is null or p_new_ends_at<=p_new_starts_at then raise exception 'Appointment cannot be rescheduled.' using errcode='22023'; end if;
    if v_appointment.starts_at=p_new_starts_at and v_appointment.ends_at=p_new_ends_at then appointment_id:=v_appointment.id; status:=v_appointment.status; starts_at:=v_appointment.starts_at; ends_at:=v_appointment.ends_at; updated_at:=v_appointment.updated_at; changed:=false; return next; return; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text || ':' || v_appointment.doctor_id::text, 0));
    if not public.is_professional_interval_available_internal(p_clinic_id,v_appointment.doctor_id,p_new_starts_at,p_new_ends_at,v_appointment.id) then raise exception 'Appointment time is unavailable.' using errcode='23P01'; end if;
    v_old_starts_at:=v_appointment.starts_at; v_old_ends_at:=v_appointment.ends_at;
    update public.appointments set starts_at=p_new_starts_at,ends_at=p_new_ends_at where id=v_appointment.id returning * into v_appointment;
    insert into public.appointment_events(clinic_id,appointment_id,event_type,actor_user_id,actor_role,old_status,new_status,old_starts_at,old_ends_at,new_starts_at,new_ends_at) values(p_clinic_id,v_appointment.id,'rescheduled',v_actor,v_role,v_old_status,v_appointment.status,v_old_starts_at,v_old_ends_at,p_new_starts_at,p_new_ends_at);
  else raise exception 'Invalid appointment lifecycle operation.' using errcode='22023'; end if;
  appointment_id:=v_appointment.id; status:=v_appointment.status; starts_at:=v_appointment.starts_at; ends_at:=v_appointment.ends_at; updated_at:=v_appointment.updated_at; changed:=true; return next;
end;
$$;


create or replace function public.get_professional_availability_week(
  p_clinic_id uuid, p_clinic_member_id uuid, p_effective_date date
)
returns table (weekday smallint, start_time time without time zone, end_time time without time zone)
language plpgsql security definer set search_path = public, pg_temp stable
as $$
declare v_actor_role public.clinic_member_role;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_effective_date is null then raise exception 'An effective date is required.' using errcode = '22023'; end if;
  select role into v_actor_role from public.clinic_members where clinic_id=p_clinic_id and user_id=auth.uid() and status='active';
  if v_actor_role is null then raise exception 'Availability is unavailable.' using errcode='42501'; end if;
  if v_actor_role='doctor' and not exists (select 1 from public.clinic_members member where member.id=p_clinic_member_id and member.clinic_id=p_clinic_id and member.user_id=auth.uid() and member.status='active' and member.role='doctor') then raise exception 'Availability is unavailable.' using errcode='42501'; end if;
  if not exists (select 1 from public.clinic_members member where member.id=p_clinic_member_id and member.clinic_id=p_clinic_id and member.status='active' and member.is_professional) then raise exception 'Professional is unavailable for this clinic.' using errcode='22023'; end if;
  return query select rule.weekday,rule.start_time,rule.end_time from public.professional_availability_rules rule where rule.clinic_id=p_clinic_id and rule.clinic_member_id=p_clinic_member_id and rule.is_active and rule.effective_from<=p_effective_date and (rule.effective_until is null or rule.effective_until>=p_effective_date) order by rule.weekday,rule.start_time,rule.id;
end;
$$;


comment on column public.clinic_members.is_professional is
  'Canonical clinic-scoped capability for exercising as a medical professional. It is independent from owner/admin roles; doctor is always true and assistant is always false.';
comment on function public.set_clinic_member_professional_capability_for_current_user(uuid, uuid, boolean) is
  'Allows an owner or admin to configure another active clinic member capability with plan limits and audit evidence; self-promotion is denied.';


-- Clinical record access is professional capability, not administrative role.
drop policy if exists "Clinical roles can read medical note templates" on public.medical_note_templates;
drop policy if exists "Clinical roles can read clinic or system templates" on public.medical_note_templates;
drop policy if exists "Owners and admins can insert clinic templates" on public.medical_note_templates;
drop policy if exists "Owners and admins can update clinic templates" on public.medical_note_templates;
create policy "Professional members can read clinic or system templates" on public.medical_note_templates for select using (
  (is_system_template and auth.uid() is not null and exists (select 1 from public.clinic_members member where member.user_id = auth.uid() and member.status = 'active' and member.is_professional))
  or public.has_clinic_professional_capability(clinic_id)
);
create policy "Professional members can insert clinic templates" on public.medical_note_templates for insert with check (
  is_system_template = false and clinic_id is not null and system_key is null and created_by = auth.uid()
  and public.has_clinic_professional_capability(clinic_id) and public.clinic_has_write_entitlement(clinic_id)
);
create policy "Professional members can update clinic templates" on public.medical_note_templates for update using (
  is_system_template = false and public.has_clinic_professional_capability(clinic_id)
) with check (
  is_system_template = false and clinic_id is not null and system_key is null
  and public.has_clinic_professional_capability(clinic_id) and public.clinic_has_write_entitlement(clinic_id)
);

drop policy if exists "Clinical roles can read medical notes" on public.medical_notes;
drop policy if exists "Doctors and admins can insert medical notes" on public.medical_notes;
drop policy if exists "Doctors and admins can update medical notes" on public.medical_notes;
create policy "Professional members can read medical notes" on public.medical_notes for select using (public.has_clinic_professional_capability(clinic_id));
create policy "Professional members can insert medical notes" on public.medical_notes for insert with check (
  doctor_id = auth.uid() and public.has_clinic_professional_capability(clinic_id) and public.clinic_has_write_entitlement(clinic_id)
);
create policy "Professional members can update medical notes" on public.medical_notes for update using (
  public.has_clinic_professional_capability(clinic_id)
) with check (public.has_clinic_professional_capability(clinic_id) and public.clinic_has_write_entitlement(clinic_id));

drop policy if exists "Clinical roles can read consents" on public.consents;
create policy "Professional members can read consents" on public.consents for select using (public.has_clinic_professional_capability(clinic_id));
drop policy if exists "Clinical roles can read consent signatures" on public.consent_signatures;
create policy "Professional members can read consent signatures" on public.consent_signatures for select using (
  exists (select 1 from public.consents consent where consent.id = consent_signatures.consent_id and consent.clinic_id = consent_signatures.clinic_id and consent.patient_id = consent_signatures.patient_id and public.has_clinic_professional_capability(consent.clinic_id))
);

drop policy if exists "Clinical roles can read signed consent snapshots" on public.consent_signed_snapshots;
drop policy if exists "Clinical roles can read consent documents" on public.consent_documents;
create policy "Professional members can read signed consent snapshots" on public.consent_signed_snapshots for select using (public.has_clinic_professional_capability(clinic_id));
create policy "Professional members can read consent documents" on public.consent_documents for select using (public.has_clinic_professional_capability(clinic_id));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'clinical_records','initial_clinical_histories','clinical_history_identification','clinical_alerts',
    'family_medical_histories','pathological_histories','non_pathological_histories',
    'initial_clinical_assessments','vital_sign_measurements'
  ] loop
    execute format('drop policy if exists "Clinical roles can read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Clinical roles can insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Clinical roles can update %1$s" on public.%1$I', table_name);
    execute format('create policy "Professional members can read %1$s" on public.%1$I for select using (public.has_clinic_professional_capability(clinic_id))', table_name);
    execute format('create policy "Professional members can insert %1$s" on public.%1$I for insert with check (public.has_clinic_professional_capability(clinic_id) and public.clinic_has_write_entitlement(clinic_id))', table_name);
    execute format('create policy "Professional members can update %1$s" on public.%1$I for update using (public.has_clinic_professional_capability(clinic_id)) with check (public.has_clinic_professional_capability(clinic_id) and public.clinic_has_write_entitlement(clinic_id))', table_name);
  end loop;
end;
$$;
drop policy if exists "Clinical roles can read clinical change events" on public.clinical_change_events;
create policy "Professional members can read clinical change events" on public.clinical_change_events for select using (public.has_clinic_professional_capability(clinic_id));

-- Capability-gated clinical RPCs preserve their existing tenant, lifecycle and audit contracts.


create or replace function public.create_patient_with_record(
  p_clinic_id uuid,
  p_first_names text,
  p_paternal_surname text,
  p_maternal_surname text default null,
  p_date_of_birth date default null,
  p_sex text default null,
  p_gender_identity text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_marital_status text default null,
  p_occupation text default null,
  p_education_level text default null,
  p_status public.patient_status default 'active',
  p_emergency_contact_name text default null,
  p_emergency_contact_relationship text default null,
  p_emergency_contact_phone text default null,
  p_primary_doctor_id uuid default null
)
returns table(patient_id uuid, clinical_record_id uuid, initial_history_id uuid, internal_identifier text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid(); v_patient uuid := gen_random_uuid(); v_record uuid; v_history uuid;
  v_first text := regexp_replace(trim(coalesce(p_first_names, '')), '\s+', ' ', 'g');
  v_paternal text := regexp_replace(trim(coalesce(p_paternal_surname, '')), '\s+', ' ', 'g');
  v_maternal text := nullif(regexp_replace(trim(coalesce(p_maternal_surname, '')), '\s+', ' ', 'g'), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_identifier text;
begin
  if v_actor is null then raise exception 'Debes iniciar sesión.' using errcode = '42501'; end if;
  if not public.has_clinic_role(p_clinic_id, array['owner','admin','doctor','assistant']) then
    raise exception 'No tienes una membresía activa en la clínica.' using errcode = '42501';
  end if;
  if not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'La clínica no tiene permisos de escritura disponibles.' using errcode = '42501';
  end if;
  if v_first = '' or v_paternal = '' then raise exception 'Nombres y primer apellido son obligatorios.' using errcode = '22023'; end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date or p_date_of_birth < current_date - interval '120 years') then
    raise exception 'La fecha de nacimiento no es válida.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;
  if p_primary_doctor_id is not null and not exists (
    select 1 from public.clinic_members cm where cm.clinic_id = p_clinic_id and cm.user_id = p_primary_doctor_id
      and cm.status = 'active' and cm.is_professional
  ) then raise exception 'El profesional responsable no pertenece a la clínica.' using errcode = '22023'; end if;
  if exists (
    select 1 from public.patients p where p.clinic_id = p_clinic_id and p.archived_at is null
      and lower(p.first_names) = lower(v_first) and lower(coalesce(p.paternal_surname,'')) = lower(v_paternal)
      and lower(coalesce(p.maternal_surname,'')) = lower(coalesce(v_maternal,''))
      and p.date_of_birth is not distinct from p_date_of_birth
      and ((v_email is not null and lower(p.email) = v_email) or (v_phone is not null and regexp_replace(coalesce(p.phone,''), '[^0-9+]', '', 'g') = v_phone))
  ) then raise exception 'Ya existe un paciente con el mismo nombre, fecha de nacimiento y contacto.' using errcode = '23505'; end if;
  v_identifier := 'PAC-' || upper(substr(md5(v_patient::text), 1, 10));
  insert into public.patients(id, clinic_id, primary_doctor_id, full_name, first_names, paternal_surname, maternal_surname,
    date_of_birth, sex, gender_identity, phone, email, address, marital_status, occupation, education_level,
    internal_identifier, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    status, created_by, updated_by)
  values (v_patient, p_clinic_id, p_primary_doctor_id, concat_ws(' ', v_first, v_paternal, v_maternal), v_first, v_paternal, v_maternal,
    p_date_of_birth, nullif(p_sex,''), nullif(trim(p_gender_identity),''), v_phone, v_email, nullif(trim(p_address),''),
    nullif(trim(p_marital_status),''), nullif(trim(p_occupation),''), nullif(trim(p_education_level),''),
    v_identifier, nullif(trim(p_emergency_contact_name),''), nullif(trim(p_emergency_contact_relationship),''),
    nullif(regexp_replace(coalesce(p_emergency_contact_phone,''), '[^0-9+]', '', 'g'),''), p_status, v_actor, v_actor);
  insert into public.clinical_records(clinic_id, patient_id, created_by) values (p_clinic_id, v_patient, v_actor) returning id into v_record;
  insert into public.initial_clinical_histories(clinic_id, clinical_record_id, patient_id, created_by)
    values (p_clinic_id, v_record, v_patient, v_actor) returning id into v_history;
  insert into public.clinical_history_identification(clinic_id, history_id, responsible_professional_id, created_by)
    values (p_clinic_id, v_history, p_primary_doctor_id, v_actor);
  insert into public.family_medical_histories(clinic_id, history_id, created_by) values (p_clinic_id, v_history, v_actor);
  insert into public.pathological_histories(clinic_id, history_id, created_by) values (p_clinic_id, v_history, v_actor);
  insert into public.non_pathological_histories(clinic_id, history_id, created_by) values (p_clinic_id, v_history, v_actor);
  insert into public.initial_clinical_assessments(clinic_id, history_id, created_by) values (p_clinic_id, v_history, v_actor);
  insert into public.audit_logs(clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (p_clinic_id, v_actor, 'patient', v_patient, 'patient_and_record_created', jsonb_build_object('clinical_record_id', v_record, 'initial_history_id', v_history));
  return query select v_patient, v_record, v_history, v_identifier;
end;
$$;


create or replace function public.save_initial_clinical_history(
  p_clinic_id uuid, p_patient_id uuid, p_status public.clinical_history_status,
  p_information_provider_name text default null, p_information_provider_relationship text default null,
  p_information_reliability public.information_reliability default 'unknown', p_responsible_professional_id uuid default null,
  p_blood_type text default null, p_allergies text[] default '{}', p_active_conditions text[] default '{}', p_current_medications text[] default '{}',
  p_family_diabetes boolean default null, p_family_hypertension boolean default null, p_family_cardiovascular boolean default null,
  p_family_cancer boolean default null, p_family_neurological boolean default null, p_family_psychiatric boolean default null,
  p_family_hereditary boolean default null, p_family_details text default null,
  p_chronic_diseases text default null, p_surgeries text default null, p_hospitalizations text default null, p_injuries text default null,
  p_transfusions text default null, p_relevant_infections text default null, p_disability text default null, p_mental_health_history text default null, p_pathological_other text default null,
  p_diet text default null, p_physical_activity text default null, p_tobacco_use text default null, p_alcohol_use text default null, p_substance_use text default null,
  p_sleep text default null, p_hygiene text default null, p_housing text default null, p_vaccination text default null, p_non_pathological_other text default null,
  p_chief_complaint text default null, p_present_illness text default null, p_clinical_observations text default null,
  p_initial_impression text default null, p_initial_plan text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_record uuid; v_history uuid; v_value text;
begin
  if v_actor is null or not public.has_clinic_professional_capability(p_clinic_id) then
    raise exception 'No tienes permiso para modificar la historia clínica.' using errcode = '42501';
  end if;
  if not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'La clínica no tiene permisos de escritura disponibles.' using errcode = '42501'; end if;
  select r.id, h.id into v_record, v_history
  from public.clinical_records r join public.initial_clinical_histories h on h.clinic_id = r.clinic_id and h.clinical_record_id = r.id
  where r.clinic_id = p_clinic_id and r.patient_id = p_patient_id and r.status = 'active' and r.archived_at is null and h.archived_at is null
  for update of h;
  if v_history is null then raise exception 'El expediente clínico no está disponible.' using errcode = 'P0002'; end if;
  if p_responsible_professional_id is not null and not exists (
    select 1 from public.clinic_members cm where cm.clinic_id = p_clinic_id and cm.user_id = p_responsible_professional_id
      and cm.status = 'active' and cm.is_professional
  ) then raise exception 'El profesional responsable no pertenece a la clínica.' using errcode = '22023'; end if;

  update public.initial_clinical_histories set status = p_status,
    completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else null end
  where id = v_history and clinic_id = p_clinic_id;
  update public.clinical_history_identification set information_provider_name = nullif(trim(p_information_provider_name),''),
    information_provider_relationship = nullif(trim(p_information_provider_relationship),''), information_reliability = p_information_reliability,
    blood_type = nullif(trim(p_blood_type),''),
    responsible_professional_id = p_responsible_professional_id
  where history_id = v_history and clinic_id = p_clinic_id;
  update public.family_medical_histories set diabetes=p_family_diabetes, hypertension=p_family_hypertension,
    cardiovascular_disease=p_family_cardiovascular, cancer=p_family_cancer, neurological_disease=p_family_neurological,
    psychiatric_disorders=p_family_psychiatric, hereditary_diseases=p_family_hereditary, details=nullif(trim(p_family_details),'')
  where history_id=v_history and clinic_id=p_clinic_id;
  update public.pathological_histories set chronic_diseases=nullif(trim(p_chronic_diseases),''), surgeries=nullif(trim(p_surgeries),''),
    hospitalizations=nullif(trim(p_hospitalizations),''), injuries=nullif(trim(p_injuries),''), transfusions=nullif(trim(p_transfusions),''),
    relevant_infections=nullif(trim(p_relevant_infections),''), disability=nullif(trim(p_disability),''),
    mental_health_history=nullif(trim(p_mental_health_history),''), other_history=nullif(trim(p_pathological_other),'')
  where history_id=v_history and clinic_id=p_clinic_id;
  update public.non_pathological_histories set diet=nullif(trim(p_diet),''), physical_activity=nullif(trim(p_physical_activity),''),
    tobacco_use=nullif(trim(p_tobacco_use),''), alcohol_use=nullif(trim(p_alcohol_use),''), substance_use=nullif(trim(p_substance_use),''),
    sleep=nullif(trim(p_sleep),''), hygiene=nullif(trim(p_hygiene),''), housing=nullif(trim(p_housing),''),
    vaccination=nullif(trim(p_vaccination),''), other_history=nullif(trim(p_non_pathological_other),'')
  where history_id=v_history and clinic_id=p_clinic_id;
  update public.initial_clinical_assessments set chief_complaint=nullif(trim(p_chief_complaint),''), present_illness=nullif(trim(p_present_illness),''),
    clinical_observations=nullif(trim(p_clinical_observations),''), initial_impression=nullif(trim(p_initial_impression),''), initial_plan=nullif(trim(p_initial_plan),'')
  where history_id=v_history and clinic_id=p_clinic_id;

  update public.clinical_alerts set archived_at=now(), is_active=false
  where clinic_id=p_clinic_id and clinical_record_id=v_record and archived_at is null and alert_type in ('allergy','active_condition','current_medication');
  foreach v_value in array coalesce(p_allergies,'{}') loop if nullif(trim(v_value),'') is not null then
    insert into public.clinical_alerts(clinic_id,clinical_record_id,patient_id,alert_type,name,recorded_by,created_by)
    values(p_clinic_id,v_record,p_patient_id,'allergy',trim(v_value),v_actor,v_actor); end if; end loop;
  foreach v_value in array coalesce(p_active_conditions,'{}') loop if nullif(trim(v_value),'') is not null then
    insert into public.clinical_alerts(clinic_id,clinical_record_id,patient_id,alert_type,name,recorded_by,created_by)
    values(p_clinic_id,v_record,p_patient_id,'active_condition',trim(v_value),v_actor,v_actor); end if; end loop;
  foreach v_value in array coalesce(p_current_medications,'{}') loop if nullif(trim(v_value),'') is not null then
    insert into public.clinical_alerts(clinic_id,clinical_record_id,patient_id,alert_type,name,recorded_by,created_by)
    values(p_clinic_id,v_record,p_patient_id,'current_medication',trim(v_value),v_actor,v_actor); end if; end loop;
  return v_history;
end;
$$;


create or replace function public.create_consent_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_type text,
  p_consent_version text,
  p_consent_text text,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_record_id uuid;
  v_consent_id uuid;
  v_type text := trim(coalesce(p_consent_type, ''));
  v_version text := trim(coalesce(p_consent_version, ''));
  v_text text := trim(coalesce(p_consent_text, ''));
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.has_clinic_professional_capability(p_clinic_id)
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Not allowed to create consents.' using errcode = '42501';
  end if;
  if char_length(v_type) not between 1 and 160
    or char_length(v_version) not between 1 and 80
    or char_length(v_text) not between 1 and 12000 then
    raise exception 'Invalid consent content.' using errcode = '22023';
  end if;
  if p_template_id is not null and not exists (
    select 1
    from public.medical_note_templates as template
    where template.id = p_template_id
      and template.template_kind = 'consent'
      and template.is_active
      and (template.is_system_template or template.clinic_id = p_clinic_id)
  ) then
    raise exception 'Consent template is unavailable.' using errcode = '22023';
  end if;

  select record.id
    into strict v_record_id
  from public.patients as patient
  join public.clinical_records as record
    on record.clinic_id = patient.clinic_id
   and record.patient_id = patient.id
   and record.status = 'active'
   and record.archived_at is null
  where patient.clinic_id = p_clinic_id
    and patient.id = p_patient_id
    and patient.archived_at is null;

  insert into public.consents (
    clinic_id, patient_id, clinical_record_id, created_by, updated_by,
    consent_type, consent_version, consent_text, template_id, signing_token, status
  ) values (
    p_clinic_id, p_patient_id, v_record_id, v_actor, v_actor,
    v_type, v_version, v_text, p_template_id, null, 'pending'
  )
  returning id into v_consent_id;

  insert into public.audit_logs (
    clinic_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    p_clinic_id, v_actor, 'consent', v_consent_id, 'consent_created',
    jsonb_build_object('phase', 'digital_consent_v1_phase_1')
  );

  return v_consent_id;
exception
  when no_data_found then
    raise exception 'Patient or active clinical record is unavailable.' using errcode = '22023';
  when too_many_rows then
    raise exception 'Patient has more than one active clinical record.' using errcode = '23514';
end;
$$;


create or replace function public.issue_consent_signing_link_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
    or not public.has_clinic_professional_capability(p_clinic_id)
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Not allowed to issue consent signing links.' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '8 days' then
    raise exception 'Invalid consent signing link parameters.' using errcode = '22023';
  end if;

  update public.consents as consent
  set signing_token_hash = p_token_hash,
      signing_token_expires_at = p_expires_at,
      signing_token_used_at = null,
      signing_token_revoked_at = null,
      updated_by = v_actor
  where consent.id = p_consent_id
    and consent.clinic_id = p_clinic_id
    and consent.patient_id = p_patient_id
    and consent.status = 'pending';

  return found;
end;
$$;


create or replace function public.revoke_consent_signing_link_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
    or not public.has_clinic_professional_capability(p_clinic_id) then
    raise exception 'Not allowed to revoke consent signing links.' using errcode = '42501';
  end if;

  update public.consents as consent
  set signing_token_hash = null,
      signing_token_expires_at = null,
      signing_token_revoked_at = coalesce(consent.signing_token_revoked_at, now()),
      updated_by = v_actor
  where consent.id = p_consent_id
    and consent.clinic_id = p_clinic_id
    and consent.patient_id = p_patient_id
    and consent.status = 'pending';

  return found;
end;
$$;


create or replace function public.cancel_consent_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_consent public.consents%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor is null
    or not public.has_clinic_professional_capability(p_clinic_id) then
    raise exception 'Not allowed to cancel consents.' using errcode = '42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Cancellation reason is too long.' using errcode = '22023';
  end if;

  select consent.* into v_consent
  from public.consents as consent
  where consent.id = p_consent_id
    and consent.clinic_id = p_clinic_id
    and consent.patient_id = p_patient_id
  for update;

  if not found then
    return 'unavailable';
  end if;
  if v_consent.status = 'cancelled' then
    return 'already_cancelled';
  end if;
  if v_consent.status <> 'pending' then
    return 'invalid_state';
  end if;

  update public.consents
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = v_reason,
      revoked_at = coalesce(revoked_at, now()),
      signing_token_hash = null,
      signing_token_expires_at = null,
      signing_token_revoked_at = coalesce(signing_token_revoked_at, now()),
      updated_by = v_actor
  where id = v_consent.id;

  insert into public.audit_logs (
    clinic_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_consent.clinic_id, v_actor, 'consent', v_consent.id, 'consent_cancelled',
    jsonb_build_object('reason_provided', v_reason is not null)
  );

  return 'cancelled';
end;
$$;


create or replace function public.get_signed_consent_evidence_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid
)
returns table (
  snapshot_id uuid,
  document_id uuid,
  clinic_name text,
  clinic_timezone text,
  patient_display_name text,
  consent_type text,
  consent_version text,
  consent_text text,
  issued_at timestamptz,
  signer_full_name text,
  accepted_privacy_notice boolean,
  accepted_sensitive_data_processing boolean,
  signed_at timestamptz,
  snapshot_source public.consent_snapshot_source,
  signature_data text,
  document_status public.consent_document_status,
  renderer_version text,
  generated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or not public.has_clinic_professional_capability(p_clinic_id) then
    raise exception 'Not allowed to read signed consent evidence.' using errcode = '42501';
  end if;

  return query
  select snapshot.id, document.id, snapshot.clinic_name, snapshot.clinic_timezone,
    snapshot.patient_display_name, snapshot.consent_type, snapshot.consent_version,
    snapshot.consent_text, snapshot.issued_at, snapshot.signer_full_name,
    snapshot.accepted_privacy_notice,
    snapshot.accepted_sensitive_data_processing, snapshot.signed_at,
    snapshot.snapshot_source, signature.signature_data,
    document.status, document.renderer_version, document.generated_at
  from public.consent_signed_snapshots as snapshot
  join public.consent_signatures as signature
    on signature.clinic_id = snapshot.clinic_id
   and signature.id = snapshot.signature_id
   and signature.patient_id = snapshot.patient_id
   and signature.consent_id = snapshot.consent_id
  join public.consent_documents as document
    on document.clinic_id = snapshot.clinic_id
   and document.patient_id = snapshot.patient_id
   and document.consent_id = snapshot.consent_id
   and document.snapshot_id = snapshot.id
  where snapshot.clinic_id = p_clinic_id
    and snapshot.patient_id = p_patient_id
    and snapshot.consent_id = p_consent_id;
end;
$$;


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

