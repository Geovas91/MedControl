-- Run after a local reset that applies the published 0024 followed by 0025.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
declare
  v_create regprocedure := 'public.create_consent_for_current_user(uuid,uuid,text,text,text,uuid)'::regprocedure;
  v_update regprocedure := 'public.update_pending_consent_for_current_user(uuid,uuid,uuid,text,text,text,timestamp with time zone)'::regprocedure;
begin
  if not has_function_privilege('authenticated', v_create, 'execute')
    or not has_function_privilege('authenticated', v_update, 'execute') then
    raise exception 'Authenticated lost an existing consent RPC grant';
  end if;
  if has_function_privilege('anon', v_create, 'execute')
    or has_function_privilege('anon', v_update, 'execute') then
    raise exception 'Exact-snapshot RPC grants are broader than intended';
  end if;
  if has_table_privilege('authenticated', 'public.consents', 'insert')
    or has_table_privilege('authenticated', 'public.consents', 'update') then
    raise exception 'Authenticated gained direct consent write privileges';
  end if;
  if (
    select count(*)
    from pg_proc
    where oid in (v_create::oid, v_update::oid)
      and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
  ) <> 2 then
    raise exception 'Exact-snapshot RPC security properties are incomplete';
  end if;
end
$$;

insert into auth.users(id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'snapshot-doctor@example.test');

insert into public.clinics(id, name) values
  ('a2000000-0000-4000-8000-000000000001', 'Exact Snapshot Clinic');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'doctor', 'active');

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values
  ('a2000000-0000-4000-8000-000000000001', 'pro', 'active', 'manual');

insert into public.patients(
  id, clinic_id, full_name, first_names, paternal_surname, internal_identifier, status
) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Paciente Snapshot', 'Paciente', 'Snapshot', 'PAC-SNAPSHOT1', 'active');

insert into public.clinical_records(id, clinic_id, patient_id, status) values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'active');

insert into public.medical_note_templates(
  id, clinic_id, name, description, template_schema, is_system_template,
  is_active, template_kind, created_by
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'Plantilla exacta original',
  'Plantilla reutilizable para comprobar el delta 0025',
  jsonb_build_object('content', E'Texto original de plantilla.\nNo debe modificarse.', 'templateKind', 'consent'),
  false, true, 'consent', 'a1000000-0000-4000-8000-000000000001'
);

insert into public.consents(
  id, clinic_id, patient_id, clinical_record_id, consent_type, consent_version,
  consent_text, status, updated_at
) values (
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'Tipo anterior', 'v1', 'Texto anterior', 'pending', '2026-01-01 00:00:00+00'
);

create temporary table exact_snapshot_test_ids(consent_id uuid primary key);
grant select, insert on exact_snapshot_test_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

insert into exact_snapshot_test_ids(consent_id)
select public.create_consent_for_current_user(
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  E'  Tipo visible personalizado  ',
  E' v3-clínica ',
  E'  Texto editado antes de crear.  \n\nSegunda línea significativa.\t\n',
  'a6000000-0000-4000-8000-000000000001'
);

reset role;
do $$
declare
  v_created_id uuid := (select consent_id from exact_snapshot_test_ids);
begin
  if not exists (
    select 1 from public.consents
    where id = v_created_id
      and consent_type = E'  Tipo visible personalizado  '
      and consent_version = E' v3-clínica '
      and consent_text = E'  Texto editado antes de crear.  \n\nSegunda línea significativa.\t\n'
      and template_id = 'a6000000-0000-4000-8000-000000000001'
      and status = 'pending'
      and signing_token is null
      and signing_token_hash is null
      and signing_token_expires_at is null
      and signing_token_used_at is null
      and signing_token_revoked_at is null
  ) then raise exception '0025 did not persist the exact clean creation snapshot'; end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
do $$
declare
  v_created_id uuid := (select consent_id from exact_snapshot_test_ids);
  v_revision timestamptz;
begin
  if public.update_pending_consent_for_current_user(
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    E'  Tipo editado  ', E' versión exacta ', E'  Cuerpo exacto\n ',
    '2026-01-01 00:00:00+00'
  ) <> 'updated' then raise exception '0025 exact pending update failed'; end if;

  select updated_at into strict v_revision from public.consents where id = v_created_id;
  if not public.issue_current_consent_signing_link_for_current_user(
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    v_created_id, repeat('9', 64), now() + interval '1 day', v_revision
  ) then raise exception 'A newly created clean snapshot could not issue a link immediately'; end if;
end
$$;

reset role;
do $$
begin
  if (select template_schema->>'content' from public.medical_note_templates where id = 'a6000000-0000-4000-8000-000000000001')
    <> E'Texto original de plantilla.\nNo debe modificarse.' then
    raise exception '0025 modified the reusable template';
  end if;
  if not exists (
    select 1 from public.consents
    where id = 'a5000000-0000-4000-8000-000000000001'
      and consent_type = E'  Tipo editado  '
      and consent_version = E' versión exacta '
      and consent_text = E'  Cuerpo exacto\n '
      and signing_token_hash is null
  ) then raise exception '0025 did not preserve an exact pending edit or altered its token'; end if;
  if not exists (
    select 1 from public.get_public_consent_for_signing(repeat('9', 64))
    where consent_type = E'  Tipo visible personalizado  '
      and consent_version = E' v3-clínica '
      and consent_text = E'  Texto editado antes de crear.  \n\nSegunda línea significativa.\t\n'
  ) then raise exception 'Public signing did not receive the exact created snapshot'; end if;
end
$$;

set local role anon;
do $$
declare
  v_png text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
begin
  if public.sign_public_consent(repeat('9', 64), 'Paciente Snapshot', v_png, true, true) <> 'signed' then
    raise exception 'Exact snapshot could not be signed';
  end if;
end
$$;

reset role;
do $$
declare
  v_created_id uuid := (select consent_id from exact_snapshot_test_ids);
  v_snapshot_id uuid;
  v_consent_count bigint;
  v_audit_count bigint;
begin
  select id into strict v_snapshot_id
  from public.consent_signed_snapshots
  where consent_id = v_created_id
    and consent_type = E'  Tipo visible personalizado  '
    and consent_version = E' v3-clínica '
    and consent_text = E'  Texto editado antes de crear.  \n\nSegunda línea significativa.\t\n';
  if not exists (
    select 1 from public.consent_documents
    where consent_id = v_created_id and snapshot_id = v_snapshot_id
  ) then raise exception 'PDF metadata does not reference the exact signed snapshot'; end if;

  select count(*) into v_consent_count from public.consents;
  select count(*) into v_audit_count from public.audit_logs;
  begin
    perform public.create_consent_for_current_user(
      'a2000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      E' \n ', 'v1', 'No debe persistir', null
    );
    raise exception 'Whitespace-only consent type was accepted';
  exception when invalid_parameter_value then null; end;
  if (select count(*) from public.consents) <> v_consent_count
    or (select count(*) from public.audit_logs) <> v_audit_count then
    raise exception 'Invalid creation left partial consent or audit changes';
  end if;
end
$$;

select extensions.pass('0025 exact consent snapshot delta tests passed');
select * from extensions.finish();
rollback;
