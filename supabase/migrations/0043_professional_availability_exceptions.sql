-- Concrete, clinic-local availability exceptions and an informational slot engine.
create table public.professional_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  clinic_member_id uuid not null,
  exception_type text not null check (exception_type in ('available', 'unavailable')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_availability_exceptions_member_fkey foreign key (clinic_id, clinic_member_id)
    references public.clinic_members(clinic_id, id) on delete cascade,
  constraint professional_availability_exceptions_time_range_check check (start_at < end_at),
  constraint professional_availability_exceptions_reason_length check (char_length(coalesce(reason, '')) <= 300)
);
comment on table public.professional_availability_exceptions is 'Concrete timestamptz openings and closures. Unavailable intervals take precedence when slots are calculated.';
comment on column public.professional_availability_exceptions.clinic_member_id is 'Canonical clinic membership identity, not appointments.doctor_id.';
create index professional_availability_exceptions_lookup_idx on public.professional_availability_exceptions (clinic_id, clinic_member_id, start_at, end_at) where is_active;
create index appointments_slot_lookup_idx on public.appointments (clinic_id, doctor_id, starts_at, ends_at) where status <> 'cancelled';
create trigger professional_availability_exceptions_set_updated_at before update on public.professional_availability_exceptions for each row execute function public.set_updated_at();
create trigger professional_availability_exceptions_validate_professional before insert or update of clinic_id, clinic_member_id on public.professional_availability_exceptions for each row execute function public.validate_professional_availability_rule();
alter table public.professional_availability_exceptions enable row level security;
create policy "Clinic scheduling roles can read availability exceptions" on public.professional_availability_exceptions for select using (public.has_clinic_role(clinic_id, array['owner','admin','doctor','assistant']));
create policy "Scheduling managers can insert availability exceptions" on public.professional_availability_exceptions for insert with check (public.can_manage_professional_availability_rule(clinic_id, clinic_member_id));
create policy "Scheduling managers can update availability exceptions" on public.professional_availability_exceptions for update using (public.can_manage_professional_availability_rule(clinic_id, clinic_member_id)) with check (public.can_manage_professional_availability_rule(clinic_id, clinic_member_id));
create policy "Scheduling managers can delete availability exceptions" on public.professional_availability_exceptions for delete using (public.can_manage_professional_availability_rule(clinic_id, clinic_member_id));
revoke all on table public.professional_availability_exceptions from public, anon;
grant select, insert, update, delete on public.professional_availability_exceptions to authenticated;

create function public.get_professional_available_slots(
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
  select clinic.timezone, member.user_id into v_timezone, v_doctor_id from public.clinics clinic join public.clinic_members member on member.clinic_id=clinic.id where clinic.id=p_clinic_id and member.id=p_clinic_member_id and member.status='active' and member.role in ('owner','doctor');
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
revoke all on function public.get_professional_available_slots(uuid,uuid,date,integer,integer,integer,integer) from public, anon;
grant execute on function public.get_professional_available_slots(uuid,uuid,date,integer,integer,integer,integer) to authenticated;
comment on function public.get_professional_available_slots(uuid,uuid,date,integer,integer,integer,integer) is 'Informational slots only. Appointment creation remains authoritative and serialized by create_appointment_for_current_user.';
