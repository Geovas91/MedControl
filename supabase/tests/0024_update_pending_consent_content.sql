-- Run after a local `supabase db reset`.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
declare
  v_update regprocedure := 'public.update_pending_consent_for_current_user(uuid,uuid,uuid,text,text,text,timestamp with time zone)'::regprocedure;
  v_issue regprocedure := 'public.issue_current_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamp with time zone,timestamp with time zone)'::regprocedure;
  v_legacy_issue regprocedure := 'public.issue_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure;
begin
  if not has_function_privilege('authenticated', v_update, 'execute')
    or not has_function_privilege('authenticated', v_issue, 'execute') then
    raise exception 'Authenticated lacks a required revision-safe consent RPC grant';
  end if;
  if has_function_privilege('anon', v_update, 'execute')
    or has_function_privilege('anon', v_issue, 'execute')
    or has_function_privilege('authenticated', v_legacy_issue, 'execute') then
    raise exception 'Consent update or issuance RPC grants are broader than intended';
  end if;
  if has_table_privilege('authenticated', 'public.consents', 'update') then
    raise exception 'Authenticated retains direct consent update privileges';
  end if;
  if (
    select count(*)
    from pg_proc
    where oid in (v_update::oid, v_issue::oid)
      and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
  ) <> 2 then
    raise exception 'Revision-safe consent RPC security properties are incomplete';
  end if;
end
$$;

insert into auth.users(id, email) values
  ('91000000-0000-4000-8000-000000000001', 'consent-edit-owner-a@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'consent-edit-admin-a@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'consent-edit-doctor-a@example.test'),
  ('91000000-0000-4000-8000-000000000004', 'consent-edit-assistant-a@example.test'),
  ('91000000-0000-4000-8000-000000000005', 'consent-edit-doctor-b@example.test'),
  ('91000000-0000-4000-8000-000000000006', 'consent-edit-outsider@example.test');

insert into public.clinics(id, name) values
  ('92000000-0000-4000-8000-000000000001', 'Consent Edit Clinic A'),
  ('92000000-0000-4000-8000-000000000002', 'Consent Edit Clinic B');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', 'doctor', 'active'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', 'assistant', 'active'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000005', 'doctor', 'active');

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values
  ('92000000-0000-4000-8000-000000000001', 'pro', 'active', 'manual'),
  ('92000000-0000-4000-8000-000000000002', 'pro', 'active', 'manual');

insert into public.patients(
  id, clinic_id, full_name, first_names, paternal_surname, internal_identifier, status
) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'Paciente Edición A', 'Paciente', 'Edición', 'PAC-EDITA001', 'active'),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'Paciente Edición B', 'Paciente', 'Edición', 'PAC-EDITB001', 'active');

insert into public.clinical_records(id, clinic_id, patient_id, status) values
  ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'active'),
  ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002', 'active');

insert into public.medical_note_templates(
  id, clinic_id, name, description, template_schema, is_system_template,
  is_active, template_kind, created_by
) values (
  '96000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'Plantilla original',
  'Plantilla reutilizable para comprobar snapshots',
  jsonb_build_object('content', E'Texto original de plantilla.\nNo debe modificarse.', 'templateKind', 'consent'),
  false, true, 'consent', '91000000-0000-4000-8000-000000000003'
);

create temporary table created_consent_test_ids(consent_id uuid primary key);
grant select, insert on created_consent_test_ids to authenticated;

insert into public.consents(
  id, clinic_id, patient_id, clinical_record_id, consent_type, consent_version,
  consent_text, status, signed_at, cancelled_at, cancelled_by, cancellation_reason,
  signing_token_hash, signing_token_expires_at, updated_at
) values
  ('95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Owner original', 'v1', 'Owner original text', 'pending', null, null, null, null, null, null, '2026-01-01 00:00:01+00'),
  ('95000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Admin original', 'v1', 'Admin original text', 'pending', null, null, null, null, null, null, '2026-01-01 00:00:02+00'),
  ('95000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Doctor original', 'v1', 'Doctor original text', 'pending', null, null, null, null, repeat('e', 64), '2025-01-01 00:00:00+00', '2026-01-01 00:00:03+00'),
  ('95000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Unauthorized original', 'v1', 'Unauthorized original text', 'pending', null, null, null, null, null, null, '2026-01-01 00:00:04+00'),
  ('95000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Link original', 'v1', 'Link original text', 'pending', null, null, null, null, null, null, '2026-01-01 00:00:05+00'),
  ('95000000-0000-4000-8000-000000000006', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Signed original', 'v1', 'Signed immutable text', 'signed', now(), null, null, null, null, null, '2026-01-01 00:00:06+00'),
  ('95000000-0000-4000-8000-000000000007', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Cancelled original', 'v1', 'Cancelled immutable text', 'cancelled', null, now(), '91000000-0000-4000-8000-000000000003', 'Cancelled for test', null, null, '2026-01-01 00:00:07+00'),
  ('95000000-0000-4000-8000-000000000008', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Revision original', 'v1', 'Revision-controlled text', 'pending', null, null, null, null, null, null, '2026-01-01 00:00:08+00'),
  ('95000000-0000-4000-8000-000000000009', '92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002', 'Tenant B original', 'v1', 'Tenant B protected text', 'pending', null, null, null, null, null, null, '2026-01-01 00:00:09+00');

-- Creation uses the exact edited form snapshot, leaves its template untouched,
-- emits no token, and can issue a link immediately from the persisted revision.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
insert into created_consent_test_ids(consent_id)
select public.create_consent_for_current_user(
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  E'  Tipo visible personalizado  ',
  E' v3-clínica ',
  E'  Texto editado antes de crear.  \n\nSegunda línea significativa.\t\n',
  '96000000-0000-4000-8000-000000000001'
);

do $$
declare
  v_consent_id uuid := (select consent_id from created_consent_test_ids);
begin
  if not exists (
    select 1 from public.consents
    where id = v_consent_id
      and clinic_id = '92000000-0000-4000-8000-000000000001'
      and patient_id = '93000000-0000-4000-8000-000000000001'
      and consent_type = E'  Tipo visible personalizado  '
      and consent_version = E' v3-clínica '
      and consent_text = E'  Texto editado antes de crear.  \n\nSegunda línea significativa.\t\n'
      and template_id = '96000000-0000-4000-8000-000000000001'
      and status = 'pending'
  ) then raise exception 'Created consent did not persist the exact visible snapshot'; end if;
end
$$;

reset role;
do $$
declare
  v_consent_id uuid := (select consent_id from created_consent_test_ids);
begin
  if exists (
    select 1 from public.consents
    where id = v_consent_id
      and (signing_token is not null or signing_token_hash is not null
        or signing_token_expires_at is not null or signing_token_used_at is not null
        or signing_token_revoked_at is not null)
  ) then raise exception 'Creating a consent emitted token state'; end if;
  if (select template_schema->>'content' from public.medical_note_templates where id = '96000000-0000-4000-8000-000000000001')
    <> E'Texto original de plantilla.\nNo debe modificarse.' then
    raise exception 'Creating the snapshot modified the reusable template';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_consent_id uuid := (select consent_id from created_consent_test_ids);
  v_revision timestamptz;
  v_public record;
begin
  select updated_at into strict v_revision from public.consents where id = v_consent_id;
  if not public.issue_current_consent_signing_link_for_current_user(
    '92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    v_consent_id, repeat('f', 64), now() + interval '1 day', v_revision
  ) then raise exception 'Newly created clean consent could not issue a link immediately'; end if;

  select * into strict v_public
  from public.get_public_consent_for_signing(repeat('f', 64));
  if v_public.consent_type is distinct from E'  Tipo visible personalizado  '
    or v_public.consent_version is distinct from E' v3-clínica '
    or v_public.consent_text is distinct from E'  Texto editado antes de crear.  \n\nSegunda línea significativa.\t\n' then
    raise exception 'Public URL did not receive the exact created snapshot';
  end if;
end
$$;

set local role anon;
do $$
declare
  v_png text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
begin
  if public.sign_public_consent(repeat('f', 64), 'Paciente Snapshot', v_png, true, true) <> 'signed' then
    raise exception 'Exact created snapshot could not be signed';
  end if;
end
$$;

reset role;
do $$
declare
  v_consent_id uuid := (select consent_id from created_consent_test_ids);
  v_snapshot_id uuid;
begin
  select id into strict v_snapshot_id
  from public.consent_signed_snapshots
  where consent_id = v_consent_id
    and consent_type = E'  Tipo visible personalizado  '
    and consent_version = E' v3-clínica '
    and consent_text = E'  Texto editado antes de crear.  \n\nSegunda línea significativa.\t\n';
  if not exists (
    select 1 from public.consent_documents
    where consent_id = v_consent_id and snapshot_id = v_snapshot_id
  ) then raise exception 'PDF metadata does not reference the exact signed snapshot'; end if;
  if (select template_schema->>'content' from public.medical_note_templates where id = '96000000-0000-4000-8000-000000000001')
    <> E'Texto original de plantilla.\nNo debe modificarse.' then
    raise exception 'Signing the snapshot modified the reusable template';
  end if;
end
$$;

set local role authenticated;

-- Owner, admin and doctor can update an exact pending snapshot revision.
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
do $$ begin
  if public.update_pending_consent_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001', 'Owner updated', 'v2', 'Owner updated text',
    '2026-01-01 00:00:01+00'
  ) <> 'updated' then raise exception 'Owner could not update pending consent'; end if;
end $$;

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
do $$ begin
  if public.update_pending_consent_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000002', 'Admin updated', 'v2', 'Admin updated text',
    '2026-01-01 00:00:02+00'
  ) <> 'updated' then raise exception 'Admin could not update pending consent'; end if;
end $$;

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_exact_text text := E'  Línea uno  \nLínea dos\t\n';
begin
  if public.update_pending_consent_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000003', 'Doctor updated', 'v2', v_exact_text,
    '2026-01-01 00:00:03+00'
  ) <> 'updated' then raise exception 'Doctor could not update pending consent'; end if;
  if (select consent_text from public.consents where id = '95000000-0000-4000-8000-000000000003') is distinct from v_exact_text then
    raise exception 'Consent whitespace or line breaks were not preserved exactly';
  end if;
end
$$;

reset role;
do $$ begin
  if (select consent_text from public.consents where id = '95000000-0000-4000-8000-000000000001') <> 'Owner updated text'
    or (select consent_text from public.consents where id = '95000000-0000-4000-8000-000000000002') <> 'Admin updated text' then
    raise exception 'Owner or admin update was not persisted';
  end if;
  if (select signing_token_hash from public.consents where id = '95000000-0000-4000-8000-000000000003') <> repeat('e', 64)
    or (select signing_token_expires_at from public.consents where id = '95000000-0000-4000-8000-000000000003') <> '2025-01-01 00:00:00+00'::timestamptz
    or (select signing_token_used_at from public.consents where id = '95000000-0000-4000-8000-000000000003') is not null
    or (select signing_token_revoked_at from public.consents where id = '95000000-0000-4000-8000-000000000003') is not null then
    raise exception 'Saving content generated or modified signing token state';
  end if;
end $$;

-- Assistant cannot update, and the failure leaves the row untouched.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000004', true);
do $$ begin
  begin
    perform public.update_pending_consent_for_current_user(
      '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000004', 'Unauthorized changed', 'v2', 'Must not persist',
      '2026-01-01 00:00:04+00'
    );
    raise exception 'Assistant updated a consent';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
  if exists (
    select 1 from public.consents
    where id = '95000000-0000-4000-8000-000000000004'
      and (consent_type <> 'Unauthorized original'
        or consent_version <> 'v1'
        or consent_text <> 'Unauthorized original text'
        or updated_at <> '2026-01-01 00:00:04+00'::timestamptz)
  ) then
    raise exception 'Unauthorized failure partially modified the consent';
  end if;
end $$;

-- A Clinic A doctor cannot update Clinic B data.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$ begin
  begin
    perform public.update_pending_consent_for_current_user(
      '92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002',
      '95000000-0000-4000-8000-000000000009', 'Cross tenant changed', 'v2', 'Must not persist',
      '2026-01-01 00:00:09+00'
    );
    raise exception 'Cross-tenant doctor updated a consent';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select consent_text from public.consents where id = '95000000-0000-4000-8000-000000000009') <> 'Tenant B protected text' then
    raise exception 'Cross-tenant failure partially modified the consent';
  end if;
end $$;

-- Active links block edits; revocation restores editing without creating a token.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_revision timestamptz;
begin
  select updated_at into strict v_revision from public.consents where id = '95000000-0000-4000-8000-000000000005';
  if not public.issue_current_consent_signing_link_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000005', repeat('a', 64), now() + interval '1 day', v_revision
  ) then raise exception 'Current revision could not issue a signing token'; end if;

  select updated_at into strict v_revision from public.consents where id = '95000000-0000-4000-8000-000000000005';
  if public.update_pending_consent_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000005', 'Blocked edit', 'v2', 'Must not persist', v_revision
  ) <> 'active_link' then raise exception 'Active signing link did not block editing'; end if;
  if (select consent_text from public.consents where id = '95000000-0000-4000-8000-000000000005') <> 'Link original text' then
    raise exception 'Blocked active-link edit partially modified content';
  end if;
end
$$;

reset role;
do $$ begin
  if (select signing_token_hash from public.consents where id = '95000000-0000-4000-8000-000000000005') <> repeat('a', 64) then
    raise exception 'Blocked active-link edit partially modified the token';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_revision timestamptz;
begin
  if not public.revoke_consent_signing_link_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000005'
  ) then raise exception 'Active signing link could not be revoked'; end if;
  select updated_at into strict v_revision from public.consents where id = '95000000-0000-4000-8000-000000000005';
  if public.update_pending_consent_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000005', 'After revocation', 'v2', 'Editable after revocation', v_revision
  ) <> 'updated' then raise exception 'Consent was not editable after link revocation'; end if;
end
$$;

reset role;
do $$ begin
  if exists (
    select 1 from public.consents
    where id = '95000000-0000-4000-8000-000000000005'
      and (signing_token_hash is not null or signing_token_expires_at is not null
        or signing_token_revoked_at is null)
  ) then raise exception 'Post-revocation save generated or restored a token'; end if;
end
$$;

-- Terminal consent content remains immutable, with no partial changes.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_revision timestamptz;
begin
  select updated_at into strict v_revision from public.consents where id = '95000000-0000-4000-8000-000000000006';
  if public.update_pending_consent_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000006', 'Signed changed', 'v2', 'Must not persist', v_revision
  ) <> 'immutable' then raise exception 'Signed consent was not immutable'; end if;
  select updated_at into strict v_revision from public.consents where id = '95000000-0000-4000-8000-000000000007';
  if public.update_pending_consent_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000007', 'Cancelled changed', 'v2', 'Must not persist', v_revision
  ) <> 'immutable' then raise exception 'Cancelled consent was not immutable'; end if;
  if (select consent_text from public.consents where id = '95000000-0000-4000-8000-000000000006') <> 'Signed immutable text'
    or (select consent_text from public.consents where id = '95000000-0000-4000-8000-000000000007') <> 'Cancelled immutable text' then
    raise exception 'Terminal-state failure partially modified content';
  end if;
end
$$;

-- Token issuance succeeds only for the exact displayed revision.
do $$
declare
  v_revision timestamptz;
begin
  select updated_at into strict v_revision from public.consents where id = '95000000-0000-4000-8000-000000000008';
  if public.issue_current_consent_signing_link_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000008', repeat('b', 64), now() + interval '1 day', v_revision - interval '1 second'
  ) then raise exception 'Stale revision issued a signing token'; end if;
end
$$;

reset role;
do $$ begin
  if exists (
    select 1 from public.consents
    where id = '95000000-0000-4000-8000-000000000008'
      and (signing_token_hash is not null or signing_token_expires_at is not null
        or updated_at <> '2026-01-01 00:00:08+00'::timestamptz)
  ) then raise exception 'Stale issuance partially modified token state or revision'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_revision timestamptz;
begin
  select updated_at into strict v_revision from public.consents where id = '95000000-0000-4000-8000-000000000008';
  if not public.issue_current_consent_signing_link_for_current_user(
    '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000008', repeat('c', 64), now() + interval '1 day', v_revision
  ) then raise exception 'Exact revision did not issue a signing token'; end if;
end
$$;

reset role;
do $$ begin
  if (select signing_token_hash from public.consents where id = '95000000-0000-4000-8000-000000000008') <> repeat('c', 64) then
    raise exception 'Exact-revision issuance persisted the wrong token';
  end if;
end
$$;

-- The obsolete unversioned function is not executable by authenticated.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$ begin
  begin
    perform public.issue_consent_signing_link_for_current_user(
      '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000008', repeat('d', 64), now() + interval '1 day'
    );
    raise exception 'Authenticated executed unversioned token issuance';
  exception when insufficient_privilege then null; end;
end $$;

-- Validation failure is atomic and whitespace-only content remains invalid.
do $$
declare
  v_before_type text;
  v_before_version text;
  v_before_text text;
  v_before_updated_at timestamptz;
begin
  select consent_type, consent_version, consent_text, updated_at
    into strict v_before_type, v_before_version, v_before_text, v_before_updated_at
  from public.consents where id = '95000000-0000-4000-8000-000000000001';
  begin
    perform public.update_pending_consent_for_current_user(
      '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000001',
      v_before_type, v_before_version, E' \n\t ', v_before_updated_at
    );
    raise exception 'Whitespace-only consent text was accepted';
  exception when invalid_parameter_value then null; end;
  if (select row(consent_type, consent_version, consent_text, updated_at) from public.consents where id = '95000000-0000-4000-8000-000000000001')
    is distinct from row(v_before_type, v_before_version, v_before_text, v_before_updated_at) then
    raise exception 'Validation failure partially modified the consent';
  end if;
end
$$;

reset role;
select extensions.pass('0024 pending consent editing and revision-safe issuance tests passed');
select * from extensions.finish();
rollback;
