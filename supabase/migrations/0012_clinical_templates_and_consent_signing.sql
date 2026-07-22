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

create or replace function public.get_public_consent_for_signing(token_hash text)
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
    select clinics.name, consents.consent_type, consents.consent_version,
      consents.consent_text, consents.signing_token_expires_at
    from public.consents
    join public.clinics on clinics.id = consents.clinic_id
    where consents.signing_token_hash = token_hash
      and consents.status = 'pending'
      and consents.signing_token_used_at is null
      and consents.signing_token_revoked_at is null
      and consents.signing_token_expires_at > now();
end;
$$;

create or replace function public.sign_public_consent(
  token_hash text,
  signer_name text,
  signature_png text,
  accepted_privacy boolean,
  accepted_sensitive_data boolean
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.consents%rowtype;
begin
  if length(signer_name) < 2 or length(signer_name) > 160
    or not accepted_privacy or not accepted_sensitive_data
    or length(signature_png) < 32 or length(signature_png) > 350000
    or signature_png !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    return 'invalid';
  end if;

  select * into target
    from public.consents
    where signing_token_hash = token_hash
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
      update public.consents set status = 'expired' where id = target.id;
    end if;
    return 'invalid';
  end if;

  insert into public.consent_signatures (
    consent_id, patient_id, signer_full_name, signature_data,
    accepted_privacy_notice, accepted_sensitive_data_processing
  ) values (
    target.id, target.patient_id, signer_name, signature_png,
    true, true
  );

  update public.consents
    set status = 'signed', signed_at = now(), signing_token_used_at = now()
    where id = target.id;

  return 'signed';
end;
$$;

revoke all on function public.get_public_consent_for_signing(text) from public;
revoke all on function public.sign_public_consent(text, text, text, boolean, boolean) from public;
grant execute on function public.get_public_consent_for_signing(text) to anon, authenticated;
grant execute on function public.sign_public_consent(text, text, text, boolean, boolean) to anon, authenticated;
