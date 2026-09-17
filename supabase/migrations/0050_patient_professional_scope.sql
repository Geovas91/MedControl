-- B5.3.1: separate administrative patient directory access from clinical care access.
-- A care relationship is always clinic-scoped and uses the canonical clinic_members.id.

create table public.patient_professional_assignments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null,
  clinic_member_id uuid not null,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  source text not null check (source in ('manual','appointment','migration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_professional_assignments_patient_tenant_fkey
    foreign key (clinic_id, patient_id) references public.patients(clinic_id, id) on delete restrict,
  constraint patient_professional_assignments_member_tenant_fkey
    foreign key (clinic_id, clinic_member_id) references public.clinic_members(clinic_id, id) on delete restrict,
  constraint patient_professional_assignments_lifecycle_check check (
    (is_active and ended_at is null) or (not is_active and ended_at is not null)
  )
);

create unique index patient_professional_assignments_active_unique
  on public.patient_professional_assignments(clinic_id, patient_id, clinic_member_id)
  where is_active;
create index patient_professional_assignments_scope_lookup_idx
  on public.patient_professional_assignments(clinic_member_id, clinic_id, patient_id)
  where is_active;

create or replace function public.enforce_patient_professional_assignment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.clinic_members member
    where member.id = new.clinic_member_id and member.clinic_id = new.clinic_id
      and member.status = 'active' and member.is_professional
  ) then
    raise exception 'Assigned member must be an active professional in the patient clinic.' using errcode = '23514';
  end if;
  if new.is_active then new.ended_at := null; elsif new.ended_at is null then new.ended_at := now(); end if;
  return new;
end;
$$;
create trigger patient_professional_assignments_enforce
before insert or update of clinic_id, clinic_member_id, is_active, ended_at
on public.patient_professional_assignments
for each row execute function public.enforce_patient_professional_assignment();
create trigger patient_professional_assignments_updated_at
before update on public.patient_professional_assignments
for each row execute function public.set_updated_at();

alter table public.patient_professional_assignments enable row level security;
revoke all on table public.patient_professional_assignments from public, anon, authenticated;
grant select on table public.patient_professional_assignments to authenticated;
create policy "Professionals can read own active patient scope"
  on public.patient_professional_assignments for select using (
    is_active and exists (
      select 1 from public.clinic_members member
      where member.id = patient_professional_assignments.clinic_member_id
        and member.user_id = auth.uid() and member.clinic_id = patient_professional_assignments.clinic_id
        and member.status = 'active' and member.is_professional
    )
  );

create or replace function public.has_patient_professional_scope(p_clinic_id uuid, p_patient_id uuid)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.clinic_members actor
    join public.patient_professional_assignments assignment
      on assignment.clinic_id = actor.clinic_id
     and assignment.clinic_member_id = actor.id
     and assignment.is_active
    where actor.clinic_id = p_clinic_id
      and actor.user_id = auth.uid()
      and actor.status = 'active'
      and actor.is_professional
      and assignment.patient_id = p_patient_id
  );
$$;
revoke all on function public.has_patient_professional_scope(uuid,uuid) from public, anon;
grant execute on function public.has_patient_professional_scope(uuid,uuid) to authenticated;

-- Directory access is operational. Doctors are limited to their care scope; other active
-- scheduling roles retain the clinic-wide administrative directory and never gain clinical access.
drop policy if exists "Active clinic members can read patients" on public.patients;
create policy "Active members can read permitted patient directory rows" on public.patients for select using (
  archived_at is null and exists (
    select 1 from public.clinic_members actor
    where actor.clinic_id = patients.clinic_id and actor.user_id = auth.uid() and actor.status = 'active'
      and (actor.role in ('owner','admin','assistant') or public.has_patient_professional_scope(patients.clinic_id, patients.id))
  )
);

-- Clinical rows require both professional capability and an active assignment.  Administrative
-- roles do not bypass this predicate, including when their member is also a professional.
drop policy if exists "Professional members can read medical notes" on public.medical_notes;
drop policy if exists "Professional members can insert medical notes" on public.medical_notes;
drop policy if exists "Professional members can update medical notes" on public.medical_notes;
create policy "Scoped professionals can read medical notes" on public.medical_notes for select using (public.has_patient_professional_scope(clinic_id, patient_id));
create policy "Scoped professionals can insert medical notes" on public.medical_notes for insert with check (doctor_id = auth.uid() and public.has_patient_professional_scope(clinic_id, patient_id) and public.clinic_has_write_entitlement(clinic_id));
create policy "Scoped professionals can update medical notes" on public.medical_notes for update using (public.has_patient_professional_scope(clinic_id, patient_id)) with check (public.has_patient_professional_scope(clinic_id, patient_id) and public.clinic_has_write_entitlement(clinic_id));
drop policy if exists "Professional members can read consents" on public.consents;
create policy "Scoped professionals can read consents" on public.consents for select using (public.has_patient_professional_scope(clinic_id, patient_id));
drop policy if exists "Professional members can read consent signatures" on public.consent_signatures;
create policy "Scoped professionals can read consent signatures" on public.consent_signatures for select using (public.has_patient_professional_scope(clinic_id, patient_id));
drop policy if exists "Professional members can read signed consent snapshots" on public.consent_signed_snapshots;
drop policy if exists "Professional members can read consent documents" on public.consent_documents;
create policy "Scoped professionals can read signed consent snapshots" on public.consent_signed_snapshots for select using (public.has_patient_professional_scope(clinic_id, patient_id));
create policy "Scoped professionals can read consent documents" on public.consent_documents for select using (public.has_patient_professional_scope(clinic_id, patient_id));

do $$
declare table_name text;
begin
  foreach table_name in array array['clinical_records','initial_clinical_histories','clinical_alerts','vital_sign_measurements'] loop
    execute format('drop policy if exists "Professional members can read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Professional members can insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Professional members can update %1$s" on public.%1$I', table_name);
    execute format('create policy "Scoped professionals can read %1$s" on public.%1$I for select using (public.has_patient_professional_scope(clinic_id, patient_id))', table_name);
    execute format('create policy "Scoped professionals can insert %1$s" on public.%1$I for insert with check (public.has_patient_professional_scope(clinic_id, patient_id) and public.clinic_has_write_entitlement(clinic_id))', table_name);
    execute format('create policy "Scoped professionals can update %1$s" on public.%1$I for update using (public.has_patient_professional_scope(clinic_id, patient_id)) with check (public.has_patient_professional_scope(clinic_id, patient_id) and public.clinic_has_write_entitlement(clinic_id))', table_name);
  end loop;
  foreach table_name in array array['clinical_history_identification','family_medical_histories','pathological_histories','non_pathological_histories','initial_clinical_assessments'] loop
    execute format('drop policy if exists "Professional members can read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Professional members can insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Professional members can update %1$s" on public.%1$I', table_name);
    execute format('create policy "Scoped professionals can read %1$s" on public.%1$I for select using (exists (select 1 from public.initial_clinical_histories history where history.id = %1$I.history_id and history.clinic_id = %1$I.clinic_id and public.has_patient_professional_scope(history.clinic_id, history.patient_id)))', table_name);
    execute format('create policy "Scoped professionals can insert %1$s" on public.%1$I for insert with check (exists (select 1 from public.initial_clinical_histories history where history.id = %1$I.history_id and history.clinic_id = %1$I.clinic_id and public.has_patient_professional_scope(history.clinic_id, history.patient_id)) and public.clinic_has_write_entitlement(clinic_id))', table_name);
    execute format('create policy "Scoped professionals can update %1$s" on public.%1$I for update using (exists (select 1 from public.initial_clinical_histories history where history.id = %1$I.history_id and history.clinic_id = %1$I.clinic_id and public.has_patient_professional_scope(history.clinic_id, history.patient_id))) with check (exists (select 1 from public.initial_clinical_histories history where history.id = %1$I.history_id and history.clinic_id = %1$I.clinic_id and public.has_patient_professional_scope(history.clinic_id, history.patient_id)) and public.clinic_has_write_entitlement(clinic_id))', table_name);
  end loop;
end;
$$;

-- Existing valid care evidence is backfilled conservatively. Cancelled-only appointments are excluded.
insert into public.patient_professional_assignments(clinic_id, patient_id, clinic_member_id, assigned_by, source)
select distinct patient.clinic_id, patient.id, member.id, null::uuid, 'migration'
from public.patients patient
join public.clinic_members member on member.clinic_id = patient.clinic_id and member.user_id = patient.primary_doctor_id and member.status = 'active' and member.is_professional
where patient.archived_at is null
on conflict (clinic_id, patient_id, clinic_member_id) where is_active do nothing;
insert into public.patient_professional_assignments(clinic_id, patient_id, clinic_member_id, assigned_by, source)
select distinct appointment.clinic_id, appointment.patient_id, member.id, null::uuid, 'migration'
from public.appointments appointment
join public.clinic_members member on member.clinic_id = appointment.clinic_id and member.user_id = appointment.doctor_id and member.status = 'active' and member.is_professional
where appointment.status <> 'cancelled'
on conflict (clinic_id, patient_id, clinic_member_id) where is_active do nothing;
insert into public.patient_professional_assignments(clinic_id, patient_id, clinic_member_id, assigned_by, source)
select distinct note.clinic_id, note.patient_id, member.id, null::uuid, 'migration'
from public.medical_notes note
join public.clinic_members member on member.clinic_id = note.clinic_id and member.user_id = note.doctor_id and member.status = 'active' and member.is_professional
on conflict (clinic_id, patient_id, clinic_member_id) where is_active do nothing;

create or replace function public.sync_patient_scope_from_appointment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_member_id uuid;
begin
  if tg_op in ('INSERT','UPDATE') and new.status <> 'cancelled' then
    select id into v_member_id from public.clinic_members
      where clinic_id = new.clinic_id and user_id = new.doctor_id and status = 'active' and is_professional;
    if v_member_id is not null then
      insert into public.patient_professional_assignments(clinic_id,patient_id,clinic_member_id,assigned_by,source)
      values(new.clinic_id,new.patient_id,v_member_id,auth.uid(),'appointment')
      on conflict (clinic_id,patient_id,clinic_member_id) where is_active do nothing;
    end if;
  elsif tg_op = 'UPDATE' and old.status <> 'cancelled' and new.status = 'cancelled' then
    select id into v_member_id from public.clinic_members where clinic_id = old.clinic_id and user_id = old.doctor_id;
    update public.patient_professional_assignments assignment set is_active=false, ended_at=now()
    where assignment.clinic_id=old.clinic_id and assignment.patient_id=old.patient_id and assignment.clinic_member_id=v_member_id
      and assignment.is_active and assignment.source='appointment'
      and not exists (select 1 from public.appointments a where a.clinic_id=old.clinic_id and a.patient_id=old.patient_id and a.doctor_id=old.doctor_id and a.status<>'cancelled')
      and not exists (select 1 from public.medical_notes n where n.clinic_id=old.clinic_id and n.patient_id=old.patient_id and n.doctor_id=old.doctor_id);
  end if;
  return new;
end;
$$;
create trigger appointments_sync_patient_professional_scope
after insert or update of status, patient_id, doctor_id on public.appointments
for each row execute function public.sync_patient_scope_from_appointment();

create or replace function public.create_appointment_for_current_user(
  p_clinic_id uuid, p_patient_id uuid, p_doctor_id uuid, p_title text,
  p_appointment_type text, p_location text, p_meeting_url text,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns table(appointment_id uuid, appointment_updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor_id uuid := auth.uid(); v_appointment public.appointments%rowtype; v_role public.clinic_member_role;
begin
  if v_actor_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select member.role into v_role from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=v_actor_id and member.status='active';
  if v_role is null or v_role not in ('owner','doctor','admin','assistant') or not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Appointment creation is not allowed.' using errcode='42501'; end if;
  if v_role='doctor' and p_doctor_id is distinct from v_actor_id then raise exception 'Appointment creation is not allowed.' using errcode='42501'; end if;
  if p_patient_id is null or not exists(select 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id) then raise exception 'Patient is unavailable.' using errcode='22023'; end if;
  if p_doctor_id is null or not exists(select 1 from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=p_doctor_id and member.status='active' and member.is_professional) then raise exception 'Professional is unavailable.' using errcode='22023'; end if;
  if nullif(btrim(p_title),'') is null or char_length(btrim(p_title))>120 or char_length(coalesce(p_appointment_type,''))>80 or char_length(coalesce(p_location,''))>200 or char_length(coalesce(p_meeting_url,''))>500 or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Appointment input is invalid.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text || ':' || p_doctor_id::text, 0));
  if exists(select 1 from public.appointments appointment where appointment.clinic_id=p_clinic_id and appointment.doctor_id=p_doctor_id and appointment.status<>'cancelled' and appointment.starts_at<p_ends_at and appointment.ends_at>p_starts_at) then raise exception 'Appointment time conflict.' using errcode='23P01'; end if;
  if not public.is_professional_interval_available_internal(p_clinic_id,p_doctor_id,p_starts_at,p_ends_at,null) then raise exception 'Appointment time is unavailable.' using errcode='23P01'; end if;
  insert into public.appointments(clinic_id,patient_id,doctor_id,title,appointment_type,location,meeting_url,starts_at,ends_at,status)
  values(p_clinic_id,p_patient_id,p_doctor_id,btrim(p_title),nullif(btrim(p_appointment_type,''),''),nullif(btrim(p_location,''),''),nullif(btrim(p_meeting_url,''),''),p_starts_at,p_ends_at,'scheduled') returning * into v_appointment;
  insert into public.appointment_events(clinic_id,appointment_id,event_type,actor_user_id,actor_role,new_status,new_starts_at,new_ends_at)
  values(p_clinic_id,v_appointment.id,'created',v_actor_id,v_role,'scheduled',v_appointment.starts_at,v_appointment.ends_at);
  appointment_id:=v_appointment.id; appointment_updated_at:=v_appointment.updated_at; return next;
end;
$$;

create or replace function public.set_patient_professional_assignment_for_current_user(
  p_clinic_id uuid, p_patient_id uuid, p_clinic_member_id uuid, p_is_active boolean
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (select 1 from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=v_actor and member.status='active' and member.role in ('owner','admin')) then
    raise exception 'Patient assignment management is not allowed.' using errcode='42501';
  end if;
  if p_is_active then
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
revoke all on function public.set_patient_professional_assignment_for_current_user(uuid,uuid,uuid,boolean) from public, anon;
grant execute on function public.set_patient_professional_assignment_for_current_user(uuid,uuid,uuid,boolean) to authenticated;

-- The audit cursor is clinical access too: its previous owner/admin-only predicate
-- would otherwise bypass the new scope because it is SECURITY DEFINER.
create or replace function public.list_patient_audit_timeline_for_current_user(
  p_clinic_id uuid, p_patient_id uuid, p_before_occurred_at timestamptz default null,
  p_before_event_id uuid default null, p_limit integer default 21
) returns table(event_id uuid,event_source text,action text,resource_type text,related_consent_id uuid,actor_name text,occurred_at timestamptz)
language sql security definer set search_path = public, pg_temp stable as $$
  with authorized_patient as (
    select patient.id from public.patients patient
    where patient.clinic_id=p_clinic_id and patient.id=p_patient_id
      and public.has_patient_professional_scope(p_clinic_id,p_patient_id)
  ), patient_resources as (
    select 'patients'::text resource_type, patient.id resource_id from authorized_patient patient
    union all select 'clinical_records', record.id from public.clinical_records record join authorized_patient patient on patient.id=record.patient_id where record.clinic_id=p_clinic_id
    union all select 'initial_clinical_histories', history.id from public.initial_clinical_histories history join authorized_patient patient on patient.id=history.patient_id where history.clinic_id=p_clinic_id
    union all select 'clinical_history_identification', identification.id from public.clinical_history_identification identification join public.initial_clinical_histories history on history.clinic_id=identification.clinic_id and history.id=identification.history_id join authorized_patient patient on patient.id=history.patient_id where identification.clinic_id=p_clinic_id
    union all select 'family_medical_histories', family.id from public.family_medical_histories family join public.initial_clinical_histories history on history.clinic_id=family.clinic_id and history.id=family.history_id join authorized_patient patient on patient.id=history.patient_id where family.clinic_id=p_clinic_id
    union all select 'pathological_histories', pathological.id from public.pathological_histories pathological join public.initial_clinical_histories history on history.clinic_id=pathological.clinic_id and history.id=pathological.history_id join authorized_patient patient on patient.id=history.patient_id where pathological.clinic_id=p_clinic_id
    union all select 'non_pathological_histories', non_pathological.id from public.non_pathological_histories non_pathological join public.initial_clinical_histories history on history.clinic_id=non_pathological.clinic_id and history.id=non_pathological.history_id join authorized_patient patient on patient.id=history.patient_id where non_pathological.clinic_id=p_clinic_id
    union all select 'initial_clinical_assessments', assessment.id from public.initial_clinical_assessments assessment join public.initial_clinical_histories history on history.clinic_id=assessment.clinic_id and history.id=assessment.history_id join authorized_patient patient on patient.id=history.patient_id where assessment.clinic_id=p_clinic_id
    union all select 'clinical_alerts', alert.id from public.clinical_alerts alert join authorized_patient patient on patient.id=alert.patient_id where alert.clinic_id=p_clinic_id
    union all select 'vital_sign_measurements', vital.id from public.vital_sign_measurements vital join authorized_patient patient on patient.id=vital.patient_id where vital.clinic_id=p_clinic_id
  ), safe_events as (
    select log.id event_id,'audit_log'::text event_source,log.action,log.entity_type resource_type,log.entity_id resource_id,
      case when log.entity_type='consent' then log.entity_id when log.entity_type='consent_document' then document.consent_id else null end related_consent_id,
      log.actor_user_id,log.created_at occurred_at
    from public.audit_logs log join authorized_patient patient on true
    left join public.consent_documents document on log.entity_type='consent_document' and document.clinic_id=p_clinic_id and document.patient_id=patient.id and document.id=log.entity_id
    where log.clinic_id=p_clinic_id and ((log.entity_type='patient' and log.entity_id=patient.id) or (log.entity_type='consent' and exists(select 1 from public.consents consent where consent.clinic_id=p_clinic_id and consent.patient_id=patient.id and consent.id=log.entity_id)) or (log.entity_type='consent_document' and document.id is not null))
    union all
    select change.id,'clinical_change'::text,change.action,change.entity_type,change.entity_id,null::uuid,change.actor_user_id,change.created_at
    from public.clinical_change_events change join patient_resources resource on resource.resource_type=change.entity_type and resource.resource_id=change.entity_id where change.clinic_id=p_clinic_id
  )
  select event.event_id,event.event_source,event.action,event.resource_type,event.related_consent_id,
    (select profile.full_name from public.clinic_members member join public.profiles profile on profile.id=member.user_id where member.clinic_id=p_clinic_id and member.user_id=event.actor_user_id order by (member.status='active') desc,member.created_at desc limit 1),event.occurred_at
  from safe_events event
  where ((p_before_occurred_at is null and p_before_event_id is null) or (p_before_occurred_at is not null and p_before_event_id is not null and (event.occurred_at,event.event_id)<(p_before_occurred_at,p_before_event_id)))
  order by event.occurred_at desc,event.event_id desc limit least(greatest(coalesce(p_limit,21),1),101);
$$;

-- Align B5 pending-action storage with the canonical clinic member identity.
create or replace function public.create_assistant_pending_action_for_current_user(
  p_clinic_id uuid, p_tool_name text, p_validated_arguments jsonb, p_expires_at timestamptz
) returns table(id uuid, tool_name text, expires_at timestamptz, status text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_member public.clinic_members%rowtype; v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_member from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=v_actor and member.status='active';
  if not found or v_member.role not in ('owner','admin','doctor','assistant') then raise exception 'Assistant action is not allowed.' using errcode='42501'; end if;
  if p_tool_name not in ('create_appointment','confirm_appointment','reschedule_appointment','cancel_appointment') or jsonb_typeof(p_validated_arguments) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_validated_arguments) as key where key not in ('appointment_id','patient_id','professional_clinic_member_id','local_date','local_time','duration_minutes','expected_status'))
    or p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then raise exception 'Invalid assistant proposal.' using errcode='22023'; end if;
  insert into public.assistant_pending_actions(clinic_id,actor_user_id,actor_clinic_member_id,tool_name,validated_arguments,expires_at)
  values(p_clinic_id,v_actor,v_member.id,p_tool_name,p_validated_arguments,p_expires_at) returning * into v_action;
  return query select v_action.id,v_action.tool_name,v_action.expires_at,v_action.status;
end;
$$;
