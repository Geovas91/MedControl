-- Consent Documents v1: immutable signed evidence and private PDF metadata.
-- PDF rendering and Storage I/O intentionally remain application-side so a
-- document failure can never roll back a valid clinical signature.

create type public.consent_snapshot_source as enum ('realtime', 'legacy_backfill');
create type public.consent_document_status as enum ('pending', 'ready', 'failed');

alter table public.consent_signatures
  add constraint consent_signatures_clinic_id_id_unique unique (clinic_id, id);

create table public.consent_signed_snapshots (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null,
  clinical_record_id uuid not null,
  consent_id uuid not null unique,
  signature_id uuid not null unique,
  clinic_name text not null check (char_length(trim(clinic_name)) between 1 and 240),
  clinic_timezone text not null check (char_length(trim(clinic_timezone)) between 1 and 120),
  patient_display_name text not null check (char_length(trim(patient_display_name)) between 1 and 240),
  consent_type text not null,
  consent_version text not null,
  consent_text text not null,
  issued_at timestamptz not null,
  signer_full_name text not null,
  accepted_privacy_notice boolean not null,
  accepted_sensitive_data_processing boolean not null,
  signed_at timestamptz not null,
  snapshot_source public.consent_snapshot_source not null,
  snapshot_captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint consent_signed_snapshots_clinic_patient_fk
    foreign key (clinic_id, patient_id)
    references public.patients(clinic_id, id) on delete restrict,
  constraint consent_signed_snapshots_record_patient_fk
    foreign key (clinic_id, clinical_record_id, patient_id)
    references public.clinical_records(clinic_id, id, patient_id) on delete restrict,
  constraint consent_signed_snapshots_consent_patient_fk
    foreign key (clinic_id, consent_id, patient_id)
    references public.consents(clinic_id, id, patient_id) on delete restrict,
  constraint consent_signed_snapshots_signature_fk
    foreign key (clinic_id, signature_id)
    references public.consent_signatures(clinic_id, id) on delete restrict,
  constraint consent_signed_snapshots_clinic_id_id_unique unique (clinic_id, id)
);

create table public.consent_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null,
  consent_id uuid not null unique,
  snapshot_id uuid not null unique,
  document_type text not null default 'signed_consent'
    check (document_type = 'signed_consent'),
  status public.consent_document_status not null default 'pending',
  renderer_version text not null default 'consent-pdf-v1'
    check (renderer_version ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  storage_bucket text not null default 'consent-pdfs'
    check (storage_bucket = 'consent-pdfs'),
  storage_path text not null,
  sha256 text,
  size_bytes bigint,
  generated_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consent_documents_clinic_patient_fk
    foreign key (clinic_id, patient_id)
    references public.patients(clinic_id, id) on delete restrict,
  constraint consent_documents_consent_patient_fk
    foreign key (clinic_id, consent_id, patient_id)
    references public.consents(clinic_id, id, patient_id) on delete restrict,
  constraint consent_documents_snapshot_fk
    foreign key (clinic_id, snapshot_id)
    references public.consent_signed_snapshots(clinic_id, id) on delete restrict,
  constraint consent_documents_clinic_id_id_unique unique (clinic_id, id),
  constraint consent_documents_path_format check (
    storage_path = clinic_id::text || '/' || consent_id::text || '/' || id::text || '.pdf'
  ),
  constraint consent_documents_state_check check (
    (
      status = 'pending'
      and sha256 is null and size_bytes is null and generated_at is null
      and last_error_code is null
    )
    or (
      status = 'failed'
      and sha256 is null and size_bytes is null and generated_at is null
      and last_error_code ~ '^[a-z0-9][a-z0-9._-]{1,79}$'
    )
    or (
      status = 'ready'
      and sha256 ~ '^[0-9a-f]{64}$'
      and size_bytes > 0 and generated_at is not null
      and last_error_code is null
    )
  )
);

create index consent_signed_snapshots_clinic_patient_signed_idx
  on public.consent_signed_snapshots(clinic_id, patient_id, signed_at desc);
create index consent_documents_clinic_patient_created_idx
  on public.consent_documents(clinic_id, patient_id, created_at desc);
create index consent_documents_retry_idx
  on public.consent_documents(status, updated_at)
  where status in ('pending', 'failed');

create or replace function public.prevent_consent_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Signed consent snapshots are immutable.' using errcode = '23514';
end;
$$;

create trigger consent_signed_snapshots_prevent_mutation
  before update or delete on public.consent_signed_snapshots
  for each row execute function public.prevent_consent_snapshot_mutation();

create or replace function public.enforce_consent_document_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'ready' then
      raise exception 'Ready consent documents cannot be deleted.' using errcode = '23514';
    end if;
    return old;
  end if;

  if new.clinic_id is distinct from old.clinic_id
    or new.patient_id is distinct from old.patient_id
    or new.consent_id is distinct from old.consent_id
    or new.snapshot_id is distinct from old.snapshot_id
    or new.document_type is distinct from old.document_type
    or new.renderer_version is distinct from old.renderer_version
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.created_at is distinct from old.created_at then
    raise exception 'Consent document identity is immutable.' using errcode = '23514';
  end if;

  if old.status = 'ready' then
    raise exception 'Ready consent document evidence is immutable.' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger consent_documents_enforce_lifecycle
  before update or delete on public.consent_documents
  for each row execute function public.enforce_consent_document_lifecycle();

create or replace function public.capture_signed_consent_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_snapshot_id uuid := gen_random_uuid();
  v_document_id uuid := gen_random_uuid();
  v_consent public.consents%rowtype;
  v_clinic_name text;
  v_clinic_timezone text;
  v_patient_name text;
begin
  select consent.* into strict v_consent
  from public.consents as consent
  where consent.id = new.consent_id
    and consent.clinic_id = new.clinic_id
    and consent.patient_id = new.patient_id;

  select clinic.name, clinic.timezone into strict v_clinic_name, v_clinic_timezone
  from public.clinics as clinic
  where clinic.id = new.clinic_id;

  select patient.full_name into strict v_patient_name
  from public.patients as patient
  where patient.id = new.patient_id
    and patient.clinic_id = new.clinic_id;

  insert into public.consent_signed_snapshots (
    id, clinic_id, patient_id, clinical_record_id, consent_id, signature_id,
    clinic_name, clinic_timezone, patient_display_name, consent_type, consent_version, consent_text, issued_at,
    signer_full_name, accepted_privacy_notice,
    accepted_sensitive_data_processing, signed_at, snapshot_source
  ) values (
    v_snapshot_id, new.clinic_id, new.patient_id, v_consent.clinical_record_id,
    new.consent_id, new.id, v_clinic_name, v_clinic_timezone, v_patient_name,
    v_consent.consent_type, v_consent.consent_version, v_consent.consent_text, v_consent.created_at,
    new.signer_full_name, new.accepted_privacy_notice,
    new.accepted_sensitive_data_processing, new.signed_at, 'realtime'
  ) on conflict (consent_id) do nothing;

  select snapshot.id into v_snapshot_id
  from public.consent_signed_snapshots as snapshot
  where snapshot.consent_id = new.consent_id;

  insert into public.consent_documents (
    id, clinic_id, patient_id, consent_id, snapshot_id, storage_path
  ) values (
    v_document_id, new.clinic_id, new.patient_id, new.consent_id, v_snapshot_id,
    new.clinic_id::text || '/' || new.consent_id::text || '/' || v_document_id::text || '.pdf'
  ) on conflict (consent_id) do nothing;

  return new;
end;
$$;

create trigger consent_signatures_capture_signed_snapshot
  after insert on public.consent_signatures
  for each row execute function public.capture_signed_consent_snapshot();

-- A legacy snapshot preserves the signed fields that already existed. Clinic and
-- patient display names are explicitly current-at-backfill labels, not assertions
-- about what those labels were at the original signing instant.
do $$
declare
  v_invalid_count bigint;
  v_first_consent uuid;
begin
  select count(*), min(consent.id::text)::uuid
    into v_invalid_count, v_first_consent
  from public.consents as consent
  where consent.status = 'signed'
    and (
      consent.signed_at is null
      or (select count(*) from public.consent_signatures as signature
          where signature.clinic_id = consent.clinic_id
            and signature.patient_id = consent.patient_id
            and signature.consent_id = consent.id) <> 1
      or not exists (
        select 1 from public.clinical_records as record
        where record.clinic_id = consent.clinic_id
          and record.patient_id = consent.patient_id
          and record.id = consent.clinical_record_id
      )
      or exists (
        select 1 from public.consent_signatures as signature
        where signature.consent_id = consent.id
          and (
            signature.signature_data is null
            or left(signature.signature_data, 22) <> 'data:image/png;base64,'
            or substring(signature.signature_data from 23) = ''
            or length(substring(signature.signature_data from 23)) % 4 <> 0
            or substring(signature.signature_data from 23) !~ '^[A-Za-z0-9+/]+={0,2}$'
            or octet_length(decode(substring(signature.signature_data from 23), 'base64')) < 24
            or substring(decode(substring(signature.signature_data from 23), 'base64') from 1 for 16)
              <> decode('89504e470d0a1a0a0000000d49484452', 'hex')
            or trim(signature.signer_full_name) = ''
          )
      )
    );

  if v_invalid_count > 0 then
    raise exception
      'Migration 0023 cannot freeze ambiguous signed evidence: % consent(s) are invalid; first consent_id=%',
      v_invalid_count, v_first_consent;
  end if;
end
$$;

insert into public.consent_signed_snapshots (
  clinic_id, patient_id, clinical_record_id, consent_id, signature_id,
  clinic_name, clinic_timezone, patient_display_name, consent_type, consent_version, consent_text, issued_at,
  signer_full_name, accepted_privacy_notice,
  accepted_sensitive_data_processing, signed_at, snapshot_source
)
select consent.clinic_id, consent.patient_id, consent.clinical_record_id,
  consent.id, signature.id, clinic.name, clinic.timezone, patient.full_name,
  consent.consent_type, consent.consent_version, consent.consent_text, consent.created_at,
  signature.signer_full_name, signature.accepted_privacy_notice,
  signature.accepted_sensitive_data_processing, signature.signed_at,
  'legacy_backfill'::public.consent_snapshot_source
from public.consents as consent
join public.consent_signatures as signature
  on signature.clinic_id = consent.clinic_id
 and signature.patient_id = consent.patient_id
 and signature.consent_id = consent.id
join public.clinics as clinic on clinic.id = consent.clinic_id
join public.patients as patient
  on patient.clinic_id = consent.clinic_id and patient.id = consent.patient_id
where consent.status = 'signed'
on conflict (consent_id) do nothing;

insert into public.consent_documents (
  id, clinic_id, patient_id, consent_id, snapshot_id, storage_path
)
select generated.id, snapshot.clinic_id, snapshot.patient_id, snapshot.consent_id,
  snapshot.id,
  snapshot.clinic_id::text || '/' || snapshot.consent_id::text || '/' || generated.id::text || '.pdf'
from public.consent_signed_snapshots as snapshot
cross join lateral (select gen_random_uuid() as id where snapshot.id is not null) as generated
on conflict (consent_id) do nothing;

do $$
declare
  v_missing_count bigint;
  v_first_consent uuid;
begin
  select count(*), min(consent.id::text)::uuid
    into v_missing_count, v_first_consent
  from public.consents as consent
  where consent.status = 'signed'
    and (
      not exists (select 1 from public.consent_signed_snapshots as snapshot where snapshot.consent_id = consent.id)
      or not exists (select 1 from public.consent_documents as document where document.consent_id = consent.id)
    );
  if v_missing_count > 0 then
    raise exception 'Migration 0023 left % signed consent(s) without document evidence; first consent_id=%',
      v_missing_count, v_first_consent;
  end if;
end
$$;

alter table public.consent_signed_snapshots enable row level security;
alter table public.consent_documents enable row level security;

create policy "Clinical roles can read signed consent snapshots"
  on public.consent_signed_snapshots for select
  using (public.has_clinic_role(clinic_id, array['owner', 'admin', 'doctor']));
create policy "Clinical roles can read consent documents"
  on public.consent_documents for select
  using (public.has_clinic_role(clinic_id, array['owner', 'admin', 'doctor']));

revoke all on table public.consent_signed_snapshots, public.consent_documents
  from anon, authenticated;
grant select (id, clinic_id, patient_id, consent_id, document_type, status,
  renderer_version, generated_at, created_at, updated_at)
  on public.consent_documents to authenticated;

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
    or not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor']) then
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

revoke all on function public.get_signed_consent_evidence_for_current_user(uuid,uuid,uuid)
  from public, anon;
grant execute on function public.get_signed_consent_evidence_for_current_user(uuid,uuid,uuid)
  to authenticated;

-- Storage remains private and has no authenticated object policies. The service
-- role is used only after an application-side membership and tenant check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consent-pdfs', 'consent-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'consent-pdfs' and name = 'consent-pdfs' and public is false
  ) then
    raise exception 'The consent-pdfs bucket must exist and remain private.';
  end if;
end
$$;

comment on table public.consent_signed_snapshots is
  'Immutable evidence frozen at signature insertion. Legacy display names are current-at-backfill labels.';
comment on table public.consent_documents is
  'Private final PDF metadata. Storage bytes are never directly exposed to authenticated clients.';
comment on function public.get_signed_consent_evidence_for_current_user(uuid,uuid,uuid) is
  'Tenant-safe owner/admin/doctor access to the minimum signed evidence required by detail and PDF rendering.';
