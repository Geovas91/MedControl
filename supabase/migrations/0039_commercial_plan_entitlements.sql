-- Align differentiated Basic, Plus and Pro capabilities without rewriting migrations 0001-0038.

-- Commercial plan enforcement for the two differentiated capabilities introduced in this release.
-- ICS, personalized consents, verified reviews and Service Bot remain available to every plan.
create or replace function public.clinic_plan_includes_commercial_feature_internal(
  p_clinic_id uuid,
  p_feature text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case p_feature
    when 'additional_staff' then exists (
      select 1 from public.clinic_subscriptions subscription
      where subscription.clinic_id = p_clinic_id and subscription.plan_id in ('plus', 'pro')
    )
    when 'appointment_assistant' then exists (
      select 1 from public.clinic_subscriptions subscription
      where subscription.clinic_id = p_clinic_id and subscription.plan_id in ('plus', 'pro')
    )
    else false
  end;
$$;
revoke all on function public.clinic_plan_includes_commercial_feature_internal(uuid, text)
  from public, anon, authenticated;

create or replace function public.create_clinic_member_invitation_for_current_user(p_clinic_id uuid,p_email text,p_role text)
returns table(invitation_id uuid,raw_token text,expires_at timestamptz,invited_email text,invited_role text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor_id uuid:=auth.uid(); v_email text:=lower(nullif(trim(p_email),'')); v_role text:=lower(nullif(trim(p_role),''));
  v_token text; v_hash text; v_existing public.clinic_member_invitations%rowtype; v_existing_member_role text;
  v_doctors integer; v_plan_id text;
begin
  if v_actor_id is null then raise exception 'Authentication required.'; end if;
  if not public.has_clinic_role(p_clinic_id,array['owner','admin']) then raise exception 'Not allowed to manage invitations.'; end if;
  if not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Subscription does not allow invitations.'; end if;
  if v_role not in ('admin','doctor','assistant') then raise exception 'Invalid invitation role.'; end if;
  if v_role in ('admin','assistant') and not public.clinic_plan_includes_commercial_feature_internal(p_clinic_id,'additional_staff') then
    raise exception 'Additional staff is unavailable for the current plan.' using errcode = '42501';
  end if;
  if v_email is null or char_length(v_email)>254 or position('@' in v_email)<2 then raise exception 'Invalid invitation email.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text||':'||v_email,0));
  select cm.role::text into v_existing_member_role from public.clinic_members cm join auth.users u on u.id=cm.user_id
    where cm.clinic_id=p_clinic_id and lower(u.email)=v_email and cm.status='active' limit 1;
  if v_existing_member_role='owner' then raise exception 'Owner memberships cannot be invited or changed.'; end if;
  if v_existing_member_role is not null then raise exception 'This email already belongs to an active clinic member.'; end if;
  select * into v_existing from public.clinic_member_invitations i
    where i.clinic_id=p_clinic_id and i.normalized_email=v_email and i.status='pending' for update;
  if found and v_existing.expires_at>now() then raise exception 'A pending invitation already exists for this email.'; end if;
  if found then update public.clinic_member_invitations set status='expired',token_hash=null where id=v_existing.id; end if;
  if (select count(*) from public.clinic_member_invitations where clinic_id=p_clinic_id and status='pending')>=25 then raise exception 'Too many pending invitations.'; end if;
  if v_role='doctor' then
    select cs.plan_id into v_plan_id from public.clinic_subscriptions cs where cs.clinic_id=p_clinic_id;
    v_doctors:=public.count_clinic_doctors_for_current_user(p_clinic_id);
    if v_plan_id='basic' and v_doctors>=1 then raise exception 'Doctor limit reached for the current plan.'; end if;
    if v_plan_id='plus' and v_doctors>=5 then raise exception 'Doctor limit reached for the current plan.'; end if;
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  insert into public.clinic_member_invitations as i(clinic_id,invited_email,normalized_email,role,token_hash,expires_at,created_by)
    values(p_clinic_id,v_email,v_email,v_role::public.clinic_member_role,v_hash,now()+interval '7 days',v_actor_id)
    returning i.id,i.expires_at,i.invited_email,i.role::text into invitation_id,expires_at,invited_email,invited_role;
  raw_token:=v_token;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(p_clinic_id,v_actor_id,'clinic_member_invitation',invitation_id,'invitation_created',jsonb_build_object('role',v_role));
  return next;
end $$;

create or replace function public.accept_clinic_member_invitation_for_current_user(p_token_hash text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user_id uuid:=auth.uid(); v_email text; v_email_confirmed_at timestamptz;
  v_invitation public.clinic_member_invitations%rowtype; v_existing public.clinic_members%rowtype;
  v_has_member boolean:=false; v_plan_id text; v_doctors integer;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select lower(u.email),u.email_confirmed_at into v_email,v_email_confirmed_at from auth.users u where u.id=v_user_id;
  if v_email is null or v_email_confirmed_at is null then raise exception 'Invitation is unavailable.'; end if;
  select * into v_invitation from public.clinic_member_invitations i where i.token_hash=p_token_hash for update;
  if not found or v_invitation.status<>'pending' or v_invitation.expires_at<=now() or v_invitation.revoked_at is not null then raise exception 'Invitation is unavailable.'; end if;
  if v_email<>v_invitation.normalized_email then raise exception 'Invitation is unavailable.'; end if;
  if not public.clinic_subscription_allows_member_acceptance(v_invitation.clinic_id) then raise exception 'Invitation is unavailable.'; end if;
  if v_invitation.role in ('admin','assistant') and not public.clinic_plan_includes_commercial_feature_internal(v_invitation.clinic_id,'additional_staff') then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;

  -- Every doctor activation in the client-accessible membership path shares this
  -- transaction lock, including two different invitations for the same clinic.
  if v_invitation.role='doctor' then
    perform pg_advisory_xact_lock(hashtextextended('clinic_doctor_limit:'||v_invitation.clinic_id::text,0));
  end if;

  select * into v_existing from public.clinic_members cm where cm.clinic_id=v_invitation.clinic_id and cm.user_id=v_user_id for update;
  v_has_member:=found;
  if found and v_existing.role='owner' then raise exception 'Invitation is unavailable.'; end if;
  if found and v_existing.status='active' and v_existing.role<>v_invitation.role then raise exception 'Invitation is unavailable.'; end if;
  if v_invitation.role='doctor' and (not v_has_member or v_existing.role<>'doctor' or v_existing.status<>'active') then
    select cs.plan_id into v_plan_id from public.clinic_subscriptions cs where cs.clinic_id=v_invitation.clinic_id;
    select count(*)::integer into v_doctors from public.clinic_members cm
      where cm.clinic_id=v_invitation.clinic_id and cm.status='active' and cm.role in ('owner','doctor');
    if v_plan_id='basic' and v_doctors>=1 then raise exception 'Invitation is unavailable.'; end if;
    if v_plan_id='plus' and v_doctors>=5 then raise exception 'Invitation is unavailable.'; end if;
  end if;
  insert into public.profiles as p(id,email) values(v_user_id,v_email) on conflict(id) do update set email=excluded.email;
  if not v_has_member then
    insert into public.clinic_members(clinic_id,user_id,role,status) values(v_invitation.clinic_id,v_user_id,v_invitation.role,'active');
  elsif v_existing.status<>'active' then
    update public.clinic_members set role=v_invitation.role,status='active' where id=v_existing.id;
  end if;
  update public.clinic_member_invitations set status='accepted',accepted_at=now(),accepted_user_id=v_user_id,token_hash=null where id=v_invitation.id;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(v_invitation.clinic_id,v_user_id,'clinic_member_invitation',v_invitation.id,'invitation_accepted',jsonb_build_object('role',v_invitation.role));
  return v_invitation.clinic_id;
end $$;

create or replace function public.save_appointment_assistant_settings_for_current_user(
  p_clinic_id uuid,
  p_enabled boolean,
  p_reminder_enabled boolean,
  p_reminder_hours_before integer,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null,
  p_review_request_enabled boolean default false
)
returns table (
  enabled boolean,
  reminder_enabled boolean,
  reminder_hours_before integer,
  quiet_hours_start time,
  quiet_hours_end time,
  review_request_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or not public.has_clinic_role(p_clinic_id, array['owner', 'admin'])
    or not public.clinic_has_write_entitlement(p_clinic_id)
    or not public.clinic_plan_includes_commercial_feature_internal(p_clinic_id, 'appointment_assistant') then
    raise exception 'Assistant settings are unavailable.' using errcode = '42501';
  end if;
  if p_enabled is null or p_reminder_enabled is null or p_review_request_enabled is null
    or p_reminder_hours_before not between 1 and 168
    or ((p_quiet_hours_start is null) <> (p_quiet_hours_end is null)) then
    raise exception 'Invalid assistant settings.' using errcode = '22023';
  end if;

  return query
  insert into public.bot_settings as settings (
    clinic_id, enabled, channel, reminder_enabled, reminder_hours_before,
    quiet_hours_start, quiet_hours_end, review_request_enabled,
    max_reminders_per_patient, message_template, escalation_behavior
  ) values (
    p_clinic_id, p_enabled, 'email', p_reminder_enabled, p_reminder_hours_before,
    p_quiet_hours_start, p_quiet_hours_end, p_review_request_enabled,
    1, null, 'none'
  )
  on conflict (clinic_id) do update set
    enabled = excluded.enabled,
    channel = 'email',
    reminder_enabled = excluded.reminder_enabled,
    reminder_hours_before = excluded.reminder_hours_before,
    quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end,
    review_request_enabled = excluded.review_request_enabled
  returning settings.enabled, settings.reminder_enabled, settings.reminder_hours_before,
    settings.quiet_hours_start, settings.quiet_hours_end,
    settings.review_request_enabled, settings.updated_at;
end;
$$;

create or replace function public.enqueue_appointment_automation_jobs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.bot_settings%rowtype;
  v_timezone text;
  v_schedule timestamptz;
  v_generation integer;
  v_schedule_changed boolean := false;
  v_restored boolean := false;
  v_completed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_schedule_changed := old.starts_at is distinct from new.starts_at
      or old.ends_at is distinct from new.ends_at
      or old.doctor_id is distinct from new.doctor_id;
    v_restored := old.status = 'cancelled' and new.status = 'scheduled';
    v_completed := old.status <> 'completed' and new.status = 'completed';

    if v_schedule_changed or new.status in ('cancelled', 'completed') or v_restored then
      update public.appointment_automation_jobs
      set status = 'cancelled', cancelled_at = now(), processed_at = now(), last_error_code = 'appointment_changed',
          locked_at = null, lease_expires_at = null, locked_by = null
      where clinic_id = new.clinic_id and appointment_id = new.id and type = 'reminder_email'
        and status in ('pending', 'retry_pending', 'processing');
    end if;
  end if;

  select * into v_settings from public.bot_settings where clinic_id = new.clinic_id;
  if not found or not v_settings.enabled
    or not public.clinic_has_effective_automation_subscription_internal(new.clinic_id)
    or not public.clinic_plan_includes_commercial_feature_internal(new.clinic_id, 'appointment_assistant') then
    return new;
  end if;

  select timezone into v_timezone from public.clinics where id = new.clinic_id;
  if v_settings.reminder_enabled and new.status in ('scheduled', 'confirmed', 'waiting')
    and (tg_op = 'INSERT' or v_schedule_changed or v_restored) then
    select coalesce(max(job.generation), 0) + 1 into v_generation
    from public.appointment_automation_jobs job
    where job.clinic_id = new.clinic_id and job.appointment_id = new.id and job.type = 'reminder_email';
    begin
      v_schedule := public.calculate_appointment_reminder_at(new.starts_at, v_timezone,
        v_settings.reminder_hours_before, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
      -- A late-created appointment must not enqueue an immediate attempt inside quiet hours.
      v_schedule := public.calculate_appointment_reminder_at(greatest(v_schedule, clock_timestamp()), v_timezone,
        0, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
    exception when invalid_parameter_value then
      -- Invalid tenant timezone fails closed for automation without blocking the clinical mutation.
      return new;
    end;
    if v_schedule < new.starts_at then
      insert into public.appointment_automation_jobs (
        clinic_id, appointment_id, type, source_version, generation,
        scheduled_for, next_attempt_at, dedupe_key
      ) values (
        new.clinic_id, new.id, 'reminder_email', new.starts_at, v_generation,
        v_schedule, greatest(v_schedule, now()),
        'reminder:' || new.id::text || ':' || v_generation::text
      ) on conflict (clinic_id, channel, dedupe_key) do nothing;
    end if;
  end if;

  if v_completed and v_settings.review_request_enabled then
    v_generation := 1;
    insert into public.appointment_automation_jobs (
      clinic_id, appointment_id, type, source_version, generation,
      scheduled_for, next_attempt_at, max_attempts, dedupe_key
    ) values (
      new.clinic_id, new.id, 'review_request_email', new.starts_at, v_generation,
      now(), now(), 1, 'review:' || new.id::text
    ) on conflict (clinic_id, channel, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.rebuild_clinic_reminder_jobs(p_clinic_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_settings public.bot_settings%rowtype;
  v_timezone text;
  v_appointment public.appointments%rowtype;
  v_schedule timestamptz;
  v_generation integer;
begin
  update public.appointment_automation_jobs
  set status = 'cancelled', cancelled_at = now(), processed_at = now(), last_error_code = 'settings_changed',
      locked_at = null, lease_expires_at = null, locked_by = null
  where clinic_id = p_clinic_id and type = 'reminder_email'
    and status in ('pending', 'retry_pending', 'processing');

  select * into v_settings from public.bot_settings where clinic_id = p_clinic_id;
  if not found or not v_settings.enabled or not v_settings.reminder_enabled
    or not public.clinic_has_effective_automation_subscription_internal(p_clinic_id)
    or not public.clinic_plan_includes_commercial_feature_internal(p_clinic_id, 'appointment_assistant') then return; end if;
  select timezone into v_timezone from public.clinics where id = p_clinic_id;

  for v_appointment in
    select * from public.appointments
    where clinic_id = p_clinic_id and status in ('scheduled', 'confirmed', 'waiting') and starts_at > clock_timestamp()
    order by starts_at, id
  loop
    begin
      v_schedule := public.calculate_appointment_reminder_at(v_appointment.starts_at, v_timezone,
        v_settings.reminder_hours_before, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
      v_schedule := public.calculate_appointment_reminder_at(greatest(v_schedule, clock_timestamp()), v_timezone,
        0, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
    exception when invalid_parameter_value then
      continue;
    end;
    if v_schedule < v_appointment.starts_at then
      select coalesce(max(job.generation), 0) + 1 into v_generation
      from public.appointment_automation_jobs job
      where job.clinic_id = p_clinic_id and job.appointment_id = v_appointment.id and job.type = 'reminder_email';
      insert into public.appointment_automation_jobs(
        clinic_id, appointment_id, type, source_version, generation,
        scheduled_for, next_attempt_at, dedupe_key
      ) values (
        p_clinic_id, v_appointment.id, 'reminder_email', v_appointment.starts_at, v_generation,
        v_schedule, v_schedule, 'reminder:' || v_appointment.id::text || ':' || v_generation::text
      ) on conflict (clinic_id, channel, dedupe_key) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.create_clinic_member_invitation_for_current_user(uuid,text,text),
  public.accept_clinic_member_invitation_for_current_user(text),
  public.save_appointment_assistant_settings_for_current_user(uuid,boolean,boolean,integer,time,time,boolean)
  from public, anon, authenticated;
grant execute on function public.create_clinic_member_invitation_for_current_user(uuid,text,text),
  public.accept_clinic_member_invitation_for_current_user(text),
  public.save_appointment_assistant_settings_for_current_user(uuid,boolean,boolean,integer,time,time,boolean)
  to authenticated;
revoke all on function public.enqueue_appointment_automation_jobs(),
  public.rebuild_clinic_reminder_jobs(uuid)
  from public, anon, authenticated;
