-- Final client authorization boundaries. Historical migrations 0001-0059 are immutable.
-- Raw clinical snapshots are server-internal; clients use the scoped, safe timeline RPC.
revoke select on table public.clinical_change_events from public, anon, authenticated;
drop policy if exists "Professional members can read clinical change events" on public.clinical_change_events;

-- Authenticated writes must cross canonical RPC authorization, not direct table APIs.
revoke insert, update, delete on table public.appointments from public, anon, authenticated;
revoke insert, update, delete on table public.professional_availability_rules,
  public.professional_availability_exceptions from public, anon, authenticated;

alter table public.appointment_events drop constraint appointment_events_event_type_check;
alter table public.appointment_events add constraint appointment_events_event_type_check
  check (event_type in ('created','confirmed','cancelled','rescheduled','waiting','completed','restored','metadata_updated'));

create function public.update_appointment_metadata_for_current_user(
  p_clinic_id uuid, p_appointment_id uuid, p_title text,
  p_appointment_type text, p_location text, p_expected_updated_at timestamptz
) returns table(appointment_id uuid, patient_id uuid, updated_at timestamptz, changed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid:=auth.uid(); v_role public.clinic_member_role; v_appointment public.appointments%rowtype;
  v_title text:=btrim(p_title); v_type text:=nullif(btrim(p_appointment_type),''); v_location text:=nullif(btrim(p_location),'');
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_appointment from public.appointments a where a.id=p_appointment_id and a.clinic_id=p_clinic_id for update;
  select m.role into v_role from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.status='active';
  if v_role is null or v_role not in ('owner','admin','doctor')
    or (v_role='doctor' and v_appointment.doctor_id is distinct from v_actor)
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Appointment edit is not allowed.' using errcode='42501';
  end if;
  if v_appointment.id is null then raise exception 'Appointment is unavailable.' using errcode='P0002'; end if;
  if v_title is null or char_length(v_title) not between 1 and 120 or char_length(coalesce(v_type,''))>80
    or char_length(coalesce(v_location,''))>200 then raise exception 'Invalid appointment metadata.' using errcode='22023'; end if;
  if p_expected_updated_at is null or v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'Appointment state is stale.' using errcode='40001';
  end if;
  if v_appointment.title is not distinct from v_title and v_appointment.appointment_type is not distinct from v_type
    and v_appointment.location is not distinct from v_location then
    return query select v_appointment.id,v_appointment.patient_id,v_appointment.updated_at,false; return;
  end if;
  -- No scheduling fields or meeting URL are accepted: the existing edit form does not edit URL.
  update public.appointments a set title=v_title,appointment_type=v_type,location=v_location
    where a.id=v_appointment.id returning a.* into v_appointment;
  insert into public.appointment_events(clinic_id,appointment_id,event_type,actor_user_id,actor_role,old_status,new_status)
    values(p_clinic_id,v_appointment.id,'metadata_updated',v_actor,v_role,v_appointment.status,v_appointment.status);
  return query select v_appointment.id,v_appointment.patient_id,v_appointment.updated_at,true;
end; $$;
revoke all on function public.update_appointment_metadata_for_current_user(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.update_appointment_metadata_for_current_user(uuid,uuid,text,text,text,timestamptz) to authenticated;

create or replace function public.mutate_appointment_lifecycle_for_current_user(
  p_clinic_id uuid, p_appointment_id uuid, p_operation text,
  p_expected_status public.appointment_status default null,
  p_new_starts_at timestamptz default null, p_new_ends_at timestamptz default null
) returns table(appointment_id uuid,status public.appointment_status,starts_at timestamptz,ends_at timestamptz,updated_at timestamptz,changed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid:=auth.uid(); v_role public.clinic_member_role; v_appointment public.appointments%rowtype;
  v_doctor uuid; v_old_status public.appointment_status; v_old_start timestamptz; v_old_end timestamptz;
  v_target public.appointment_status; v_event text; v_timezone text; v_local_date date; v_today date;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_operation is null or p_operation not in ('confirm','cancel','reschedule','waiting','completed','restore') then
    raise exception 'Invalid appointment lifecycle operation.' using errcode='22023'; end if;
  select m.role into v_role from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.status='active';
  if v_role is null or v_role not in ('owner','admin','doctor','assistant')
    or (v_role='assistant' and p_operation in ('waiting','completed','restore'))
    or (v_role='doctor' and p_operation='restore') then
    raise exception 'Appointment lifecycle is not allowed.' using errcode='42501'; end if;
  select a.doctor_id into v_doctor from public.appointments a where a.id=p_appointment_id and a.clinic_id=p_clinic_id;
  if not found then raise exception 'Appointment is unavailable.' using errcode='22023'; end if;
  if v_role='doctor' and v_doctor is distinct from v_actor then raise exception 'Appointment lifecycle is not allowed.' using errcode='42501'; end if;
  -- Match create/capability lock order: professional pair BEFORE appointment row.
  if v_doctor is not null then perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text||':'||v_doctor::text,0)); end if;
  select * into v_appointment from public.appointments a where a.id=p_appointment_id and a.clinic_id=p_clinic_id for update;
  if not found then raise exception 'Appointment is unavailable.' using errcode='22023'; end if;
  if v_appointment.doctor_id is distinct from v_doctor then raise exception 'Appointment state is stale.' using errcode='40001'; end if;
  -- Recheck actor after waiting. Cancel remains the explicitly approved safe reduction.
  select m.role into v_role from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.status='active';
  if v_role is null or v_role not in ('owner','admin','doctor','assistant')
    or (v_role='doctor' and (v_appointment.doctor_id is distinct from v_actor or p_operation='restore'))
    or (v_role='assistant' and p_operation in ('waiting','completed','restore')) then
    raise exception 'Appointment lifecycle is not allowed.' using errcode='42501'; end if;
  if p_operation<>'cancel' and not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Appointment subscription is not writable.' using errcode='42501'; end if;
  if p_expected_status is not null and v_appointment.status<>p_expected_status
    and not ((p_operation='confirm' and v_appointment.status='confirmed') or (p_operation='cancel' and v_appointment.status='cancelled')) then
    raise exception 'Appointment state is stale.' using errcode='40001'; end if;
  v_old_status:=v_appointment.status; v_old_start:=v_appointment.starts_at; v_old_end:=v_appointment.ends_at;
  if (p_operation='confirm' and v_old_status='confirmed') or (p_operation='cancel' and v_old_status='cancelled') then
    return query select v_appointment.id,v_appointment.status,v_appointment.starts_at,v_appointment.ends_at,v_appointment.updated_at,false; return;
  end if;
  if v_old_status='completed' then raise exception 'appointment_terminal_state' using errcode='22023'; end if;
  select c.timezone into v_timezone from public.clinics c where c.id=p_clinic_id;
  v_local_date:=(v_appointment.starts_at at time zone v_timezone)::date; v_today:=(now() at time zone v_timezone)::date;
  if p_operation='reschedule' then
    if v_old_status not in ('scheduled','confirmed') or p_new_starts_at is null or p_new_ends_at is null or p_new_ends_at<=p_new_starts_at then
      raise exception 'Appointment cannot be rescheduled.' using errcode='22023'; end if;
    if v_old_start=p_new_starts_at and v_old_end=p_new_ends_at then
      return query select v_appointment.id,v_appointment.status,v_appointment.starts_at,v_appointment.ends_at,v_appointment.updated_at,false; return;
    end if;
    if not public.is_professional_interval_available_internal(p_clinic_id,v_doctor,p_new_starts_at,p_new_ends_at,v_appointment.id) then
      raise exception 'Appointment time is unavailable.' using errcode='23P01'; end if;
    update public.appointments a set starts_at=p_new_starts_at,ends_at=p_new_ends_at where a.id=v_appointment.id returning a.* into v_appointment;
    v_event:='rescheduled';
  else
    case p_operation
      when 'confirm' then
        if v_old_status<>'scheduled' then raise exception 'Appointment cannot be confirmed.' using errcode='22023'; end if;
        if v_local_date<v_today then raise exception 'appointment_too_early' using errcode='P0001'; end if;
        v_target:='confirmed'; v_event:='confirmed';
      when 'cancel' then
        if v_old_status not in ('scheduled','confirmed','waiting') then raise exception 'Appointment cannot be cancelled.' using errcode='22023'; end if;
        v_target:='cancelled'; v_event:='cancelled';
      when 'waiting' then
        if v_old_status not in ('scheduled','confirmed') then raise exception 'Appointment cannot enter waiting.' using errcode='22023'; end if;
        if v_local_date<>v_today then raise exception 'appointment_too_early' using errcode='P0001'; end if;
        v_target:='waiting'; v_event:='waiting';
      when 'completed' then
        if v_old_status not in ('scheduled','confirmed','waiting') then raise exception 'Appointment cannot be completed.' using errcode='22023'; end if;
        if v_appointment.starts_at>now() then raise exception 'appointment_too_early' using errcode='P0001'; end if;
        v_target:='completed'; v_event:='completed';
      when 'restore' then
        if v_old_status<>'cancelled' then raise exception 'Appointment cannot be restored.' using errcode='22023'; end if;
        if not public.is_professional_interval_available_internal(p_clinic_id,v_doctor,v_appointment.starts_at,v_appointment.ends_at,v_appointment.id) then
          raise exception 'Appointment time is unavailable.' using errcode='23P01'; end if;
        v_target:='scheduled'; v_event:='restored';
    end case;
    update public.appointments a set status=v_target where a.id=v_appointment.id returning a.* into v_appointment;
  end if;
  insert into public.appointment_events(clinic_id,appointment_id,event_type,actor_user_id,actor_role,old_status,new_status,
    old_starts_at,old_ends_at,new_starts_at,new_ends_at)
  values(p_clinic_id,v_appointment.id,v_event,v_actor,v_role,v_old_status,v_appointment.status,
    case when p_operation='reschedule' then v_old_start end,case when p_operation='reschedule' then v_old_end end,
    case when p_operation='reschedule' then v_appointment.starts_at end,case when p_operation='reschedule' then v_appointment.ends_at end);
  return query select v_appointment.id,v_appointment.status,v_appointment.starts_at,v_appointment.ends_at,v_appointment.updated_at,true;
end; $$;
revoke all on function public.mutate_appointment_lifecycle_for_current_user(uuid,uuid,text,public.appointment_status,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.mutate_appointment_lifecycle_for_current_user(uuid,uuid,text,public.appointment_status,timestamptz,timestamptz) to authenticated;

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
  if v_actor is null or not public.has_clinic_professional_capability(p_clinic_id)
    or not public.has_patient_professional_scope(p_clinic_id, p_patient_id) then
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
do $grants$ declare f regprocedure; begin
    for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname='save_initial_clinical_history' loop
      execute format('revoke all on function %s from public, anon, authenticated',f);
      execute format('grant execute on function %s to authenticated',f);
    end loop;
  end; $grants$;

create or replace function public.save_professional_availability_for_current_user(
  p_clinic_id uuid, p_clinic_member_id uuid, p_effective_from date, p_intervals jsonb
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare caller_id uuid := auth.uid(); item record;
begin
  if caller_id is null or p_effective_from is null or jsonb_typeof(p_intervals) <> 'array' then raise exception 'invalid availability input' using errcode = '22023'; end if;
  if jsonb_array_length(p_intervals) > 42 then raise exception 'too many availability intervals' using errcode = '22023'; end if;
  if not exists (select 1 from public.clinic_members m where m.id = p_clinic_member_id and m.clinic_id = p_clinic_id and m.status = 'active' and m.is_professional) then raise exception 'invalid professional' using errcode = '42501'; end if;
  if not exists (select 1 from public.clinic_members m where m.clinic_id = p_clinic_id and m.user_id = caller_id and m.status = 'active' and (m.role in ('owner','admin') or (m.role = 'doctor' and m.id = p_clinic_member_id))) then raise exception 'not authorized' using errcode = '42501'; end if;
  if not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Availability is not writable.' using errcode='42501'; end if;
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
do $grants$ declare f regprocedure; begin
    for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname='save_professional_availability_for_current_user' loop
      execute format('revoke all on function %s from public, anon, authenticated',f);
      execute format('grant execute on function %s to authenticated',f);
    end loop;
  end; $grants$;

create or replace function public.manage_professional_availability_exception(
  p_action text, p_exception_id uuid, p_clinic_id uuid, p_clinic_member_id uuid,
  p_exception_type text, p_start_date date, p_start_time text,
  p_end_date date, p_end_time text, p_all_day boolean, p_reason text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_timezone text; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  if not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Availability is not writable.' using errcode='42501'; end if;
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
do $grants$ declare f regprocedure; begin
    for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname='manage_professional_availability_exception' loop
      execute format('revoke all on function %s from public, anon, authenticated',f);
      execute format('grant execute on function %s to authenticated',f);
    end loop;
  end; $grants$;

create or replace function public.set_patient_professional_assignment_for_current_user(
  p_clinic_id uuid, p_patient_id uuid, p_clinic_member_id uuid, p_is_active boolean
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (select 1 from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=v_actor and member.status='active' and member.role in ('owner','admin')) then
    raise exception 'Patient assignment management is not allowed.' using errcode='42501';
  end if;
  if p_is_active is null or not exists (select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id)
    or not exists (select 1 from public.clinic_members m where m.id=p_clinic_member_id and m.clinic_id=p_clinic_id) then
    raise exception 'Patient assignment is unavailable.' using errcode='42501';
  end if;
  if p_is_active then
    if not exists (select 1 from public.clinic_members m where m.id=p_clinic_member_id and m.clinic_id=p_clinic_id and m.status='active' and m.is_professional) then
      raise exception 'Professional is unavailable.' using errcode='23514';
    end if;
    if not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Patient assignment is not writable.' using errcode='42501'; end if;
    insert into public.patient_professional_assignments(clinic_id,patient_id,clinic_member_id,assigned_by,source)
    values(p_clinic_id,p_patient_id,p_clinic_member_id,v_actor,'manual')
    on conflict (clinic_id,patient_id,clinic_member_id) where is_active do update set assigned_by=excluded.assigned_by;
  else
    update public.patient_professional_assignments set is_active=false, ended_at=now()
    where clinic_id=p_clinic_id and patient_id=p_patient_id and clinic_member_id=p_clinic_member_id and is_active;
  end if;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(p_clinic_id,v_actor,'patient_professional_assignment',p_patient_id,case when p_is_active then 'assigned' else 'ended' end,jsonb_build_object('professional_clinic_member_id',p_clinic_member_id));
  return true;
end;
$$;
do $grants$ declare f regprocedure; begin
    for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname='set_patient_professional_assignment_for_current_user' loop
      execute format('revoke all on function %s from public, anon, authenticated',f);
      execute format('grant execute on function %s to authenticated',f);
    end loop;
  end; $grants$;

create or replace function public.get_review_invitation_status_for_current_user(p_clinic_id uuid, p_appointment_id uuid)
returns table (invitation_id uuid, invitation_status text, expires_at timestamptz, email_sent_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.review_invitations%rowtype;
  v_role public.clinic_member_role;
begin
  if v_actor is null then return; end if;
  select invitation.* into v_invitation from public.review_invitations as invitation
  where invitation.appointment_id = p_appointment_id and invitation.clinic_id = p_clinic_id;
  if not found then return; end if;
  select role into v_role from public.clinic_members
  where clinic_id = v_invitation.clinic_id and user_id = v_actor and status = 'active';
  if v_role is null or v_role not in ('owner', 'admin', 'doctor')
    or (v_role = 'doctor' and v_invitation.doctor_user_id is distinct from v_actor) then return; end if;
  return query select v_invitation.id,
    case when v_invitation.used_at is not null then 'completed'
         when v_invitation.revoked_at is not null then 'revoked'
         when v_invitation.expires_at <= now() then 'expired'
         when v_invitation.delivery_status = 'sent' then 'sent'
         else 'pending' end,
    v_invitation.expires_at, v_invitation.email_sent_at;
end;
$$;
do $grants$ declare f regprocedure; begin
    for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname='get_review_invitation_status_for_current_user' loop
      execute format('revoke all on function %s from public, anon, authenticated',f);
      execute format('grant execute on function %s to authenticated',f);
    end loop;
  end; $grants$;
