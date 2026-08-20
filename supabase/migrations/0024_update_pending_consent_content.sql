-- Creation persists the exact snapshot submitted by the clinician. A selected
-- reusable template is validated and referenced, but never reread as the
-- authoritative content after the clinician has edited the form.
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
  if not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor'])
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

-- Allow explicit edits to an issued consent snapshot only while it is pending
-- and has no active signing link. Reusable templates are never updated here.
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
  if not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor'])
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

revoke all on function public.update_pending_consent_for_current_user(uuid,uuid,uuid,text,text,text,timestamptz)
  from public, anon;
grant execute on function public.update_pending_consent_for_current_user(uuid,uuid,uuid,text,text,text,timestamptz)
  to authenticated;

comment on function public.update_pending_consent_for_current_user(uuid,uuid,uuid,text,text,text,timestamptz) is
  'Updates an issued pending consent snapshot with optimistic locking. Active signing links and immutable states must be resolved first.';

-- Token issuance also uses the displayed row version. This closes the race in
-- which another session saves different content after the page was rendered.
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
    or not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor'])
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

-- The unversioned RPC cannot prove that the doctor is viewing the current text.
revoke all on function public.issue_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamptz)
  from authenticated;
revoke all on function public.issue_current_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamptz,timestamptz)
  from public, anon;
grant execute on function public.issue_current_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamptz,timestamptz)
  to authenticated;

comment on function public.issue_current_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamptz,timestamptz) is
  'Issues or rotates a signing link only for the exact pending consent revision displayed to the authenticated clinician.';
