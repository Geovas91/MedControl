-- Assistant commercial execution is independent from normal Agenda authority.
-- No prompts, messages, provider responses or PHI are added to durable proposals.
alter table public.assistant_pending_actions add column mutation_executed_at timestamptz;

-- A row lock serializes new Assistant work against subscription update/delete.
-- Actor authorization is required separately; this helper is never client executable.
create function public.lock_assistant_write_authority_internal(p_clinic_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.clinic_subscriptions where clinic_id=p_clinic_id for share;
  if not found or not public.clinic_plan_includes_commercial_feature_internal(p_clinic_id,'appointment_assistant')
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Assistant is unavailable.' using errcode='42501';
  end if;
end; $$;
revoke all on function public.lock_assistant_write_authority_internal(uuid) from public, anon, authenticated;


create or replace function public.create_assistant_pending_action_for_current_user(
  p_clinic_id uuid, p_tool_name text, p_validated_arguments jsonb, p_expires_at timestamptz
) returns table(id uuid, tool_name text, expires_at timestamptz, status text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_member public.clinic_members%rowtype; v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_member from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=v_actor and member.status='active';
  if not found or v_member.role not in ('owner','admin','doctor','assistant') then raise exception 'Assistant action is not allowed.' using errcode='42501'; end if;
  perform public.lock_assistant_write_authority_internal(p_clinic_id);
  if p_tool_name is null or p_validated_arguments is null or p_expires_at is null or p_tool_name not in ('create_appointment','confirm_appointment','reschedule_appointment','cancel_appointment') or jsonb_typeof(p_validated_arguments) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_validated_arguments) as key where key not in ('appointment_id','patient_id','professional_clinic_member_id','local_date','local_time','duration_minutes','expected_status'))
    or p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then raise exception 'Invalid assistant proposal.' using errcode='22023'; end if;
  insert into public.assistant_pending_actions(clinic_id,actor_user_id,actor_clinic_member_id,tool_name,validated_arguments,expires_at)
  values(p_clinic_id,v_actor,v_member.id,p_tool_name,p_validated_arguments,p_expires_at) returning * into v_action;
  return query select v_action.id,v_action.tool_name,v_action.expires_at,v_action.status;
end;
$$;

create or replace function public.claim_assistant_pending_action_for_current_user(p_action_id uuid)
returns table(id uuid, tool_name text, validated_arguments jsonb, status text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_action
  from public.assistant_pending_actions action
  where action.id = p_action_id
    and action.actor_user_id = v_actor
    and exists (
      select 1
      from public.clinic_members member
      where member.id = action.actor_clinic_member_id
        and member.clinic_id = action.clinic_id
        and member.user_id = v_actor
        and member.status = 'active'
    )
  for update;

  if not found then
    raise exception 'Assistant proposal is unavailable.' using errcode = '42501';
  end if;

  perform public.lock_assistant_write_authority_internal(v_action.clinic_id);

  if v_action.status = 'pending' and v_action.expires_at <= now() then
    update public.assistant_pending_actions
    set status = 'expired'
    where assistant_pending_actions.id = v_action.id;
    v_action.status := 'expired';
  elsif v_action.status = 'pending' then
    update public.assistant_pending_actions
    set status = 'claimed', claimed_at = now()
    where assistant_pending_actions.id = v_action.id
    returning * into v_action;
  elsif v_action.status = 'claimed' then
    -- This call did not acquire the claim and must never execute the action.
    v_action.status := 'already_claimed';
  end if;

  return query select v_action.id, v_action.tool_name, v_action.validated_arguments,
    v_action.status, v_action.expires_at;
end;
$$;

-- The subscription lock spans the canonical mutation. The action lock plus marker
-- prevents two callers executing the same claimed action, including before finish.
create function public.execute_claimed_assistant_pending_action_for_current_user(p_action_id uuid)
returns table(appointment_id uuid,status text,starts_at timestamptz,ends_at timestamptz,updated_at timestamptz,changed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_action public.assistant_pending_actions%rowtype;
  v_args jsonb; v_timezone text; v_professional uuid; v_start timestamptz; v_end timestamptz;
  v_local_date date; v_local_time time; v_duration integer; v_created record; v_result record;
begin
  if auth.uid() is null then raise exception 'Assistant is unavailable.' using errcode='42501'; end if;
  select * into v_action from public.assistant_pending_actions a where a.id=p_action_id and a.actor_user_id=auth.uid() for update;
  if not found or v_action.status <> 'claimed' or v_action.expires_at <= now() or v_action.mutation_executed_at is not null
    or not exists(select 1 from public.clinic_members m where m.id=v_action.actor_clinic_member_id
      and m.clinic_id=v_action.clinic_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin','doctor','assistant')) then
    raise exception 'Assistant is unavailable.' using errcode='42501';
  end if;
  perform public.lock_assistant_write_authority_internal(v_action.clinic_id);
  v_args:=v_action.validated_arguments;
  if v_action.tool_name in ('create_appointment','reschedule_appointment') then
    if coalesce(v_args->>'local_date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(v_args->>'local_time','') !~ '^(0[0-9]|1[0-9]|2[0-3]):(00|30)$'
      or coalesce(v_args->>'duration_minutes','') !~ '^(15|30|45|60|90|120)$' then
      raise exception 'Invalid Assistant input.' using errcode='22023';
    end if;
    v_local_date:=(v_args->>'local_date')::date; v_local_time:=(v_args->>'local_time')::time;
    v_duration:=(v_args->>'duration_minutes')::integer;
    select timezone into v_timezone from public.clinics where id=v_action.clinic_id;
    v_start:=(v_local_date+v_local_time) at time zone v_timezone;
    -- Reject nonexistent local wall clock times instead of silently shifting them.
    if (v_start at time zone v_timezone) <> v_local_date+v_local_time then
      raise exception 'Invalid local time.' using errcode='22023';
    end if;
    v_end:=v_start+make_interval(mins=>v_duration);
  end if;
  if v_action.tool_name='create_appointment' then
    select m.user_id into v_professional from public.clinic_members m
    where m.id=(v_args->>'professional_clinic_member_id')::uuid and m.clinic_id=v_action.clinic_id
      and m.status='active' and m.is_professional;
    if v_professional is null or not public.is_patient_eligible_for_scheduling(v_action.clinic_id,
      (v_args->>'professional_clinic_member_id')::uuid,(v_args->>'patient_id')::uuid) then
      raise exception 'Scheduling selection is unavailable.' using errcode='42501';
    end if;
    select * into v_created from public.create_appointment_for_current_user(v_action.clinic_id,
      (v_args->>'patient_id')::uuid,v_professional,'Cita','','','',v_start,v_end);
    return query select a.id,a.status::text,a.starts_at,a.ends_at,a.updated_at,true
      from public.appointments a where a.id=v_created.appointment_id and a.clinic_id=v_action.clinic_id;
  elsif v_action.tool_name in ('confirm_appointment','cancel_appointment','reschedule_appointment') then
    if v_args->>'appointment_id' is null or coalesce(v_args->>'expected_status','') not in ('scheduled','confirmed','waiting','completed','cancelled') then
      raise exception 'Invalid Assistant input.' using errcode='22023';
    end if;
    select * into v_result from public.mutate_appointment_lifecycle_for_current_user(v_action.clinic_id,
      (v_args->>'appointment_id')::uuid,
      case v_action.tool_name when 'confirm_appointment' then 'confirm' when 'cancel_appointment' then 'cancel' else 'reschedule' end,
      (v_args->>'expected_status')::public.appointment_status,v_start,v_end);
    return query select v_result.appointment_id,v_result.status::text,v_result.starts_at,v_result.ends_at,v_result.updated_at,v_result.changed;
  else raise exception 'Invalid Assistant action.' using errcode='22023'; end if;
  update public.assistant_pending_actions set mutation_executed_at=clock_timestamp() where id=v_action.id;
end; $$;
revoke all on function public.execute_claimed_assistant_pending_action_for_current_user(uuid) from public, anon, authenticated;
grant execute on function public.execute_claimed_assistant_pending_action_for_current_user(uuid) to authenticated;


create or replace function public.finish_assistant_pending_action_for_current_user(p_action_id uuid,p_outcome text,p_error_code text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in ('executed','failed') or (p_outcome='executed' and p_error_code is not null) or (p_outcome='failed' and (p_error_code is null or p_error_code not in ('forbidden','not_found','conflict','outside_availability','stale','invalid_transition','validation_error','entitlement','generic'))) then raise exception 'Invalid assistant outcome.' using errcode='22023'; end if;
  select * into v_action from public.assistant_pending_actions action where action.id=p_action_id and action.actor_user_id=v_actor for update;
  if not found or v_action.status <> 'claimed' or not exists(select 1 from public.clinic_members m where m.id=v_action.actor_clinic_member_id and m.clinic_id=v_action.clinic_id and m.user_id=v_actor) then raise exception 'Assistant proposal is unavailable.' using errcode='42501'; end if;
  update public.assistant_pending_actions set status=p_outcome,executed_at=case when p_outcome='executed' then now() else null end,failed_at=case when p_outcome='failed' then now() else null end,error_code=p_error_code where assistant_pending_actions.id=v_action.id;
  return p_outcome;
end $$;

-- Canonical subscription write semantics: active regardless of period end;
-- trialing requires a non-null future end. Service workers have no auth.uid().
create or replace function public.clinic_has_effective_automation_subscription_internal(p_clinic_id uuid)
returns boolean language sql security invoker set search_path = public, pg_temp stable as $$
  select exists(select 1 from public.clinic_subscriptions s where s.clinic_id=p_clinic_id
    and s.plan_id in ('plus','pro') and (s.status='active' or (s.status='trialing' and s.current_period_end is not null and s.current_period_end>now())));
$$;
revoke all on function public.clinic_has_effective_automation_subscription_internal(uuid) from public, anon, authenticated;


create or replace function public.begin_appointment_automation_delivery(
  p_job_id uuid, p_worker_id text, p_lease_token uuid
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_clinic uuid;
begin
  select clinic_id into v_clinic from public.appointment_automation_jobs where id=p_job_id
    and status='processing' and locked_by=p_worker_id and lease_token=p_lease_token and lease_expires_at>clock_timestamp() for update;
  if not found then return false; end if;
  perform 1 from public.clinic_subscriptions where clinic_id=v_clinic for share;
  if not found or not public.clinic_has_effective_automation_subscription_internal(v_clinic) then return false; end if;
  update public.appointment_automation_jobs
  set delivery_state = 'dispatching'
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id
    and lease_token = p_lease_token and lease_expires_at > clock_timestamp()
    and delivery_state = 'not_started';
  return found;
end;
$$;

create function public.require_assistant_history_access_internal(p_clinic_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp stable as $$
begin
  if auth.uid() is null or not public.has_clinic_role(p_clinic_id,array['owner','admin','doctor','assistant'])
    or not public.clinic_plan_includes_commercial_feature_internal(p_clinic_id,'appointment_assistant') then
    raise exception 'Assistant history is unavailable.' using errcode='42501';
  end if;
  return true;
end; $$;
revoke all on function public.require_assistant_history_access_internal(uuid) from public, anon, authenticated;

create or replace function public.list_appointment_assistant_activity_for_current_user(
  p_clinic_id uuid,
  p_before_occurred_at timestamptz default null,
  p_before_event_source text default null,
  p_before_event_id uuid default null,
  p_limit integer default 11
)
returns table (
  event_id uuid,
  event_source text,
  action text,
  appointment_id uuid,
  patient_name text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  perform public.require_assistant_history_access_internal(p_clinic_id);
  return query
  with authorized_clinic as (
    select p_clinic_id as clinic_id
    where true
  ),
  safe_events as (
    select
      appointment.id as event_id,
      'appointment'::text as event_source,
      'appointment_created'::text as action,
      appointment.id as appointment_id,
      patient.full_name as patient_name,
      appointment.created_at as occurred_at
    from authorized_clinic
    join public.appointments as appointment using (clinic_id)
    join public.patients as patient
      on patient.clinic_id = appointment.clinic_id
      and patient.id = appointment.patient_id
    where (not public.has_clinic_role(p_clinic_id,array['doctor']) or appointment.doctor_id=auth.uid())

    union all

    select
      log.id,
      'audit_log'::text,
      log.action,
      appointment.id,
      patient.full_name,
      log.created_at
    from authorized_clinic
    join public.audit_logs as log using (clinic_id)
    join public.appointments as appointment
      on appointment.clinic_id = log.clinic_id
      and appointment.id = log.entity_id
    join public.patients as patient
      on patient.clinic_id = appointment.clinic_id
      and patient.id = appointment.patient_id
    where (not public.has_clinic_role(p_clinic_id,array['doctor']) or appointment.doctor_id=auth.uid()) and log.entity_type = 'appointment'
      and log.action in (
        'appointment_confirmed', 'appointment_waiting', 'appointment_completed',
        'appointment_cancelled', 'appointment_restored', 'appointment_rescheduled'
      )

    union all

    select
      invitation.id,
      'calendar_email'::text,
      case invitation.delivery_status
        when 'sent' then 'calendar_invitation_sent'
        when 'failed' then 'calendar_invitation_failed'
        else 'calendar_invitation_delivery_unknown'
      end,
      appointment.id,
      patient.full_name,
      coalesce(invitation.sent_at, invitation.last_attempted_at, invitation.updated_at)
    from authorized_clinic
    join public.appointment_invites as invitation using (clinic_id)
    join public.appointments as appointment
      on appointment.clinic_id = invitation.clinic_id
      and appointment.id = invitation.appointment_id
      and appointment.patient_id = invitation.patient_id
    join public.patients as patient
      on patient.clinic_id = appointment.clinic_id
      and patient.id = appointment.patient_id
    where (not public.has_clinic_role(p_clinic_id,array['doctor']) or appointment.doctor_id=auth.uid()) and invitation.channel = 'email'
      and invitation.delivery_status in ('sent', 'failed', 'delivery_unknown')
  )
  select
    event.event_id,
    event.event_source,
    event.action,
    event.appointment_id,
    event.patient_name,
    event.occurred_at
  from safe_events as event
  where (
    (p_before_occurred_at is null and p_before_event_source is null and p_before_event_id is null)
    or (
      p_before_occurred_at is not null
      and p_before_event_source in ('appointment', 'audit_log', 'calendar_email')
      and p_before_event_id is not null
      and (event.occurred_at, event.event_source, event.event_id)
        < (p_before_occurred_at, p_before_event_source, p_before_event_id)
    )
  )
  order by event.occurred_at desc, event.event_source desc, event.event_id desc
  limit least(greatest(coalesce(p_limit, 11), 1), 51);
end;
$$;

create or replace function public.get_appointment_automation_dashboard_for_current_user(p_clinic_id uuid, p_limit integer default 10)
returns table (
  job_id uuid, job_type text, job_status text, scheduled_for timestamptz,
  attempts integer, max_attempts integer, last_error_code text, appointment_id uuid,
  last_scheduler_started_at timestamptz, last_scheduler_completed_at timestamptz, last_scheduler_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  perform public.require_assistant_history_access_internal(p_clinic_id);
  return query
  with authorized as (
    select p_clinic_id clinic_id where true
  ), heartbeat as (
    select * from public.appointment_automation_scheduler_state where singleton
  )
  select j.id, j.type, j.status, j.scheduled_for, j.attempts, j.max_attempts,
    j.last_error_code, j.appointment_id, h.last_started_at, h.last_completed_at, h.last_status
  from authorized a join public.appointment_automation_jobs j using(clinic_id) cross join heartbeat h
  where exists(select 1 from public.appointments appointment where appointment.id=j.appointment_id and appointment.clinic_id=j.clinic_id
    and (not public.has_clinic_role(p_clinic_id,array['doctor']) or appointment.doctor_id=auth.uid()))
  order by case when j.status in ('pending','retry_pending','processing') then 0 else 1 end,
    j.scheduled_for, j.id limit least(greatest(coalesce(p_limit, 10), 1), 25);
end;
$$;

create or replace function public.get_appointment_automation_scheduler_status_for_current_user(p_clinic_id uuid)
returns table (
  last_started_at timestamptz, last_completed_at timestamptz, last_status text,
  last_claimed integer, last_succeeded integer, last_skipped integer, last_failed integer,
  assistant_enabled boolean, reminder_enabled boolean, review_request_enabled boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  perform public.require_assistant_history_access_internal(p_clinic_id);
  return query
  select state.last_started_at, state.last_completed_at, state.last_status,
    state.last_claimed, state.last_succeeded, state.last_skipped, state.last_failed,
    coalesce(settings.enabled, false), coalesce(settings.reminder_enabled, false),
    coalesce(settings.review_request_enabled, false)
  from public.appointment_automation_scheduler_state state
  left join public.bot_settings settings on settings.clinic_id = p_clinic_id
  where state.singleton;
end;
$$;

revoke all on function public.create_assistant_pending_action_for_current_user(uuid,text,jsonb,timestamptz),
 public.claim_assistant_pending_action_for_current_user(uuid), public.finish_assistant_pending_action_for_current_user(uuid,text,text),
 public.list_appointment_assistant_activity_for_current_user(uuid,timestamptz,text,uuid,integer),
 public.get_appointment_automation_dashboard_for_current_user(uuid,integer),public.get_appointment_automation_scheduler_status_for_current_user(uuid)
 from public, anon, authenticated;
grant execute on function public.create_assistant_pending_action_for_current_user(uuid,text,jsonb,timestamptz),
 public.claim_assistant_pending_action_for_current_user(uuid), public.finish_assistant_pending_action_for_current_user(uuid,text,text),
 public.list_appointment_assistant_activity_for_current_user(uuid,timestamptz,text,uuid,integer),
 public.get_appointment_automation_dashboard_for_current_user(uuid,integer),public.get_appointment_automation_scheduler_status_for_current_user(uuid)
 to authenticated;
revoke all on function public.begin_appointment_automation_delivery(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.begin_appointment_automation_delivery(uuid,text,uuid) to service_role;
