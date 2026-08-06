-- Calendar email invitation delivery state and concurrency-safe preparation.
-- This migration is forward-only and must be applied by an authorized operator.

alter table public.appointment_invites
  add column if not exists sequence integer not null default 0,
  add column if not exists provider_message_id text,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_method text,
  add column if not exists last_idempotency_key text,
  add column if not exists delivery_status text not null default 'not_sent';

update public.appointment_invites
set ics_uid = appointment_id::text || '@calendar.clinicontrol.mx'
where channel = 'email' and ics_uid is null;

alter table public.appointment_invites
  drop constraint if exists appointment_invites_sequence_non_negative,
  add constraint appointment_invites_sequence_non_negative check (sequence >= 0),
  drop constraint if exists appointment_invites_last_method_check,
  add constraint appointment_invites_last_method_check
    check (last_method is null or last_method in ('REQUEST', 'CANCEL')),
  drop constraint if exists appointment_invites_delivery_status_check,
  add constraint appointment_invites_delivery_status_check
    check (delivery_status in ('not_sent', 'pending', 'sent', 'failed', 'delivery_unknown', 'missing_recipient', 'disabled')),
  drop constraint if exists appointment_invites_provider_message_id_length_check,
  add constraint appointment_invites_provider_message_id_length_check
    check (provider_message_id is null or char_length(provider_message_id) <= 255),
  drop constraint if exists appointment_invites_idempotency_key_length_check,
  add constraint appointment_invites_idempotency_key_length_check
    check (last_idempotency_key is null or char_length(last_idempotency_key) between 1 and 255),
  drop constraint if exists appointment_invites_failed_reason_length_check,
  add constraint appointment_invites_failed_reason_length_check
    check (failed_reason is null or char_length(failed_reason) <= 64),
  drop constraint if exists appointment_invites_email_uid_required,
  add constraint appointment_invites_email_uid_required
    check (channel <> 'email' or ics_uid is not null);

-- Intentionally fails rather than deleting historical duplicates silently.
create unique index appointment_invites_appointment_email_unique_idx
  on public.appointment_invites(appointment_id)
  where channel = 'email';

create unique index appointment_invites_email_idempotency_key_unique_idx
  on public.appointment_invites(last_idempotency_key)
  where channel = 'email' and last_idempotency_key is not null;

create unique index appointment_invites_email_ics_uid_unique_idx
  on public.appointment_invites(ics_uid)
  where channel = 'email';

create index appointment_invites_email_delivery_status_idx
  on public.appointment_invites(clinic_id, delivery_status, last_attempted_at desc)
  where channel = 'email';

create or replace function public.prepare_appointment_email_invite(
  p_appointment_id uuid,
  p_method text,
  p_idempotency_key text
)
returns table(invite_id uuid, ics_uid text, sequence integer, should_send boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_invite public.appointment_invites%rowtype;
  v_method text := upper(trim(coalesce(p_method, '')));
  v_key text := trim(coalesce(p_idempotency_key, ''));
begin
  if v_method not in ('REQUEST', 'CANCEL') then
    raise exception 'Invalid calendar invitation method.';
  end if;

  if char_length(v_key) < 1 or char_length(v_key) > 255 then
    raise exception 'Invalid calendar invitation idempotency key.';
  end if;

  select a.* into v_appointment
  from public.appointments as a
  where a.id = p_appointment_id;

  if v_appointment.id is null
    or not public.has_clinic_role(v_appointment.clinic_id, array['owner', 'doctor', 'admin']) then
    raise exception 'Appointment is unavailable.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('appointment-email:' || p_appointment_id::text, 0));

  select i.* into v_invite
  from public.appointment_invites as i
  where i.appointment_id = p_appointment_id and i.channel = 'email'
  for update;

  if v_invite.id is null then
    insert into public.appointment_invites (
      clinic_id, appointment_id, patient_id, channel, provider, status, ics_uid,
      sequence, last_method, last_idempotency_key, delivery_status, last_attempted_at
    ) values (
      v_appointment.clinic_id, v_appointment.id, v_appointment.patient_id, 'email', 'resend', 'pending',
      v_appointment.id::text || '@calendar.clinicontrol.mx', 0, v_method, v_key, 'pending', now()
    )
    returning * into v_invite;

    return query select v_invite.id, v_invite.ics_uid, v_invite.sequence, true;
    return;
  end if;

  if v_invite.last_idempotency_key = v_key then
    return query select v_invite.id, v_invite.ics_uid, v_invite.sequence, false;
    return;
  end if;

  update public.appointment_invites as i
  set patient_id = v_appointment.patient_id,
      provider = 'resend',
      status = 'pending',
      sequence = i.sequence + 1,
      last_method = v_method,
      last_idempotency_key = v_key,
      delivery_status = 'pending',
      provider_message_id = null,
      failed_reason = null,
      last_attempted_at = now()
  where i.id = v_invite.id
  returning * into v_invite;

  return query select v_invite.id, v_invite.ics_uid, v_invite.sequence, true;
end;
$$;

revoke all on function public.prepare_appointment_email_invite(uuid, text, text) from public, anon;
grant execute on function public.prepare_appointment_email_invite(uuid, text, text) to authenticated;

comment on function public.prepare_appointment_email_invite(uuid, text, text) is
  'Tenant-authorized, advisory-lock protected preparation for one email calendar invite operation. Repeated idempotency keys never advance sequence or request another send.';
