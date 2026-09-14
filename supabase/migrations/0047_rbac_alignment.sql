-- B4.3: align scheduling permissions without changing the clinic role schema.
-- Assistants may create and operate appointment lifecycle actions inside their own clinic.

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
  if p_doctor_id is null or not exists(select 1 from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=p_doctor_id and member.status='active' and member.role in ('owner','doctor')) then raise exception 'Doctor is unavailable.' using errcode='22023'; end if;
  if nullif(btrim(p_title),'') is null or char_length(btrim(p_title))>120 or char_length(coalesce(p_appointment_type,''))>80 or char_length(coalesce(p_location,''))>200 or char_length(coalesce(p_meeting_url,''))>500 or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Appointment input is invalid.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text || ':' || p_doctor_id::text, 0));
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
  if not exists (select 1 from public.clinic_members member where member.id=p_clinic_member_id and member.clinic_id=p_clinic_id and member.status='active' and member.role in ('owner','doctor')) then raise exception 'Professional is unavailable for this clinic.' using errcode='22023'; end if;
  return query select rule.weekday,rule.start_time,rule.end_time from public.professional_availability_rules rule where rule.clinic_id=p_clinic_id and rule.clinic_member_id=p_clinic_member_id and rule.is_active and rule.effective_from<=p_effective_date and (rule.effective_until is null or rule.effective_until>=p_effective_date) order by rule.weekday,rule.start_time,rule.id;
end;
$$;

comment on function public.mutate_appointment_lifecycle_for_current_user(uuid,uuid,text,public.appointment_status,timestamptz,timestamptz) is
  'Atomically confirms, cancels, or reschedules one tenant appointment. Owner/admin act clinic-wide, doctor acts only on own appointments, and assistant acts clinic-wide.';
