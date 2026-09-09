-- Appointment Assistant runner hardening: per-job fencing, renewable leases and durable delivery state.
-- No recipients, message bodies, provider responses, tokens or PHI are persisted here.

alter table public.appointment_automation_jobs
  add column lease_token uuid,
  add column delivery_state text not null default 'not_started',
  add column delivery_accepted_at timestamptz,
  add constraint appointment_automation_jobs_delivery_state_check
    check (delivery_state in ('not_started', 'dispatching', 'accepted', 'persisted', 'failed_before_acceptance', 'uncertain')),
  add constraint appointment_automation_jobs_delivery_accepted_check check (
    (delivery_state in ('accepted', 'persisted') and delivery_accepted_at is not null)
    or (delivery_state not in ('accepted', 'persisted') and delivery_accepted_at is null)
  );

alter table public.appointment_automation_scheduler_state
  add column last_uncertain integer not null default 0 check (last_uncertain >= 0),
  add column last_lost_lease integer not null default 0 check (last_lost_lease >= 0);

drop function public.claim_due_appointment_automation_jobs(text, integer, integer);
create function public.claim_due_appointment_automation_jobs(
  p_worker_id text, p_limit integer default 20, p_lease_seconds integer default 60
)
returns table (
  id uuid, clinic_id uuid, appointment_id uuid, type text, source_version timestamptz,
  attempts integer, max_attempts integer, scheduled_for timestamptz,
  lease_token uuid, delivery_state text
)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or p_worker_id !~ '^[a-zA-Z0-9_-]{8,80}$'
    or p_limit not between 1 and 50 or p_lease_seconds not between 15 and 600 then
    raise exception 'Invalid worker claim.' using errcode = '22023';
  end if;

  update public.appointment_automation_jobs as expired
  set status = 'failed', last_error_code = 'lease_expired', processed_at = now(),
      locked_at = null, lease_expires_at = null, locked_by = null, lease_token = null
  where expired.status = 'processing' and expired.lease_expires_at <= clock_timestamp()
    and expired.attempts >= expired.max_attempts and expired.delivery_state = 'not_started';

  -- A worker that disappeared after beginning a provider call leaves an uncertain delivery.
  -- It is terminalized without another provider call; reconciliation is manual and safe.
  update public.appointment_automation_jobs as expired
  set status = 'failed', delivery_state = 'uncertain', last_error_code = 'delivery_uncertain',
      processed_at = now(), locked_at = null, lease_expires_at = null, locked_by = null, lease_token = null
  where expired.status = 'processing' and expired.lease_expires_at <= clock_timestamp()
    and expired.delivery_state = 'dispatching';

  -- Accepted review delivery is reconciled from its job link without another provider call.
  update public.review_invitations as invitation
  set delivery_status = 'sent', email_sent_at = coalesce(invitation.email_sent_at, expired.delivery_accepted_at)
  from public.appointment_automation_jobs as expired
  where expired.status = 'processing' and expired.lease_expires_at <= clock_timestamp()
    and expired.delivery_state = 'accepted' and expired.type = 'review_request_email'
    and invitation.automation_job_id = expired.id;

  update public.appointment_automation_jobs as expired
  set status = 'failed', delivery_state = 'uncertain', last_error_code = 'review_persistence_uncertain',
      processed_at = now(), locked_at = null, lease_expires_at = null, locked_by = null, lease_token = null
  where expired.status = 'processing' and expired.lease_expires_at <= clock_timestamp()
    and expired.delivery_state = 'accepted' and expired.type = 'review_request_email'
    and not exists (
      select 1 from public.review_invitations invitation
      where invitation.automation_job_id = expired.id and invitation.delivery_status = 'sent'
    );

  -- Accepted deliveries are recoverable without resending: the replacement only persists terminal state.
  update public.appointment_automation_jobs as expired
  set status = 'succeeded', delivery_state = 'persisted', processed_at = now(), last_error_code = null,
      locked_at = null, lease_expires_at = null, locked_by = null, lease_token = null
  where expired.status = 'processing' and expired.lease_expires_at <= clock_timestamp()
    and expired.delivery_state = 'accepted'
    and (expired.type <> 'review_request_email' or exists (
      select 1 from public.review_invitations invitation
      where invitation.automation_job_id = expired.id and invitation.delivery_status = 'sent'
    ));

  return query
  with candidates as (
    select job.id from public.appointment_automation_jobs job
    where ((job.status in ('pending', 'retry_pending') and job.next_attempt_at <= now())
      or (job.status = 'processing' and job.lease_expires_at <= now() and job.delivery_state in ('not_started', 'failed_before_acceptance')))
      and job.attempts < job.max_attempts
    order by coalesce(job.lease_expires_at, job.next_attempt_at), job.id
    for update skip locked limit p_limit
  ), claimed as (
    update public.appointment_automation_jobs job
    set status = 'processing', attempts = job.attempts + 1, locked_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds), locked_by = p_worker_id,
        lease_token = gen_random_uuid(), delivery_state = 'not_started', delivery_accepted_at = null
    from candidates where job.id = candidates.id returning job.*
  )
  select claimed.id, claimed.clinic_id, claimed.appointment_id, claimed.type,
    claimed.source_version, claimed.attempts, claimed.max_attempts, claimed.scheduled_for,
    claimed.lease_token, claimed.delivery_state
  from claimed;
end;
$$;
revoke all on function public.claim_due_appointment_automation_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_automation_jobs(text, integer, integer) to service_role;

create function public.renew_appointment_automation_job_lease(
  p_job_id uuid, p_worker_id text, p_lease_token uuid, p_lease_seconds integer default 90
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_lease_seconds not between 15 and 600 then
    raise exception 'Invalid lease duration.' using errcode = '22023';
  end if;
  update public.appointment_automation_jobs
  set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id
    and lease_token = p_lease_token and lease_expires_at > clock_timestamp();
  return found;
end;
$$;
revoke all on function public.renew_appointment_automation_job_lease(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.renew_appointment_automation_job_lease(uuid, text, uuid, integer) to service_role;

create function public.begin_appointment_automation_delivery(
  p_job_id uuid, p_worker_id text, p_lease_token uuid
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.appointment_automation_jobs
  set delivery_state = 'dispatching'
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id
    and lease_token = p_lease_token and lease_expires_at > clock_timestamp()
    and delivery_state = 'not_started';
  return found;
end;
$$;
revoke all on function public.begin_appointment_automation_delivery(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.begin_appointment_automation_delivery(uuid, text, uuid) to service_role;

create function public.mark_appointment_automation_delivery_accepted(
  p_job_id uuid, p_worker_id text, p_lease_token uuid
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.appointment_automation_jobs
  set delivery_state = 'accepted', delivery_accepted_at = now()
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id
    and lease_token = p_lease_token and lease_expires_at > clock_timestamp()
    and delivery_state = 'dispatching';
  return found;
end;
$$;
revoke all on function public.mark_appointment_automation_delivery_accepted(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mark_appointment_automation_delivery_accepted(uuid, text, uuid) to service_role;

drop function public.finish_appointment_automation_job(uuid, text, text, text, timestamptz);
create function public.finish_appointment_automation_job(
  p_job_id uuid, p_worker_id text, p_lease_token uuid, p_outcome text,
  p_error_code text default null, p_retry_at timestamptz default null
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_job public.appointment_automation_jobs%rowtype;
begin
  if p_outcome not in ('succeeded', 'skipped', 'retry', 'failed')
    or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,64}$') then
    raise exception 'Invalid job outcome.' using errcode = '22023';
  end if;
  select * into v_job from public.appointment_automation_jobs
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id
    and lease_token = p_lease_token and lease_expires_at > clock_timestamp() for update;
  if not found then return false; end if;
  if p_outcome = 'succeeded' and v_job.delivery_state <> 'accepted' then return false; end if;

  if p_outcome = 'retry' and v_job.attempts < v_job.max_attempts and p_retry_at > now() then
    update public.appointment_automation_jobs set status = 'retry_pending', next_attempt_at = p_retry_at,
      delivery_state = 'failed_before_acceptance', last_error_code = p_error_code,
      locked_at = null, lease_expires_at = null, locked_by = null, lease_token = null
    where id = v_job.id;
  else
    update public.appointment_automation_jobs set
      status = case when p_outcome = 'retry' then 'failed' else p_outcome end,
      delivery_state = case when p_outcome = 'succeeded' then 'persisted'
        when p_outcome in ('retry', 'failed') and v_job.delivery_state = 'dispatching' then 'failed_before_acceptance'
        else v_job.delivery_state end,
      last_error_code = p_error_code, processed_at = now(),
      locked_at = null, lease_expires_at = null, locked_by = null, lease_token = null
    where id = v_job.id;
  end if;
  return true;
end;
$$;
revoke all on function public.finish_appointment_automation_job(uuid, text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finish_appointment_automation_job(uuid, text, uuid, text, text, timestamptz) to service_role;

drop function public.get_appointment_automation_context(uuid, text);
create function public.get_appointment_automation_context(p_job_id uuid, p_worker_id text, p_lease_token uuid)
returns table (
  clinic_id uuid, appointment_id uuid, job_type text, source_version timestamptz,
  appointment_status text, starts_at timestamptz, doctor_user_id uuid,
  clinic_name text, clinic_timezone text, patient_email text,
  doctor_display_name text, valid_subscription boolean,
  assistant_enabled boolean, reminder_enabled boolean, review_request_enabled boolean,
  invitation_exists boolean, review_exists boolean
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select j.clinic_id, j.appointment_id, j.type, j.source_version, a.status::text, a.starts_at, a.doctor_id,
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
  where j.id = p_job_id and j.status = 'processing' and j.locked_by = p_worker_id
    and j.lease_token = p_lease_token and j.lease_expires_at > clock_timestamp();
$$;
revoke all on function public.get_appointment_automation_context(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.get_appointment_automation_context(uuid, text, uuid) to service_role;

drop function public.issue_review_invitation_for_automation(uuid, text);
create function public.issue_review_invitation_for_automation(p_job_id uuid, p_worker_id text, p_lease_token uuid)
returns table (invitation_id uuid, raw_token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_job public.appointment_automation_jobs%rowtype; v_appointment public.appointments%rowtype;
  v_profile_id uuid; v_token text; v_invitation_id uuid; v_expires timestamptz := now() + interval '14 days';
begin
  select * into v_job from public.appointment_automation_jobs
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp() and type = 'review_request_email' and delivery_state = 'not_started' for update;
  if not found then return; end if;
  select * into v_appointment from public.appointments
  where clinic_id = v_job.clinic_id and id = v_job.appointment_id and status = 'completed' for update;
  if not found or not public.clinic_has_effective_automation_subscription_internal(v_job.clinic_id)
    or not exists(select 1 from public.bot_settings where clinic_id = v_job.clinic_id and enabled and review_request_enabled)
    or not exists(select 1 from public.patients where clinic_id = v_job.clinic_id and id = v_appointment.patient_id
      and email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$')
    or exists(select 1 from public.review_invitations where appointment_id = v_job.appointment_id)
    or exists(select 1 from public.doctor_reviews where appointment_id = v_job.appointment_id) then return; end if;
  select profile.id into v_profile_id from public.doctor_public_profiles profile
  join public.clinic_members member on member.id = profile.clinic_member_id and member.clinic_id = profile.clinic_id
    and member.user_id = profile.profile_id and member.status = 'active' and member.role in ('owner', 'doctor')
  where profile.clinic_id = v_job.clinic_id and profile.profile_id = v_appointment.doctor_id and profile.is_published
  order by profile.created_at, profile.id limit 1;
  if v_profile_id is null then return; end if;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.review_invitations(clinic_id, patient_id, appointment_id, doctor_user_id,
    doctor_public_profile_id, token_hash, expires_at, created_by, automation_job_id)
  values(v_job.clinic_id, v_appointment.patient_id, v_appointment.id, v_appointment.doctor_id,
    v_profile_id, encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    v_expires, null, v_job.id) returning id into v_invitation_id;
  insert into public.audit_logs(clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
  values(v_job.clinic_id, null, 'review_invitation', v_invitation_id, 'review_invitation_created',
    jsonb_build_object('source', 'appointment_automation'));
  return query select v_invitation_id, v_token, v_expires;
end;
$$;
revoke all on function public.issue_review_invitation_for_automation(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.issue_review_invitation_for_automation(uuid, text, uuid) to service_role;

drop function public.record_review_email_result_for_automation(uuid, text, uuid, boolean, text);
create function public.record_review_email_result_for_automation(
  p_job_id uuid, p_worker_id text, p_lease_token uuid, p_invitation_id uuid,
  p_sent boolean, p_error_code text default null
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_clinic_id uuid;
begin
  if not p_sent and p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'Invalid review delivery outcome.' using errcode = '22023';
  end if;
  select clinic_id into v_clinic_id from public.appointment_automation_jobs
  where id = p_job_id and status = 'processing' and locked_by = p_worker_id and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp() and type = 'review_request_email'
    and delivery_state = case when p_sent then 'accepted' else 'dispatching' end;
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
revoke all on function public.record_review_email_result_for_automation(uuid, text, uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_review_email_result_for_automation(uuid, text, uuid, uuid, boolean, text) to service_role;

drop function public.record_appointment_automation_heartbeat(text, text, integer, integer, integer, integer);
create function public.record_appointment_automation_heartbeat(
  p_phase text, p_status text default null, p_claimed integer default 0,
  p_succeeded integer default 0, p_skipped integer default 0, p_failed integer default 0,
  p_uncertain integer default 0, p_lost_lease integer default 0
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_phase = 'start' then
    update public.appointment_automation_scheduler_state
      set last_started_at = now(), last_status = 'running', updated_at = now() where singleton = true;
  elsif p_phase = 'finish' and p_status in ('ok', 'error') then
    update public.appointment_automation_scheduler_state set last_completed_at = now(), last_status = p_status,
      last_claimed = greatest(p_claimed, 0), last_succeeded = greatest(p_succeeded, 0),
      last_skipped = greatest(p_skipped, 0), last_failed = greatest(p_failed, 0),
      last_uncertain = greatest(p_uncertain, 0), last_lost_lease = greatest(p_lost_lease, 0), updated_at = now()
    where singleton = true;
  else raise exception 'Invalid heartbeat.' using errcode = '22023'; end if;
  return found;
end;
$$;
revoke all on function public.record_appointment_automation_heartbeat(text, text, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.record_appointment_automation_heartbeat(text, text, integer, integer, integer, integer, integer, integer) to service_role;

comment on column public.appointment_automation_jobs.lease_token is 'Per-claim fencing token required by every worker mutation.';
comment on column public.appointment_automation_jobs.delivery_state is 'Durable separation between provider dispatch/acceptance and terminal persistence; contains no payload or PHI.';
