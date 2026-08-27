-- Appointment Assistant v1: persistent, tenant-safe email automation jobs.
-- Jobs contain operational references only. Message payloads, recipients and PHI are loaded just-in-time.

alter table public.bot_settings
  add column reminder_enabled boolean not null default false,
  add column review_request_enabled boolean not null default false;

drop function public.save_appointment_assistant_settings_for_current_user(uuid, boolean, integer, time, time);

create function public.save_appointment_assistant_settings_for_current_user(
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
    or not public.clinic_has_write_entitlement(p_clinic_id) then
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

revoke all on function public.save_appointment_assistant_settings_for_current_user(uuid, boolean, boolean, integer, time, time, boolean)
  from public, anon, authenticated;
grant execute on function public.save_appointment_assistant_settings_for_current_user(uuid, boolean, boolean, integer, time, time, boolean)
  to authenticated;

create table public.appointment_automation_jobs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  appointment_id uuid not null,
  type text not null,
  channel text not null default 'email',
  source_version timestamptz not null,
  generation integer not null default 1,
  scheduled_for timestamptz not null,
  next_attempt_at timestamptz not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  dedupe_key text not null,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  locked_by text,
  last_error_code text,
  processed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_automation_jobs_appointment_fk
    foreign key (clinic_id, appointment_id)
    references public.appointments(clinic_id, id) on delete cascade,
  constraint appointment_automation_jobs_type_check
    check (type in ('reminder_email', 'review_request_email')),
  constraint appointment_automation_jobs_channel_check check (channel = 'email'),
  constraint appointment_automation_jobs_status_check
    check (status in ('pending', 'processing', 'retry_pending', 'succeeded', 'skipped', 'failed', 'cancelled')),
  constraint appointment_automation_jobs_attempts_check
    check (attempts >= 0 and max_attempts between 1 and 10 and attempts <= max_attempts),
  constraint appointment_automation_jobs_generation_check check (generation > 0),
  constraint appointment_automation_jobs_dedupe_check check (char_length(dedupe_key) between 1 and 200),
  constraint appointment_automation_jobs_error_check
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  constraint appointment_automation_jobs_lock_check check (
    (status = 'processing' and locked_at is not null and lease_expires_at is not null and locked_by is not null)
    or (status <> 'processing' and locked_at is null and lease_expires_at is null and locked_by is null)
  ),
  constraint appointment_automation_jobs_dedupe_unique unique (clinic_id, dedupe_key)
);

create index appointment_automation_jobs_due_idx
  on public.appointment_automation_jobs(next_attempt_at, id)
  where status in ('pending', 'retry_pending');
create index appointment_automation_jobs_expired_lease_idx
  on public.appointment_automation_jobs(lease_expires_at, id)
  where status = 'processing';
create index appointment_automation_jobs_clinic_recent_idx
  on public.appointment_automation_jobs(clinic_id, created_at desc, id desc);
create index appointment_automation_jobs_appointment_idx
  on public.appointment_automation_jobs(clinic_id, appointment_id, type, created_at desc);

create trigger appointment_automation_jobs_set_updated_at
before update on public.appointment_automation_jobs
for each row execute function public.set_updated_at();

alter table public.appointment_automation_jobs enable row level security;
revoke all privileges on table public.appointment_automation_jobs from public, anon, authenticated;

create table public.appointment_automation_scheduler_state (
  singleton boolean primary key default true check (singleton),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_status text check (last_status is null or last_status in ('running', 'ok', 'error')),
  last_claimed integer not null default 0 check (last_claimed >= 0),
  last_succeeded integer not null default 0 check (last_succeeded >= 0),
  last_skipped integer not null default 0 check (last_skipped >= 0),
  last_failed integer not null default 0 check (last_failed >= 0),
  updated_at timestamptz not null default now()
);
insert into public.appointment_automation_scheduler_state(singleton) values (true);
alter table public.appointment_automation_scheduler_state enable row level security;
revoke all privileges on table public.appointment_automation_scheduler_state from public, anon, authenticated;

create function public.clinic_has_effective_automation_subscription_internal(p_clinic_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.clinic_subscriptions s
    where s.clinic_id = p_clinic_id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;
revoke all on function public.clinic_has_effective_automation_subscription_internal(uuid) from public, anon, authenticated;

create function public.calculate_appointment_reminder_at(
  p_starts_at timestamptz,
  p_timezone text,
  p_hours_before integer,
  p_quiet_start time,
  p_quiet_end time
)
returns timestamptz
language plpgsql
security invoker
set search_path = public, pg_temp
stable
as $$
declare
  v_candidate timestamptz := p_starts_at - make_interval(hours => p_hours_before);
  v_local timestamp;
  v_date date;
  v_time time;
begin
  if p_quiet_start is null or p_quiet_end is null or p_quiet_start = p_quiet_end then return v_candidate; end if;
  v_local := v_candidate at time zone p_timezone;
  v_date := v_local::date;
  v_time := v_local::time;
  if p_quiet_start < p_quiet_end and v_time >= p_quiet_start and v_time < p_quiet_end then
    v_candidate := (v_date + p_quiet_end) at time zone p_timezone;
  elsif p_quiet_start > p_quiet_end and (v_time >= p_quiet_start or v_time < p_quiet_end) then
    if v_time >= p_quiet_start then v_date := v_date + 1; end if;
    v_candidate := (v_date + p_quiet_end) at time zone p_timezone;
  end if;
  return v_candidate;
end;
$$;
revoke all on function public.calculate_appointment_reminder_at(timestamptz, text, integer, time, time) from public, anon, authenticated;

create function public.enqueue_appointment_automation_jobs()
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
  if not found or not v_settings.enabled or not public.clinic_has_effective_automation_subscription_internal(new.clinic_id) then
    return new;
  end if;

  select timezone into v_timezone from public.clinics where id = new.clinic_id;
  if v_settings.reminder_enabled and new.status in ('scheduled', 'confirmed', 'waiting')
    and (tg_op = 'INSERT' or v_schedule_changed or v_restored) then
    select coalesce(max(job.generation), 0) + 1 into v_generation
    from public.appointment_automation_jobs job
    where job.clinic_id = new.clinic_id and job.appointment_id = new.id and job.type = 'reminder_email';
    v_schedule := public.calculate_appointment_reminder_at(new.starts_at, v_timezone,
      v_settings.reminder_hours_before, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
    if v_schedule < new.starts_at then
      insert into public.appointment_automation_jobs (
        clinic_id, appointment_id, type, source_version, generation,
        scheduled_for, next_attempt_at, dedupe_key
      ) values (
        new.clinic_id, new.id, 'reminder_email', new.starts_at, v_generation,
        v_schedule, greatest(v_schedule, now()),
        'reminder:' || new.id::text || ':' || v_generation::text
      ) on conflict (clinic_id, dedupe_key) do nothing;
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
    ) on conflict (clinic_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_appointment_automation_jobs() from public, anon, authenticated;
create trigger appointments_enqueue_automation_jobs
after insert or update on public.appointments
for each row execute function public.enqueue_appointment_automation_jobs();

create function public.claim_due_appointment_automation_jobs(
  p_worker_id text,
  p_limit integer default 20,
  p_lease_seconds integer default 60
)
returns table (
  id uuid, clinic_id uuid, appointment_id uuid, type text, source_version timestamptz,
  attempts integer, max_attempts integer, scheduled_for timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or p_worker_id !~ '^[a-zA-Z0-9_-]{8,80}$'
    or p_limit not between 1 and 50 or p_lease_seconds not between 15 and 600 then
    raise exception 'Invalid worker claim.' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select job.id from public.appointment_automation_jobs job
    where ((job.status in ('pending', 'retry_pending') and job.next_attempt_at <= now())
      or (job.status = 'processing' and job.lease_expires_at <= now()))
      and job.attempts < job.max_attempts
    order by coalesce(job.lease_expires_at, job.next_attempt_at), job.id
    for update skip locked limit p_limit
  ), claimed as (
    update public.appointment_automation_jobs job
    set status = 'processing', attempts = job.attempts + 1,
        locked_at = now(), lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        locked_by = p_worker_id
    from candidates where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.clinic_id, claimed.appointment_id, claimed.type,
    claimed.source_version, claimed.attempts, claimed.max_attempts, claimed.scheduled_for
  from claimed;
end;
$$;
revoke all on function public.claim_due_appointment_automation_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_automation_jobs(text, integer, integer) to service_role;

create function public.finish_appointment_automation_job(
  p_job_id uuid,
  p_worker_id text,
  p_outcome text,
  p_error_code text default null,
  p_retry_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_job public.appointment_automation_jobs%rowtype;
begin
  if p_outcome not in ('succeeded', 'skipped', 'retry', 'failed')
    or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,64}$') then
    raise exception 'Invalid job outcome.' using errcode = '22023';
  end if;
  select * into v_job from public.appointment_automation_jobs
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id for update;
  if not found then return false; end if;

  if p_outcome = 'retry' and v_job.attempts < v_job.max_attempts and p_retry_at > now() then
    update public.appointment_automation_jobs set status = 'retry_pending', next_attempt_at = p_retry_at,
      last_error_code = p_error_code, locked_at = null, lease_expires_at = null, locked_by = null
    where id = v_job.id;
  else
    update public.appointment_automation_jobs set
      status = case when p_outcome = 'retry' then 'failed' else p_outcome end,
      last_error_code = p_error_code, processed_at = now(),
      locked_at = null, lease_expires_at = null, locked_by = null
    where id = v_job.id;
  end if;
  return true;
end;
$$;
revoke all on function public.finish_appointment_automation_job(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finish_appointment_automation_job(uuid, text, text, text, timestamptz) to service_role;

create function public.get_appointment_automation_context(p_job_id uuid, p_worker_id text)
returns table (
  clinic_id uuid, appointment_id uuid, job_type text, source_version timestamptz,
  appointment_status text, starts_at timestamptz, doctor_user_id uuid,
  clinic_name text, clinic_timezone text, patient_email text,
  doctor_display_name text, valid_subscription boolean,
  assistant_enabled boolean, reminder_enabled boolean, review_request_enabled boolean,
  invitation_exists boolean, review_exists boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select j.clinic_id, j.appointment_id, j.type, a.starts_at, a.status::text, a.starts_at, a.doctor_id,
    c.name, c.timezone, p.email, dpp.display_name,
    public.clinic_has_effective_automation_subscription_internal(j.clinic_id),
    coalesce(bs.enabled, false), coalesce(bs.reminder_enabled, false), coalesce(bs.review_request_enabled, false),
    exists(select 1 from public.review_invitations ri where ri.appointment_id = a.id),
    exists(select 1 from public.doctor_reviews dr where dr.appointment_id = a.id)
  from public.appointment_automation_jobs j
  join public.appointments a on a.clinic_id = j.clinic_id and a.id = j.appointment_id
  join public.clinics c on c.id = j.clinic_id
  join public.patients p on p.clinic_id = j.clinic_id and p.id = a.patient_id
  left join public.bot_settings bs on bs.clinic_id = j.clinic_id
  left join lateral (
    select profile.display_name from public.doctor_public_profiles profile
    join public.clinic_members member on member.id = profile.clinic_member_id
      and member.clinic_id = profile.clinic_id and member.user_id = profile.profile_id
      and member.status = 'active' and member.role in ('owner', 'doctor')
    where profile.clinic_id = j.clinic_id and profile.profile_id = a.doctor_id and profile.is_published
    order by profile.created_at, profile.id limit 1
  ) dpp on true
  where j.id = p_job_id and j.status = 'processing' and j.locked_by = p_worker_id;
$$;
revoke all on function public.get_appointment_automation_context(uuid, text) from public, anon, authenticated;
grant execute on function public.get_appointment_automation_context(uuid, text) to service_role;

alter table public.review_invitations alter column created_by drop not null;
alter table public.review_invitations
  add column automation_job_id uuid references public.appointment_automation_jobs(id) on delete restrict,
  add constraint review_invitations_creator_check check (
    (created_by is not null and automation_job_id is null)
    or (created_by is null and automation_job_id is not null)
  );

create function public.issue_review_invitation_for_automation(p_job_id uuid, p_worker_id text)
returns table (invitation_id uuid, raw_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.appointment_automation_jobs%rowtype;
  v_appointment public.appointments%rowtype;
  v_profile_id uuid;
  v_token text;
  v_invitation_id uuid;
  v_expires timestamptz := now() + interval '14 days';
begin
  select * into v_job from public.appointment_automation_jobs
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id and type = 'review_request_email' for update;
  if not found then return; end if;
  select * into v_appointment from public.appointments
  where clinic_id = v_job.clinic_id and id = v_job.appointment_id and status = 'completed' for update;
  if not found or not public.clinic_has_effective_automation_subscription_internal(v_job.clinic_id)
    or not exists(select 1 from public.bot_settings where clinic_id = v_job.clinic_id and enabled and review_request_enabled)
    or exists(select 1 from public.review_invitations where appointment_id = v_job.appointment_id)
    or exists(select 1 from public.doctor_reviews where appointment_id = v_job.appointment_id) then return; end if;
  select profile.id into v_profile_id from public.doctor_public_profiles profile
  join public.clinic_members member on member.id = profile.clinic_member_id
    and member.clinic_id = profile.clinic_id and member.user_id = profile.profile_id
    and member.status = 'active' and member.role in ('owner', 'doctor')
  where profile.clinic_id = v_job.clinic_id and profile.profile_id = v_appointment.doctor_id and profile.is_published
  order by profile.created_at, profile.id limit 1;
  if v_profile_id is null then return; end if;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.review_invitations (
    clinic_id, patient_id, appointment_id, doctor_user_id, doctor_public_profile_id,
    token_hash, expires_at, created_by, automation_job_id
  ) values (
    v_job.clinic_id, v_appointment.patient_id, v_appointment.id, v_appointment.doctor_id, v_profile_id,
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), v_expires, null, v_job.id
  ) returning id into v_invitation_id;
  insert into public.audit_logs(clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
  values(v_job.clinic_id, null, 'review_invitation', v_invitation_id, 'review_invitation_created',
    jsonb_build_object('source', 'appointment_automation'));
  return query select v_invitation_id, v_token, v_expires;
end;
$$;
revoke all on function public.issue_review_invitation_for_automation(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_review_invitation_for_automation(uuid, text) to service_role;

create function public.record_review_email_result_for_automation(
  p_job_id uuid, p_worker_id text, p_invitation_id uuid, p_sent boolean, p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_clinic_id uuid;
begin
  select clinic_id into v_clinic_id from public.appointment_automation_jobs
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id and type = 'review_request_email';
  if not found then return false; end if;
  update public.review_invitations set delivery_status = case when p_sent then 'sent' else 'failed' end,
    email_sent_at = case when p_sent then now() else email_sent_at end
  where id = p_invitation_id and clinic_id = v_clinic_id and automation_job_id = p_job_id;
  if not found then return false; end if;
  insert into public.audit_logs(clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
  values(v_clinic_id, null, 'review_invitation', p_invitation_id,
    case when p_sent then 'review_email_sent' else 'review_email_failed' end,
    case when p_sent then jsonb_build_object('source', 'appointment_automation')
      else jsonb_build_object('source', 'appointment_automation', 'error_code', left(coalesce(p_error_code, 'provider_error'), 64)) end);
  return true;
end;
$$;
revoke all on function public.record_review_email_result_for_automation(uuid, text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_review_email_result_for_automation(uuid, text, uuid, boolean, text) to service_role;

create function public.record_appointment_automation_heartbeat(
  p_phase text, p_status text default null, p_claimed integer default 0,
  p_succeeded integer default 0, p_skipped integer default 0, p_failed integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_phase = 'start' then
    update public.appointment_automation_scheduler_state set last_started_at = now(), last_status = 'running', updated_at = now();
  elsif p_phase = 'finish' and p_status in ('ok', 'error') then
    update public.appointment_automation_scheduler_state set last_completed_at = now(), last_status = p_status,
      last_claimed = greatest(p_claimed, 0), last_succeeded = greatest(p_succeeded, 0),
      last_skipped = greatest(p_skipped, 0), last_failed = greatest(p_failed, 0), updated_at = now();
  else raise exception 'Invalid heartbeat.' using errcode = '22023'; end if;
  return true;
end;
$$;
revoke all on function public.record_appointment_automation_heartbeat(text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.record_appointment_automation_heartbeat(text, text, integer, integer, integer, integer) to service_role;

create function public.get_appointment_automation_dashboard_for_current_user(p_clinic_id uuid, p_limit integer default 10)
returns table (
  job_id uuid, job_type text, job_status text, scheduled_for timestamptz,
  attempts integer, max_attempts integer, last_error_code text, appointment_id uuid,
  last_scheduler_started_at timestamptz, last_scheduler_completed_at timestamptz, last_scheduler_status text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with authorized as (
    select p_clinic_id clinic_id where public.has_clinic_role(p_clinic_id, array['owner','admin','doctor','assistant'])
  ), heartbeat as (
    select * from public.appointment_automation_scheduler_state where singleton
  )
  select j.id, j.type, j.status, j.scheduled_for, j.attempts, j.max_attempts,
    j.last_error_code, j.appointment_id, h.last_started_at, h.last_completed_at, h.last_status
  from authorized a join public.appointment_automation_jobs j using(clinic_id) cross join heartbeat h
  order by case when j.status in ('pending','retry_pending','processing') then 0 else 1 end,
    j.scheduled_for, j.id limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;
revoke all on function public.get_appointment_automation_dashboard_for_current_user(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_appointment_automation_dashboard_for_current_user(uuid, integer) to authenticated;

create function public.get_appointment_automation_scheduler_status_for_current_user(p_clinic_id uuid)
returns table (
  last_started_at timestamptz, last_completed_at timestamptz, last_status text,
  last_claimed integer, last_succeeded integer, last_skipped integer, last_failed integer
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select state.last_started_at, state.last_completed_at, state.last_status,
    state.last_claimed, state.last_succeeded, state.last_skipped, state.last_failed
  from public.appointment_automation_scheduler_state state
  where state.singleton
    and public.has_clinic_role(p_clinic_id, array['owner','admin','doctor','assistant']);
$$;
revoke all on function public.get_appointment_automation_scheduler_status_for_current_user(uuid) from public, anon, authenticated;
grant execute on function public.get_appointment_automation_scheduler_status_for_current_user(uuid) to authenticated;

comment on table public.appointment_automation_jobs is
  'Persistent operational jobs for appointment email reminders and verified-review requests. Contains no recipient, message payload, token or PHI.';
