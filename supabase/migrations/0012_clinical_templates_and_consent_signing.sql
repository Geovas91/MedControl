-- Clinical template management and public consent signing.
-- This migration is intentionally not applied by the application.

alter table public.medical_note_templates
  add column if not exists template_kind text not null default 'note'
    check (template_kind in ('note', 'consent'));

alter table public.consents
  add column if not exists template_id uuid references public.medical_note_templates(id) on delete set null,
  add column if not exists signing_token_hash text,
  add column if not exists signing_token_expires_at timestamptz,
  add column if not exists signing_token_used_at timestamptz,
  add column if not exists signing_token_revoked_at timestamptz;

-- Legacy plain-text signing_token values remain readable only to existing database
-- clients until a future maintenance migration removes them. New links never use it.
alter table public.consents alter column signing_token drop not null;
alter table public.consents drop constraint if exists consents_signing_token_key;
drop index if exists public.consents_signing_token_idx;

create unique index if not exists consents_signing_token_hash_unique_idx
  on public.consents(signing_token_hash)
  where signing_token_hash is not null;
create index if not exists consents_signing_token_active_idx
  on public.consents(signing_token_hash, signing_token_expires_at)
  where signing_token_hash is not null and signing_token_used_at is null and signing_token_revoked_at is null;
create index if not exists medical_note_templates_clinic_kind_active_idx
  on public.medical_note_templates(clinic_id, template_kind, is_active);
create index if not exists consents_template_id_idx on public.consents(template_id);

comment on column public.medical_note_templates.template_kind is
  'Compatible minimal classification: note or consent.';
comment on column public.consents.signing_token_hash is
  'SHA-256 hash of the one-time public signing token. Raw tokens are never stored for new links.';

create or replace function public.get_public_consent_for_signing(p_token_hash text)
returns table (
  clinic_name text,
  consent_type text,
  consent_version text,
  consent_text text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    select cl.name, c.consent_type, c.consent_version,
      c.consent_text, c.signing_token_expires_at
    from public.consents as c
    join public.clinics as cl on cl.id = c.clinic_id
    where c.signing_token_hash = p_token_hash
      and c.status = 'pending'
      and c.signing_token_used_at is null
      and c.signing_token_revoked_at is null
      and c.signing_token_expires_at > now();
end;
$$;

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
  encoded_signature text;
  decoded_signature bytea;
  signature_width bigint;
  signature_height bigint;
begin
  -- Reject inexpensive invalid input before locking a consent, but do not decode
  -- or inspect the image until a currently valid token has been locked.
  if p_signer_name is null or length(p_signer_name) < 2 or length(p_signer_name) > 160
    or p_accepted_privacy is not true or p_accepted_sensitive_data is not true
    or p_signature_png is null or octet_length(p_signature_png) > 341358
    or left(p_signature_png, 22) <> 'data:image/png;base64,' then
    return 'invalid';
  end if;

  select c.* into target
    from public.consents as c
    where c.signing_token_hash = p_token_hash
    for update;

  if not found then
    return 'invalid';
  end if;

  if target.status = 'signed' or target.signing_token_used_at is not null then
    return 'already_signed';
  end if;

  if target.status <> 'pending' or target.signing_token_revoked_at is not null
    or target.signing_token_expires_at is null or target.signing_token_expires_at <= now() then
    if target.status = 'pending' and target.signing_token_expires_at <= now() then
      update public.consents as c
        set status = 'expired', signing_token_hash = null, signing_token_expires_at = null
        where c.id = target.id;
    end if;
    return 'invalid';
  end if;

  encoded_signature := substring(p_signature_png from 23);
  if encoded_signature = '' or length(encoded_signature) % 4 <> 0
    or encoded_signature !~ '^[A-Za-z0-9+/]+={0,2}$' then
    return 'invalid';
  end if;

  begin
    decoded_signature := decode(encoded_signature, 'base64');
  exception
    when others then
      return 'invalid';
  end;

  if octet_length(decoded_signature) < 24 or octet_length(decoded_signature) > 256000
    or get_byte(decoded_signature, 0) <> 137
    or get_byte(decoded_signature, 1) <> 80
    or get_byte(decoded_signature, 2) <> 78
    or get_byte(decoded_signature, 3) <> 71
    or get_byte(decoded_signature, 4) <> 13
    or get_byte(decoded_signature, 5) <> 10
    or get_byte(decoded_signature, 6) <> 26
    or get_byte(decoded_signature, 7) <> 10
    or get_byte(decoded_signature, 8) <> 0
    or get_byte(decoded_signature, 9) <> 0
    or get_byte(decoded_signature, 10) <> 0
    or get_byte(decoded_signature, 11) <> 13
    or get_byte(decoded_signature, 12) <> 73
    or get_byte(decoded_signature, 13) <> 72
    or get_byte(decoded_signature, 14) <> 68
    or get_byte(decoded_signature, 15) <> 82 then
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
    consent_id, patient_id, signer_full_name, signature_data,
    accepted_privacy_notice, accepted_sensitive_data_processing
  ) values (
    target.id, target.patient_id, p_signer_name, p_signature_png,
    true, true
  );

  update public.consents as c
    set status = 'signed', signed_at = now(), signing_token_used_at = now()
    where c.id = target.id;

  return 'signed';
end;
$$;

revoke all on function public.get_public_consent_for_signing(text) from public;
revoke all on function public.sign_public_consent(text, text, text, boolean, boolean) from public;
grant execute on function public.get_public_consent_for_signing(text) to anon, authenticated;
grant execute on function public.sign_public_consent(text, text, text, boolean, boolean) to anon, authenticated;
