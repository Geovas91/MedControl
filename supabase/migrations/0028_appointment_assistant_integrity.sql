-- Real, tenant-safe appointment assistant foundation. This migration does not
-- implement external reminders, messaging conversations, schedulers or providers.

do $$
begin
  if exists (
    select 1
    from public.appointments as appointment
    left join public.patients as patient
      on patient.clinic_id = appointment.clinic_id
      and patient.id = appointment.patient_id
    where patient.id is null
  ) then
    raise exception 'Cannot enforce tenant-safe appointments: historical clinic/patient mismatch found.';
  end if;
end;
$$;

alter table public.appointments
  add constraint appointments_clinic_patient_fk
  foreign key (clinic_id, patient_id)
  references public.patients(clinic_id, id)
  on delete cascade;

create index appointments_clinic_starts_id_idx
  on public.appointments(clinic_id, starts_at, id);

create index appointments_clinic_status_starts_id_idx
  on public.appointments(clinic_id, status, starts_at, id);

create index audit_logs_appointment_timeline_idx
  on public.audit_logs(clinic_id, created_at desc, id desc)
  where entity_type = 'appointment';

-- The existing appointment backend performs authenticated inserts and updates.
-- Direct table privileges are necessary for that SECURITY INVOKER path; RLS and
-- the write-entitlement policies remain the authorization boundary.
revoke all privileges on table public.appointments from public, anon, authenticated;
grant select, insert, update on table public.appointments to authenticated;

create or replace function public.protect_appointment_relations()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.clinic_id is distinct from old.clinic_id
    or new.patient_id is distinct from old.patient_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Appointment tenant and patient relationships are immutable.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_appointment_relations() from public, anon, authenticated;

create trigger appointments_protect_relations
before update on public.appointments
for each row execute function public.protect_appointment_relations();

revoke all privileges on table public.bot_settings from public, anon, authenticated;
grant select on table public.bot_settings to authenticated;

drop policy if exists "Clinic owners and admins can read bot settings" on public.bot_settings;
drop policy if exists "Clinic owners and admins can manage bot settings" on public.bot_settings;

create policy "Clinic owners and admins can read assistant settings"
  on public.bot_settings for select
  using (public.has_clinic_role(clinic_id, array['owner', 'admin']));

-- No authenticated role writes this legacy table directly. The RPC below derives
-- authorization from auth.uid(), validates the tenant and exposes only the fields
-- used by the internal assistant configuration.
create or replace function public.save_appointment_assistant_settings_for_current_user(
  p_clinic_id uuid,
  p_enabled boolean,
  p_reminder_hours_before integer,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null
)
returns table (
  enabled boolean,
  reminder_hours_before integer,
  quiet_hours_start time,
  quiet_hours_end time,
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

  if p_enabled is null
    or p_reminder_hours_before not between 1 and 168
    or ((p_quiet_hours_start is null) <> (p_quiet_hours_end is null)) then
    raise exception 'Invalid assistant settings.' using errcode = '22023';
  end if;

  return query
  insert into public.bot_settings as settings (
    clinic_id,
    enabled,
    channel,
    reminder_hours_before,
    quiet_hours_start,
    quiet_hours_end,
    max_reminders_per_patient,
    message_template,
    escalation_behavior
  ) values (
    p_clinic_id,
    p_enabled,
    'none',
    p_reminder_hours_before,
    p_quiet_hours_start,
    p_quiet_hours_end,
    1,
    null,
    'none'
  )
  on conflict (clinic_id) do update
  set enabled = excluded.enabled,
      reminder_hours_before = excluded.reminder_hours_before,
      quiet_hours_start = excluded.quiet_hours_start,
      quiet_hours_end = excluded.quiet_hours_end
  returning settings.enabled, settings.reminder_hours_before,
    settings.quiet_hours_start, settings.quiet_hours_end, settings.updated_at;
end;
$$;

revoke all on function public.save_appointment_assistant_settings_for_current_user(uuid, boolean, integer, time, time)
  from public, anon;
grant execute on function public.save_appointment_assistant_settings_for_current_user(uuid, boolean, integer, time, time)
  to authenticated;

comment on function public.save_appointment_assistant_settings_for_current_user(uuid, boolean, integer, time, time) is
  'Owner/admin-only persistence for internal appointment assistant preferences. It does not schedule or send reminders.';

-- bot_logs has no production writer. Removing direct access prevents clients from
-- manufacturing conversation or reminder history while the table remains for compatibility.
revoke all privileges on table public.bot_logs from public, anon, authenticated;

create or replace function public.audit_appointment_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
begin
  if old.status is distinct from new.status then
    v_action := case new.status
      when 'confirmed' then 'appointment_confirmed'
      when 'waiting' then 'appointment_waiting'
      when 'completed' then 'appointment_completed'
      when 'cancelled' then 'appointment_cancelled'
      when 'scheduled' then 'appointment_restored'
      else null
    end;
  elsif old.starts_at is distinct from new.starts_at
    or old.ends_at is distinct from new.ends_at
    or old.doctor_id is distinct from new.doctor_id
    or old.location is distinct from new.location
    or old.meeting_url is distinct from new.meeting_url then
    v_action := 'appointment_rescheduled';
  end if;

  if v_action is not null then
    insert into public.audit_logs (
      clinic_id, actor_user_id, entity_type, entity_id, action, metadata
    ) values (
      new.clinic_id, auth.uid(), 'appointment', new.id, v_action, '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_appointment_schedule_change() from public, anon, authenticated;

create trigger appointments_audit_schedule_change
after update on public.appointments
for each row execute function public.audit_appointment_schedule_change();

create or replace function public.list_appointment_assistant_activity_for_current_user(
  p_clinic_id uuid,
  p_before_occurred_at timestamptz default null,
  p_before_event_id uuid default null,
  p_limit integer default 11
)
returns table (
  event_id uuid,
  event_source text,
  action text,
  appointment_id uuid,
  patient_name text,
  appointment_title text,
  channel text,
  delivery_status text,
  occurred_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with authorized_clinic as (
    select p_clinic_id as clinic_id
    where public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor', 'assistant'])
  ),
  safe_events as (
    select
      appointment.id as event_id,
      'appointment'::text as event_source,
      'appointment_created'::text as action,
      appointment.id as appointment_id,
      patient.full_name as patient_name,
      appointment.title as appointment_title,
      null::text as channel,
      null::text as delivery_status,
      appointment.created_at as occurred_at
    from authorized_clinic
    join public.appointments as appointment using (clinic_id)
    join public.patients as patient
      on patient.clinic_id = appointment.clinic_id
      and patient.id = appointment.patient_id

    union all

    select
      log.id,
      'audit_log'::text,
      log.action,
      appointment.id,
      patient.full_name,
      appointment.title,
      null::text,
      null::text,
      log.created_at
    from authorized_clinic
    join public.audit_logs as log using (clinic_id)
    join public.appointments as appointment
      on appointment.clinic_id = log.clinic_id
      and appointment.id = log.entity_id
    join public.patients as patient
      on patient.clinic_id = appointment.clinic_id
      and patient.id = appointment.patient_id
    where log.entity_type = 'appointment'
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
      appointment.title,
      invitation.channel,
      invitation.delivery_status,
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
    where invitation.channel = 'email'
      and invitation.delivery_status in ('sent', 'failed', 'delivery_unknown')
  )
  select
    event.event_id,
    event.event_source,
    event.action,
    event.appointment_id,
    event.patient_name,
    event.appointment_title,
    event.channel,
    event.delivery_status,
    event.occurred_at
  from safe_events as event
  where (
    (p_before_occurred_at is null and p_before_event_id is null)
    or (
      p_before_occurred_at is not null
      and p_before_event_id is not null
      and (event.occurred_at, event.event_id) < (p_before_occurred_at, p_before_event_id)
    )
  )
  order by event.occurred_at desc, event.event_id desc
  limit least(greatest(coalesce(p_limit, 11), 1), 51);
$$;

revoke all on function public.list_appointment_assistant_activity_for_current_user(uuid, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.list_appointment_assistant_activity_for_current_user(uuid, timestamptz, uuid, integer)
  to authenticated;

comment on function public.list_appointment_assistant_activity_for_current_user(uuid, timestamptz, uuid, integer) is
  'Tenant-authorized, presentation-safe appointment activity cursor. It exposes no audit metadata, messages, responses, provider ids or secrets.';
