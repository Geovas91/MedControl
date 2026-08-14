-- Restrict calendar invitation writes to validated RPCs and enforce tenant-consistent references.

alter table public.appointments
  add constraint appointments_clinic_id_id_patient_id_unique unique (clinic_id, id, patient_id);

alter table public.appointment_invites
  add constraint appointment_invites_clinic_appointment_patient_fk
  foreign key (clinic_id, appointment_id, patient_id)
  references public.appointments(clinic_id, id, patient_id)
  on delete cascade;

revoke all privileges on table public.appointment_invites from authenticated;

revoke all on function public.prepare_appointment_email_invite(uuid, text, text) from public, anon, authenticated;
drop function public.prepare_appointment_email_invite(uuid, text, text);

create function public.prepare_appointment_email_invite(
  p_appointment_id uuid,
  p_method text,
  p_idempotency_key text,
  p_appointment_version timestamptz
)
returns table(invite_id uuid, ics_uid text, sequence integer, should_send boolean, version_matches boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appointment public.appointments%rowtype;
  v_invite public.appointment_invites%rowtype;
  v_method text := upper(trim(coalesce(p_method, '')));
  v_key text := trim(coalesce(p_idempotency_key, ''));
begin
  if auth.uid() is null then
    raise exception 'Appointment is unavailable.' using errcode = '42501';
  end if;
  if v_method not in ('REQUEST', 'CANCEL') then
    raise exception 'Invalid calendar invitation method.' using errcode = '22023';
  end if;
  if char_length(v_key) < 1 or char_length(v_key) > 255 then
    raise exception 'Invalid calendar invitation idempotency key.' using errcode = '22023';
  end if;
  if p_appointment_version is null then
    raise exception 'Invalid appointment version.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('appointment-email:' || p_appointment_id::text, 0));

  select a.* into v_appointment
  from public.appointments as a
  where a.id = p_appointment_id
  for update;

  if v_appointment.id is null
    or not public.has_clinic_role(v_appointment.clinic_id, array['owner', 'doctor', 'admin'])
    or not public.clinic_has_write_entitlement(v_appointment.clinic_id) then
    raise exception 'Appointment is unavailable.' using errcode = '42501';
  end if;

  if v_appointment.updated_at is distinct from p_appointment_version then
    return query select null::uuid, null::text, 0, false, false;
    return;
  end if;

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

    return query select v_invite.id, v_invite.ics_uid, v_invite.sequence, true, true;
    return;
  end if;

  if v_invite.last_idempotency_key = v_key then
    return query select v_invite.id, v_invite.ics_uid, v_invite.sequence, false, true;
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

  return query select v_invite.id, v_invite.ics_uid, v_invite.sequence, true, true;
end;
$$;

revoke all on function public.prepare_appointment_email_invite(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.prepare_appointment_email_invite(uuid, text, text, timestamptz) to authenticated;

create function public.record_appointment_email_invite_result(
  p_invite_id uuid,
  p_sequence integer,
  p_idempotency_key text,
  p_outcome text,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.appointment_invites%rowtype;
  v_outcome text := trim(coalesce(p_outcome, ''));
begin
  if auth.uid() is null then
    raise exception 'Appointment invitation is unavailable.' using errcode = '42501';
  end if;
  if v_outcome not in ('sent', 'failed', 'delivery_unknown') then
    raise exception 'Invalid appointment invitation outcome.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 1 and 255
    or p_sequence is null
    or p_sequence < 0
    or (p_provider_message_id is not null and char_length(p_provider_message_id) > 255)
    or (p_error_code is not null and char_length(p_error_code) > 64) then
    raise exception 'Invalid appointment invitation result.' using errcode = '22023';
  end if;
  if (v_outcome = 'sent' and (nullif(trim(coalesce(p_provider_message_id, '')), '') is null or p_error_code is not null))
    or (v_outcome <> 'sent' and (p_provider_message_id is not null or nullif(trim(coalesce(p_error_code, '')), '') is null)) then
    raise exception 'Invalid appointment invitation result.' using errcode = '22023';
  end if;

  select i.* into v_invite
  from public.appointment_invites as i
  where i.id = p_invite_id
  for update;

  if v_invite.id is null
    or not public.has_clinic_role(v_invite.clinic_id, array['owner', 'doctor', 'admin'])
    or not public.clinic_has_write_entitlement(v_invite.clinic_id) then
    raise exception 'Appointment invitation is unavailable.' using errcode = '42501';
  end if;

  if v_invite.sequence <> p_sequence or v_invite.last_idempotency_key <> p_idempotency_key then
    return false;
  end if;

  update public.appointment_invites
  set status = case when v_outcome = 'sent' then 'sent'::public.invite_status else 'failed'::public.invite_status end,
      delivery_status = v_outcome,
      provider = 'resend',
      provider_message_id = p_provider_message_id,
      sent_at = case when v_outcome = 'sent' then now() else null end,
      failed_reason = p_error_code
  where id = v_invite.id;

  update public.appointments
  set invite_status = case when v_outcome = 'sent' then 'sent'::public.invite_status else 'failed'::public.invite_status end
  where id = v_invite.appointment_id and clinic_id = v_invite.clinic_id and patient_id = v_invite.patient_id;

  return true;
end;
$$;

revoke all on function public.record_appointment_email_invite_result(uuid, integer, text, text, text, text)
  from public, anon;
grant execute on function public.record_appointment_email_invite_result(uuid, integer, text, text, text, text)
  to authenticated;

comment on function public.prepare_appointment_email_invite(uuid, text, text, timestamptz) is
  'Tenant-authorized preparation with explicit entitlement, appointment version, advisory lock and row lock validation.';
comment on function public.record_appointment_email_invite_result(uuid, integer, text, text, text, text) is
  'Tenant-authorized persistence for the exact prepared appointment email operation.';
