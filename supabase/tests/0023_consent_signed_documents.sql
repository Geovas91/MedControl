-- Run after a local `supabase db reset`.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
declare
  v_evidence regprocedure := 'public.get_signed_consent_evidence_for_current_user(uuid,uuid,uuid)'::regprocedure;
begin
  if not exists (select 1 from storage.buckets where id = 'consent-pdfs' and public is false) then
    raise exception 'Private consent-pdfs bucket is missing';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%consent-pdfs%' or with_check ilike '%consent-pdfs%')) then
    raise exception 'consent-pdfs unexpectedly has a client object policy';
  end if;
  if has_table_privilege('authenticated', 'public.consent_signed_snapshots', 'insert')
    or has_table_privilege('authenticated', 'public.consent_signed_snapshots', 'select')
    or has_table_privilege('authenticated', 'public.consent_signed_snapshots', 'update')
    or has_table_privilege('authenticated', 'public.consent_signed_snapshots', 'delete')
    or has_table_privilege('authenticated', 'public.consent_documents', 'insert')
    or has_table_privilege('authenticated', 'public.consent_documents', 'update')
    or has_table_privilege('authenticated', 'public.consent_documents', 'delete') then
    raise exception 'Authenticated retains direct signed-document writes';
  end if;
  if not has_function_privilege('authenticated', v_evidence, 'execute')
    or has_function_privilege('anon', v_evidence, 'execute') then
    raise exception 'Evidence RPC grants are unsafe';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = v_evidence::oid and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
  ) then raise exception 'Evidence RPC lacks SECURITY DEFINER fixed search_path'; end if;
end
$$;

insert into auth.users(id, email) values
  ('71000000-0000-4000-8000-000000000001', 'documents-doctor-a@example.test'),
  ('71000000-0000-4000-8000-000000000002', 'documents-assistant-a@example.test'),
  ('71000000-0000-4000-8000-000000000003', 'documents-doctor-b@example.test'),
  ('71000000-0000-4000-8000-000000000004', 'documents-outsider@example.test'),
  ('71000000-0000-4000-8000-000000000005', 'documents-owner-a@example.test'),
  ('71000000-0000-4000-8000-000000000006', 'documents-admin-a@example.test');

insert into public.clinics(id, name, timezone) values
  ('72000000-0000-4000-8000-000000000001', 'Clínica Documento A', 'America/Mexico_City'),
  ('72000000-0000-4000-8000-000000000002', 'Clínica Documento B', 'America/Cancun');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'doctor', 'active'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'assistant', 'active'),
  ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003', 'doctor', 'active'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000005', 'owner', 'active'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000006', 'admin', 'active');

insert into public.patients(id, clinic_id, full_name, first_names, paternal_surname, internal_identifier, status) values
  ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Paciente Álvarez', 'Paciente', 'Álvarez', 'PAC-DOCUMENT1', 'active'),
  ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', 'Paciente Cruz', 'Paciente', 'Cruz', 'PAC-DOCUMENT2', 'active');

insert into public.clinical_records(id, clinic_id, patient_id, status) values
  ('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', 'active'),
  ('74000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002', 'active');

insert into public.consents(
  id, clinic_id, patient_id, clinical_record_id, consent_type, consent_version,
  consent_text, signing_token, signing_token_hash, signing_token_expires_at, status
) values (
  '75000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  'Consentimiento de cirugía', 'v1', 'Texto firmado con español, acentos y ñ.',
  null, repeat('c', 64), now() + interval '1 day', 'pending'
);

set local role anon;
do $$
declare
  v_png text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
begin
  if public.sign_public_consent(repeat('c', 64), 'María Firmante', v_png, true, true) <> 'signed' then
    raise exception 'Test consent could not be signed';
  end if;
end
$$;
reset role;

do $$
declare
  v_snapshot public.consent_signed_snapshots%rowtype;
  v_document public.consent_documents%rowtype;
begin
  select * into strict v_snapshot from public.consent_signed_snapshots
    where consent_id = '75000000-0000-4000-8000-000000000001';
  select * into strict v_document from public.consent_documents
    where consent_id = '75000000-0000-4000-8000-000000000001';
  if v_snapshot.snapshot_source <> 'realtime'
    or v_snapshot.clinic_name <> 'Clínica Documento A'
    or v_snapshot.clinic_timezone <> 'America/Mexico_City'
    or v_snapshot.patient_display_name <> 'Paciente Álvarez'
    or v_snapshot.consent_text <> 'Texto firmado con español, acentos y ñ.'
    or v_snapshot.signer_full_name <> 'María Firmante' then
    raise exception 'Realtime snapshot did not freeze exact evidence';
  end if;
  if v_document.status <> 'pending'
    or v_document.storage_bucket <> 'consent-pdfs'
    or v_document.storage_path <> v_document.clinic_id::text || '/' || v_document.consent_id::text || '/' || v_document.id::text || '.pdf'
    or v_document.sha256 is not null then
    raise exception 'Automatic pending document metadata is invalid';
  end if;
  begin
    update public.consent_signed_snapshots set signer_full_name = 'Alterado' where id = v_snapshot.id;
    raise exception 'Snapshot update was allowed';
  exception when check_violation then null; end;
  begin
    delete from public.consent_signed_snapshots where id = v_snapshot.id;
    raise exception 'Snapshot delete was allowed';
  exception when check_violation then null; end;

  update public.consent_documents set status = 'ready', sha256 = repeat('d', 64), size_bytes = 123,
    generated_at = now(), last_error_code = null where id = v_document.id;
  begin
    update public.consent_documents set sha256 = repeat('e', 64) where id = v_document.id;
    raise exception 'Ready document hash was changed';
  exception when check_violation then null; end;
  begin
    delete from public.consent_documents where id = v_document.id;
    raise exception 'Ready document was deleted';
  exception when check_violation then null; end;
  begin
    update public.consents set consent_text = 'Alterado' where id = v_snapshot.consent_id;
    raise exception 'Signed consent was modified';
  exception when check_violation then null; end;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
do $$
declare v_count bigint;
begin
  select count(*) into v_count from public.get_signed_consent_evidence_for_current_user(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001'
  ) where signature_data like 'data:image/png;base64,%' and document_status = 'ready';
  if v_count <> 1 then raise exception 'Authorized doctor could not read exact signed evidence'; end if;
end
$$;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
do $$
begin
  if (select count(*) from public.get_signed_consent_evidence_for_current_user(
    '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001'
  )) <> 1 then raise exception 'Owner could not read evidence'; end if;
end
$$;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000006', true);
do $$
begin
  if (select count(*) from public.get_signed_consent_evidence_for_current_user(
    '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001'
  )) <> 1 then raise exception 'Admin could not read evidence'; end if;
end
$$;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform * from public.get_signed_consent_evidence_for_current_user(
      '72000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001'
    );
    raise exception 'Assistant read signature evidence';
  exception when insufficient_privilege then null; end;
end
$$;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform * from public.get_signed_consent_evidence_for_current_user(
      '72000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001'
    );
    raise exception 'Outsider read signature evidence';
  exception when insufficient_privilege then null; end;
end
$$;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.consent_documents where consent_id = '75000000-0000-4000-8000-000000000001') then
    raise exception 'Cross-tenant RLS exposed signed documents';
  end if;
  begin
    perform * from public.get_signed_consent_evidence_for_current_user(
      '72000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001'
    );
    raise exception 'Cross-tenant evidence RPC succeeded';
  exception when insufficient_privilege then null; end;
end
$$;
reset role;

-- Migration 0023 itself aborts before backfill on ambiguous signed evidence and
-- inserts legacy_backfill snapshots for every pre-existing valid signed row.
-- This post-migration invariant proves no signed legacy row can be left behind.
do $$
begin
  if exists (
    select 1 from public.consents as consent
    where consent.status = 'signed'
      and not exists (select 1 from public.consent_signed_snapshots as snapshot where snapshot.consent_id = consent.id)
  ) then raise exception 'A signed legacy consent lacks a frozen snapshot'; end if;
end
$$;

select extensions.pass('0023 consent signed documents tests passed');
select * from extensions.finish();
rollback;
