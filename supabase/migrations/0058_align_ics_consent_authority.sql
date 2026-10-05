-- Shared ICS and consent authority. No data rewrite or RLS changes.

create or replace function public.create_consent_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_type text,
  p_consent_version text,
  p_consent_text text,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_record_id uuid;
  v_consent_id uuid;
  v_type text := coalesce(p_consent_type, '');
  v_version text := coalesce(p_consent_version, '');
  v_text text := coalesce(p_consent_text, '');
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.has_patient_professional_scope(p_clinic_id, p_patient_id)
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Not allowed to create consents.' using errcode = '42501';
  end if;
  if char_length(v_type) > 160 or v_type !~ '[^[:space:]]'
    or char_length(v_version) > 80 or v_version !~ '[^[:space:]]'
    or char_length(v_text) > 12000 or v_text !~ '[^[:space:]]' then
    raise exception 'Invalid consent content.' using errcode = '22023';
  end if;
  if p_template_id is not null and not exists (
    select 1
    from public.medical_note_templates as template
    where template.id = p_template_id
      and template.template_kind = 'consent'
      and template.is_active
      and (template.is_system_template or template.clinic_id = p_clinic_id)
  ) then
    raise exception 'Consent template is unavailable.' using errcode = '22023';
  end if;

  select record.id
    into strict v_record_id
  from public.patients as patient
  join public.clinical_records as record
    on record.clinic_id = patient.clinic_id
   and record.patient_id = patient.id
   and record.status = 'active'
   and record.archived_at is null
  where patient.clinic_id = p_clinic_id
    and patient.id = p_patient_id
    and patient.archived_at is null;

  insert into public.consents (
    clinic_id, patient_id, clinical_record_id, created_by, updated_by,
    consent_type, consent_version, consent_text, template_id, signing_token, status
  ) values (
    p_clinic_id, p_patient_id, v_record_id, v_actor, v_actor,
    v_type, v_version, v_text, p_template_id, null, 'pending'
  )
  returning id into v_consent_id;

  insert into public.audit_logs (
    clinic_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    p_clinic_id, v_actor, 'consent', v_consent_id, 'consent_created',
    jsonb_build_object('phase', 'digital_consent_v1_phase_1')
  );

  return v_consent_id;
exception
  when no_data_found then
    raise exception 'Patient or active clinical record is unavailable.' using errcode = '22023';
  when too_many_rows then
    raise exception 'Patient has more than one active clinical record.' using errcode = '23514';
end;
$$;

create or replace function public.update_pending_consent_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid,
  p_consent_type text,
  p_consent_version text,
  p_consent_text text,
  p_expected_updated_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_consent public.consents%rowtype;
  v_type text := coalesce(p_consent_type, '');
  v_version text := coalesce(p_consent_version, '');
  v_text text := coalesce(p_consent_text, '');
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.has_patient_professional_scope(p_clinic_id, p_patient_id)
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Not allowed to update consents.' using errcode = '42501';
  end if;
  if char_length(v_type) > 160 or v_type !~ '[^[:space:]]'
    or char_length(v_version) > 80 or v_version !~ '[^[:space:]]'
    or char_length(v_text) > 12000
    or v_text !~ '[^[:space:]]'
    or p_expected_updated_at is null then
    raise exception 'Invalid consent content.' using errcode = '22023';
  end if;

  select consent.*
    into v_consent
  from public.consents as consent
  where consent.id = p_consent_id
    and consent.clinic_id = p_clinic_id
    and consent.patient_id = p_patient_id
  for update;

  if not found then return 'not_found'; end if;
  if v_consent.status <> 'pending' then return 'immutable'; end if;
  if v_consent.signing_token_hash is not null
    and v_consent.signing_token_used_at is null
    and v_consent.signing_token_revoked_at is null
    and v_consent.signing_token_expires_at > now() then
    return 'active_link';
  end if;
  if v_consent.updated_at is distinct from p_expected_updated_at then
    return 'stale';
  end if;
  if v_consent.consent_type = v_type
    and v_consent.consent_version = v_version
    and v_consent.consent_text = v_text then
    return 'unchanged';
  end if;

  update public.consents
  set consent_type = v_type,
      consent_version = v_version,
      consent_text = v_text,
      updated_by = v_actor
  where id = v_consent.id;

  insert into public.audit_logs (
    clinic_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_consent.clinic_id, v_actor, 'consent', v_consent.id, 'consent_updated',
    jsonb_build_object(
      'consent_type_changed', v_consent.consent_type is distinct from v_type,
      'consent_version_changed', v_consent.consent_version is distinct from v_version,
      'consent_text_changed', v_consent.consent_text is distinct from v_text
    )
  );

  return 'updated';
end;
$$;

create or replace function public.issue_current_consent_signing_link_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
    or not public.has_patient_professional_scope(p_clinic_id, p_patient_id)
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Not allowed to issue consent signing links.' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '8 days'
    or p_expected_updated_at is null then
    raise exception 'Invalid consent signing link parameters.' using errcode = '22023';
  end if;

  update public.consents as consent
  set signing_token_hash = p_token_hash,
      signing_token_expires_at = p_expires_at,
      signing_token_used_at = null,
      signing_token_revoked_at = null,
      updated_by = v_actor
  where consent.id = p_consent_id
    and consent.clinic_id = p_clinic_id
    and consent.patient_id = p_patient_id
    and consent.status = 'pending'
    and consent.updated_at = p_expected_updated_at;

  return found;
end;
$$;

create or replace function public.revoke_consent_signing_link_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
    or not public.has_patient_professional_scope(p_clinic_id, p_patient_id) then
    raise exception 'Not allowed to revoke consent signing links.' using errcode = '42501';
  end if;

  update public.consents as consent
  set signing_token_hash = null,
      signing_token_expires_at = null,
      signing_token_revoked_at = coalesce(consent.signing_token_revoked_at, now()),
      updated_by = v_actor
  where consent.id = p_consent_id
    and consent.clinic_id = p_clinic_id
    and consent.patient_id = p_patient_id
    and consent.status = 'pending';

  return found;
end;
$$;

create or replace function public.cancel_consent_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_consent public.consents%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor is null
    or not public.has_patient_professional_scope(p_clinic_id, p_patient_id) then
    raise exception 'Not allowed to cancel consents.' using errcode = '42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Cancellation reason is too long.' using errcode = '22023';
  end if;

  select consent.* into v_consent
  from public.consents as consent
  where consent.id = p_consent_id
    and consent.clinic_id = p_clinic_id
    and consent.patient_id = p_patient_id
  for update;

  if not found then
    return 'unavailable';
  end if;
  if v_consent.status = 'cancelled' then
    return 'already_cancelled';
  end if;
  if v_consent.status <> 'pending' then
    return 'invalid_state';
  end if;

  update public.consents
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = v_reason,
      revoked_at = coalesce(revoked_at, now()),
      signing_token_hash = null,
      signing_token_expires_at = null,
      signing_token_revoked_at = coalesce(signing_token_revoked_at, now()),
      updated_by = v_actor
  where id = v_consent.id;

  insert into public.audit_logs (
    clinic_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_consent.clinic_id, v_actor, 'consent', v_consent.id, 'consent_cancelled',
    jsonb_build_object('reason_provided', v_reason is not null)
  );

  return 'cancelled';
end;
$$;

create or replace function public.get_signed_consent_evidence_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid
)
returns table (
  snapshot_id uuid,
  document_id uuid,
  clinic_name text,
  clinic_timezone text,
  patient_display_name text,
  consent_type text,
  consent_version text,
  consent_text text,
  issued_at timestamptz,
  signer_full_name text,
  accepted_privacy_notice boolean,
  accepted_sensitive_data_processing boolean,
  signed_at timestamptz,
  snapshot_source public.consent_snapshot_source,
  signature_data text,
  document_status public.consent_document_status,
  renderer_version text,
  generated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or not public.has_patient_professional_scope(p_clinic_id, p_patient_id) then
    raise exception 'Not allowed to read signed consent evidence.' using errcode = '42501';
  end if;

  return query
  select snapshot.id, document.id, snapshot.clinic_name, snapshot.clinic_timezone,
    snapshot.patient_display_name, snapshot.consent_type, snapshot.consent_version,
    snapshot.consent_text, snapshot.issued_at, snapshot.signer_full_name,
    snapshot.accepted_privacy_notice,
    snapshot.accepted_sensitive_data_processing, snapshot.signed_at,
    snapshot.snapshot_source, signature.signature_data,
    document.status, document.renderer_version, document.generated_at
  from public.consent_signed_snapshots as snapshot
  join public.consent_signatures as signature
    on signature.clinic_id = snapshot.clinic_id
   and signature.id = snapshot.signature_id
   and signature.patient_id = snapshot.patient_id
   and signature.consent_id = snapshot.consent_id
  join public.consent_documents as document
    on document.clinic_id = snapshot.clinic_id
   and document.patient_id = snapshot.patient_id
   and document.consent_id = snapshot.consent_id
   and document.snapshot_id = snapshot.id
  where snapshot.clinic_id = p_clinic_id
    and snapshot.patient_id = p_patient_id
    and snapshot.consent_id = p_consent_id;
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
  if p_operation in ('confirm','reschedule') and not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Appointment subscription is not writable.' using errcode='42501'; end if;
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

-- Scheduling context does not confer clinical patient scope.
create function public.get_appointment_calendar_email_context_for_current_user(p_appointment_id uuid)
returns table(appointment_id uuid, patient_email text, starts_at timestamptz, ends_at timestamptz,
 status public.appointment_status, location text, meeting_url text, doctor_name text,
 clinic_name text, clinic_email text, clinic_timezone text, updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Appointment is unavailable.' using errcode='42501'; end if;
 return query select a.id,p.email,a.starts_at,a.ends_at,a.status,a.location,a.meeting_url,
 (select d.display_name from public.doctor_public_profiles d where d.clinic_id=a.clinic_id and d.profile_id=a.doctor_id order by d.id limit 1),
 c.name,c.email,c.timezone,a.updated_at
 from public.appointments a join public.clinics c on c.id=a.clinic_id
 join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
 where a.id=p_appointment_id and exists (
 select 1 from public.clinic_members m where m.clinic_id=a.clinic_id and m.user_id=auth.uid() and m.status='active'
 and (m.role in ('owner','admin','assistant') or (m.role='doctor' and a.doctor_id=auth.uid())));
end; $$;

create or replace function public.prepare_appointment_email_invite(
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
    or not exists (select 1 from public.clinic_members m where m.clinic_id=v_appointment.clinic_id and m.user_id=auth.uid() and m.status='active' and (m.role in ('owner','admin','assistant') or (m.role='doctor' and v_appointment.doctor_id=auth.uid()))) then
    raise exception 'Appointment is unavailable.' using errcode = '42501';
  end if;

  if (v_method = 'REQUEST' and (v_appointment.status = 'cancelled'
      or not public.clinic_has_write_entitlement(v_appointment.clinic_id)))
    or (v_method = 'CANCEL' and v_appointment.status <> 'cancelled') then
    raise exception 'Calendar delivery is unavailable.' using errcode = '42501';
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

create or replace function public.record_appointment_email_invite_result(
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
    or not exists (select 1 from public.appointments a join public.clinic_members m on m.clinic_id=a.clinic_id where a.id=v_invite.appointment_id and a.clinic_id=v_invite.clinic_id and m.user_id=auth.uid() and m.status='active' and (m.role in ('owner','admin','assistant') or (m.role='doctor' and a.doctor_id=auth.uid()))) then
    raise exception 'Appointment invitation is unavailable.' using errcode = '42501';
  end if;

  if v_invite.delivery_status is distinct from 'pending' or v_invite.status is distinct from 'pending' then
    return false;
  end if;

  if v_invite.sequence is distinct from p_sequence or v_invite.last_idempotency_key is distinct from p_idempotency_key then
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

revoke all on function public.get_appointment_calendar_email_context_for_current_user(uuid) from public, anon;
grant execute on function public.get_appointment_calendar_email_context_for_current_user(uuid) to authenticated;

revoke all on function public.create_consent_for_current_user(uuid,uuid,text,text,text,uuid) from public, anon;
grant execute on function public.create_consent_for_current_user(uuid,uuid,text,text,text,uuid) to authenticated;

revoke all on function public.update_pending_consent_for_current_user(uuid,uuid,uuid,text,text,text,timestamptz) from public, anon;
grant execute on function public.update_pending_consent_for_current_user(uuid,uuid,uuid,text,text,text,timestamptz) to authenticated;

revoke all on function public.issue_current_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.issue_current_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamptz,timestamptz) to authenticated;

revoke all on function public.revoke_consent_signing_link_for_current_user(uuid,uuid,uuid) from public, anon;
grant execute on function public.revoke_consent_signing_link_for_current_user(uuid,uuid,uuid) to authenticated;

revoke all on function public.cancel_consent_for_current_user(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.cancel_consent_for_current_user(uuid,uuid,uuid,text) to authenticated;

revoke all on function public.get_signed_consent_evidence_for_current_user(uuid,uuid,uuid) from public, anon;
grant execute on function public.get_signed_consent_evidence_for_current_user(uuid,uuid,uuid) to authenticated;

revoke all on function public.mutate_appointment_lifecycle_for_current_user(uuid,uuid,text,public.appointment_status,timestamptz,timestamptz) from public, anon;
grant execute on function public.mutate_appointment_lifecycle_for_current_user(uuid,uuid,text,public.appointment_status,timestamptz,timestamptz) to authenticated;

revoke all on function public.prepare_appointment_email_invite(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.prepare_appointment_email_invite(uuid,text,text,timestamptz) to authenticated;

revoke all on function public.record_appointment_email_invite_result(uuid,integer,text,text,text,text) from public, anon;
grant execute on function public.record_appointment_email_invite_result(uuid,integer,text,text,text,text) to authenticated;
