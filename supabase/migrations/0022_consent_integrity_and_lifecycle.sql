-- Consentimiento Digital v1, phase 1: tenant integrity and document lifecycle.
-- This migration intentionally does not add templates, QR, PDF, Storage or rate limiting.

alter table public.consents
  add column if not exists clinical_record_id uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text,
  add column if not exists updated_by uuid references auth.users(id);

-- Every existing consent must resolve to exactly one active universal record.
do $$
declare
  v_invalid_count bigint;
  v_first_consent uuid;
begin
  select count(*), min(c.id::text)::uuid
    into v_invalid_count, v_first_consent
  from public.consents as c
  where (
    select count(*)
    from public.clinical_records as cr
    where cr.clinic_id = c.clinic_id
      and cr.patient_id = c.patient_id
      and cr.status = 'active'
      and cr.archived_at is null
  ) <> 1;

  if v_invalid_count > 0 then
    raise exception
      'Migration 0022 cannot backfill clinical_record_id: % consent(s) do not have exactly one active record; first consent_id=%',
      v_invalid_count, v_first_consent;
  end if;
end
$$;

update public.consents as c
set clinical_record_id = cr.id
from public.clinical_records as cr
where c.clinical_record_id is null
  and cr.clinic_id = c.clinic_id
  and cr.patient_id = c.patient_id
  and cr.status = 'active'
  and cr.archived_at is null;

alter table public.consents
  alter column clinical_record_id set not null,
  add constraint consents_clinic_id_id_patient_id_unique unique (clinic_id, id, patient_id);

-- Replace the historical single-column patient FK with tenant-aware relationships.
alter table public.consents
  drop constraint if exists consents_patient_id_fkey,
  add constraint consents_clinic_patient_fk
    foreign key (clinic_id, patient_id)
    references public.patients(clinic_id, id) on delete restrict,
  add constraint consents_record_patient_fk
    foreign key (clinic_id, clinical_record_id, patient_id)
    references public.clinical_records(clinic_id, id, patient_id) on delete restrict;

create index if not exists consents_clinic_record_idx
  on public.consents(clinic_id, clinical_record_id, created_at desc);

-- Preserve the meaning of legacy rows while limiting all new document states to
-- pending, signed and cancelled. A legacy expired row represented an expired link,
-- not a signed or cancelled legal document, so it returns to pending with no active token.
insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
select c.clinic_id, null, 'consent', c.id, 'consent_legacy_status_migrated',
  jsonb_build_object(
    'previous_status', c.status::text,
    'new_status', case
      when c.signed_at is not null or exists (
        select 1 from public.consent_signatures as signature where signature.consent_id = c.id
      ) then 'signed'
      when c.status = 'expired' then 'pending'
      else 'cancelled'
    end
  )
from public.consents as c
where c.status in ('expired', 'revoked');

update public.consents
set signing_token_hash = null,
    signing_token_expires_at = null,
    signing_token_revoked_at = coalesce(signing_token_revoked_at, expires_at, updated_at),
    signed_at = coalesce(
      signed_at,
      (select min(signature.signed_at) from public.consent_signatures as signature
        where signature.consent_id = consents.id)
    ),
    status = case
      when signed_at is not null or exists (
        select 1 from public.consent_signatures as signature where signature.consent_id = consents.id
      ) then 'signed'::public.consent_status
      else 'pending'::public.consent_status
    end
where status = 'expired';

alter type public.consent_status rename value 'revoked' to 'cancelled';

update public.consents
set status = 'signed',
    signed_at = coalesce(
      signed_at,
      (select min(signature.signed_at) from public.consent_signatures as signature
        where signature.consent_id = consents.id)
    ),
    cancelled_at = null,
    cancelled_by = null,
    cancellation_reason = null
where status = 'cancelled'
  and (
    signed_at is not null
    or exists (
      select 1 from public.consent_signatures as signature where signature.consent_id = consents.id
    )
  );

update public.consents
set cancelled_at = coalesce(revoked_at, updated_at, created_at),
    cancellation_reason = coalesce(cancellation_reason, 'Migrado desde el estado legacy revoked.'),
    signing_token_hash = null,
    signing_token_expires_at = null,
    signing_token_revoked_at = coalesce(signing_token_revoked_at, revoked_at, updated_at)
where status = 'cancelled';

alter table public.consents
  add constraint consents_v1_status_check
    check (status in ('pending', 'signed', 'cancelled')),
  add constraint consents_v1_lifecycle_check
    check (
      (status = 'pending' and signed_at is null and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
      or (status = 'signed' and signed_at is not null and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
      or (status = 'cancelled' and signed_at is null and cancelled_at is not null)
    ),
  add constraint consents_cancellation_reason_check
    check (
      cancellation_reason is null
      or (
        cancellation_reason = trim(cancellation_reason)
        and char_length(cancellation_reason) between 1 and 500
      )
    );

alter table public.consent_signatures
  add column if not exists clinic_id uuid;

update public.consent_signatures as signature
set clinic_id = consent.clinic_id
from public.consents as consent
where signature.clinic_id is null
  and consent.id = signature.consent_id;

do $$
declare
  v_duplicate_count bigint;
  v_first_consent uuid;
begin
  select count(*), min(duplicate.consent_id::text)::uuid
    into v_duplicate_count, v_first_consent
  from (
    select consent_id
    from public.consent_signatures
    group by consent_id
    having count(*) > 1
  ) as duplicate;

  if v_duplicate_count > 0 then
    raise exception
      'Migration 0022 cannot enforce one final signature per consent: % consent(s) have duplicate signatures; first consent_id=%',
      v_duplicate_count, v_first_consent;
  end if;
end
$$;

alter table public.consent_signatures
  alter column clinic_id set not null,
  drop constraint if exists consent_signatures_consent_id_fkey,
  drop constraint if exists consent_signatures_patient_id_fkey,
  add constraint consent_signatures_consent_id_unique unique (consent_id),
  add constraint consent_signatures_consent_patient_fk
    foreign key (clinic_id, consent_id, patient_id)
    references public.consents(clinic_id, id, patient_id) on delete restrict,
  add constraint consent_signatures_clinic_patient_fk
    foreign key (clinic_id, patient_id)
    references public.patients(clinic_id, id) on delete restrict;

drop index if exists public.consent_signatures_consent_id_idx;
create index if not exists consent_signatures_clinic_patient_idx
  on public.consent_signatures(clinic_id, patient_id, signed_at desc);

create or replace function public.enforce_consent_v1_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.clinic_id is distinct from old.clinic_id
    or new.patient_id is distinct from old.patient_id
    or new.clinical_record_id is distinct from old.clinical_record_id then
    raise exception 'Consent clinic, patient and clinical record are immutable.' using errcode = '23514';
  end if;

  if old.status = 'signed' then
    if new.status is distinct from old.status
      or new.consent_type is distinct from old.consent_type
      or new.consent_version is distinct from old.consent_version
      or new.consent_text is distinct from old.consent_text
      or new.template_id is distinct from old.template_id
      or new.signed_at is distinct from old.signed_at
      or new.signing_token_hash is distinct from old.signing_token_hash
      or new.signing_token_expires_at is distinct from old.signing_token_expires_at
      or new.signing_token_used_at is distinct from old.signing_token_used_at
      or new.signing_token_revoked_at is distinct from old.signing_token_revoked_at then
      raise exception 'Signed consent evidence is immutable.' using errcode = '23514';
    end if;
  elsif old.status = 'cancelled' then
    if new.status is distinct from old.status
      or new.consent_type is distinct from old.consent_type
      or new.consent_version is distinct from old.consent_version
      or new.consent_text is distinct from old.consent_text
      or new.template_id is distinct from old.template_id
      or new.cancelled_at is distinct from old.cancelled_at
      or new.cancelled_by is distinct from old.cancelled_by
      or new.cancellation_reason is distinct from old.cancellation_reason
      or new.signing_token_hash is distinct from old.signing_token_hash
      or new.signing_token_expires_at is distinct from old.signing_token_expires_at
      or new.signing_token_used_at is distinct from old.signing_token_used_at
      or new.signing_token_revoked_at is distinct from old.signing_token_revoked_at then
      raise exception 'Cancelled consent evidence is immutable.' using errcode = '23514';
    end if;
  elsif old.status = 'pending' then
    if new.status not in ('pending', 'signed', 'cancelled') then
      raise exception 'Invalid consent status transition.' using errcode = '23514';
    end if;
    if new.status = 'signed' and not exists (
      select 1
      from public.consent_signatures as signature
      where signature.clinic_id = old.clinic_id
        and signature.consent_id = old.id
        and signature.patient_id = old.patient_id
    ) then
      raise exception 'A consent cannot become signed without its final signature.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists consents_enforce_v1_lifecycle on public.consents;
create trigger consents_enforce_v1_lifecycle
  before update on public.consents
  for each row execute function public.enforce_consent_v1_lifecycle();

create or replace function public.prevent_consent_signature_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Final consent signatures are immutable.' using errcode = '23514';
end;
$$;

create or replace function public.enforce_consent_signature_insert_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.consent_status;
begin
  select consent.status into v_status
  from public.consents as consent
  where consent.id = new.consent_id;

  if v_status is null or v_status <> 'pending' then
    raise exception 'A final signature can only be added to a pending consent.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists consent_signatures_enforce_insert_state on public.consent_signatures;
create trigger consent_signatures_enforce_insert_state
  before insert on public.consent_signatures
  for each row execute function public.enforce_consent_signature_insert_state();

drop trigger if exists consent_signatures_prevent_mutation on public.consent_signatures;
create trigger consent_signatures_prevent_mutation
  before update or delete on public.consent_signatures
  for each row execute function public.prevent_consent_signature_mutation();

-- Creation is atomic: the active record and actor are derived and checked in the database.
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
  v_type text := trim(coalesce(p_consent_type, ''));
  v_version text := trim(coalesce(p_consent_version, ''));
  v_text text := trim(coalesce(p_consent_text, ''));
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor'])
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Not allowed to create consents.' using errcode = '42501';
  end if;
  if char_length(v_type) not between 1 and 160
    or char_length(v_version) not between 1 and 80
    or char_length(v_text) not between 1 and 12000 then
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

-- Transitional hashed-token RPCs keep the current UI functional. The legacy token
-- columns and public token RPCs are scheduled for replacement in migration 0024.
create or replace function public.issue_consent_signing_link_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_consent_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
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
    or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '8 days' then
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
    and consent.status = 'pending';

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
    or not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor']) then
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
    or not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor']) then
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

-- Preserve the current public signature contract, but bind the signature to the
-- tenant and audit the final state. An expired link no longer expires the document.
create or replace function public.sign_public_consent(
  p_token_hash text,
  p_signer_name text,
  p_signature_png text,
  p_accepted_privacy boolean,
  p_accepted_sensitive_data boolean
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.consents%rowtype;
  normalized_signer_name text := trim(coalesce(p_signer_name, ''));
  encoded_signature text;
  decoded_signature bytea;
  signature_width bigint;
  signature_height bigint;
begin
  if length(normalized_signer_name) < 2 or length(normalized_signer_name) > 160
    or p_accepted_privacy is not true or p_accepted_sensitive_data is not true
    or p_signature_png is null or octet_length(p_signature_png) > 341358
    or left(p_signature_png, 22) <> 'data:image/png;base64,' then
    return 'invalid';
  end if;

  select consent.* into target
  from public.consents as consent
  where consent.signing_token_hash = p_token_hash
  for update;

  if not found then
    return 'invalid';
  end if;
  if target.status = 'signed' or target.signing_token_used_at is not null then
    return 'already_signed';
  end if;
  if target.status <> 'pending' or target.signing_token_revoked_at is not null
    or target.signing_token_expires_at is null or target.signing_token_expires_at <= now() then
    return 'invalid';
  end if;

  encoded_signature := substring(p_signature_png from 23);
  if encoded_signature = '' or length(encoded_signature) % 4 <> 0
    or encoded_signature !~ '^[A-Za-z0-9+/]+={0,2}$' then
    return 'invalid';
  end if;
  begin
    decoded_signature := decode(encoded_signature, 'base64');
  exception when others then
    return 'invalid';
  end;
  if octet_length(decoded_signature) < 24 or octet_length(decoded_signature) > 256000
    or substring(decoded_signature from 1 for 16) <> decode('89504e470d0a1a0a0000000d49484452', 'hex') then
    return 'invalid';
  end if;

  signature_width := get_byte(decoded_signature, 16)::bigint * 16777216
    + get_byte(decoded_signature, 17)::bigint * 65536
    + get_byte(decoded_signature, 18)::bigint * 256
    + get_byte(decoded_signature, 19)::bigint;
  signature_height := get_byte(decoded_signature, 20)::bigint * 16777216
    + get_byte(decoded_signature, 21)::bigint * 65536
    + get_byte(decoded_signature, 22)::bigint * 256
    + get_byte(decoded_signature, 23)::bigint;
  if signature_width = 0 or signature_height = 0
    or signature_width > 1600 or signature_height > 800 then
    return 'invalid';
  end if;

  insert into public.consent_signatures (
    clinic_id, consent_id, patient_id, signer_full_name, signature_data,
    accepted_privacy_notice, accepted_sensitive_data_processing
  ) values (
    target.clinic_id, target.id, target.patient_id, normalized_signer_name, p_signature_png,
    true, true
  );

  update public.consents
  set status = 'signed', signed_at = now(), signing_token_used_at = now(), updated_by = null
  where id = target.id;

  insert into public.audit_logs (
    clinic_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    target.clinic_id, null, 'consent', target.id, 'consent_signed',
    jsonb_build_object('source', 'public_signing_rpc')
  );

  return 'signed';
exception
  when unique_violation then
    return 'already_signed';
end;
$$;

drop policy if exists "Doctors and admins can insert consents" on public.consents;
drop policy if exists "Doctors and admins can update consents" on public.consents;
drop policy if exists "Doctors and admins can insert consent signatures" on public.consent_signatures;
drop policy if exists "Clinical roles can read consent signatures" on public.consent_signatures;
create policy "Clinical roles can read consent signatures" on public.consent_signatures for select
  using (
    exists (
      select 1
      from public.consents as consent
      where consent.id = consent_signatures.consent_id
        and consent.clinic_id = consent_signatures.clinic_id
        and consent.patient_id = consent_signatures.patient_id
        and public.has_clinic_role(consent.clinic_id, array['owner', 'admin', 'doctor'])
    )
  );

-- Restrict legacy plaintext tokens, token hashes and signature images from direct
-- PostgREST reads. All writes now pass through narrowly scoped RPCs.
revoke all on table public.consents, public.consent_signatures from anon, authenticated;
grant select (
  id, clinic_id, patient_id, clinical_record_id, created_by, consent_type,
  consent_version, consent_text, template_id, status, expires_at, signed_at,
  revoked_at, cancelled_at, cancelled_by, cancellation_reason, updated_by,
  signing_token_expires_at, signing_token_used_at, signing_token_revoked_at,
  created_at, updated_at
) on public.consents to authenticated;
grant select (
  id, clinic_id, consent_id, patient_id, signer_full_name,
  accepted_privacy_notice, accepted_sensitive_data_processing, signed_at, created_at
) on public.consent_signatures to authenticated;

revoke all on function public.create_consent_for_current_user(uuid,uuid,text,text,text,uuid) from public, anon;
revoke all on function public.issue_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamptz) from public, anon;
revoke all on function public.revoke_consent_signing_link_for_current_user(uuid,uuid,uuid) from public, anon;
revoke all on function public.cancel_consent_for_current_user(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.create_consent_for_current_user(uuid,uuid,text,text,text,uuid) to authenticated;
grant execute on function public.issue_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.revoke_consent_signing_link_for_current_user(uuid,uuid,uuid) to authenticated;
grant execute on function public.cancel_consent_for_current_user(uuid,uuid,uuid,text) to authenticated;

revoke all on function public.get_public_consent_for_signing(text) from public;
revoke all on function public.sign_public_consent(text,text,text,boolean,boolean) from public;
grant execute on function public.get_public_consent_for_signing(text) to anon, authenticated;
grant execute on function public.sign_public_consent(text,text,text,boolean,boolean) to anon, authenticated;

comment on column public.consents.signing_token is
  'Legacy plaintext token retained for compatibility only. Direct client reads are revoked; remove in migration 0024.';
comment on column public.consents.signing_token_hash is
  'Transitional SHA-256 token hash retained for the current public flow; replace with dedicated token records in migration 0024.';
comment on table public.consents is
  'Consent documents are tenant-bound to patients and universal clinical records. Signed and cancelled evidence is immutable.';
