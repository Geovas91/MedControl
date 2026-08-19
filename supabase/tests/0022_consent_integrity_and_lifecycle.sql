-- Run after a local `supabase db reset`.
begin;

do $$
declare
  v_create regprocedure := 'public.create_consent_for_current_user(uuid,uuid,text,text,text,uuid)'::regprocedure;
  v_issue regprocedure := 'public.issue_consent_signing_link_for_current_user(uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure;
  v_revoke regprocedure := 'public.revoke_consent_signing_link_for_current_user(uuid,uuid,uuid)'::regprocedure;
  v_cancel regprocedure := 'public.cancel_consent_for_current_user(uuid,uuid,uuid,text)'::regprocedure;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consents_clinic_patient_fk'
      and conrelid = 'public.consents'::regclass
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (clinic_id, patient_id) REFERENCES patients(clinic_id, id)%'
  ) then raise exception 'Tenant-aware consent patient FK is missing'; end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'consents_record_patient_fk'
      and conrelid = 'public.consents'::regclass
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (clinic_id, clinical_record_id, patient_id) REFERENCES clinical_records(clinic_id, id, patient_id)%'
  ) then raise exception 'Tenant-aware consent record FK is missing'; end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'consent_signatures_consent_patient_fk'
      and conrelid = 'public.consent_signatures'::regclass
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (clinic_id, consent_id, patient_id) REFERENCES consents(clinic_id, id, patient_id)%'
  ) then raise exception 'Tenant-aware signature consent FK is missing'; end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'consent_signatures_consent_id_unique'
      and conrelid = 'public.consent_signatures'::regclass
      and contype = 'u'
  ) then raise exception 'One-signature-per-consent constraint is missing'; end if;
  if (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'consents' and column_name = 'clinical_record_id') <> 'NO'
    or (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'consent_signatures' and column_name = 'clinic_id') <> 'NO' then
    raise exception 'Consent record or signature clinic backfill is not enforced as NOT NULL';
  end if;

  if has_column_privilege('authenticated', 'public.consents', 'signing_token', 'select')
    or has_column_privilege('authenticated', 'public.consents', 'signing_token_hash', 'select')
    or has_column_privilege('authenticated', 'public.consent_signatures', 'signature_data', 'select') then
    raise exception 'Authenticated can directly read legacy token or signature evidence columns';
  end if;
  if has_table_privilege('authenticated', 'public.consents', 'insert')
    or has_table_privilege('authenticated', 'public.consents', 'update')
    or has_table_privilege('authenticated', 'public.consents', 'delete')
    or has_table_privilege('authenticated', 'public.consent_signatures', 'insert')
    or has_table_privilege('authenticated', 'public.consent_signatures', 'update')
    or has_table_privilege('authenticated', 'public.consent_signatures', 'delete') then
    raise exception 'Authenticated retains direct consent write privileges';
  end if;
  if not has_function_privilege('authenticated', v_create, 'execute')
    or not has_function_privilege('authenticated', v_issue, 'execute')
    or not has_function_privilege('authenticated', v_revoke, 'execute')
    or not has_function_privilege('authenticated', v_cancel, 'execute') then
    raise exception 'Authenticated consent lifecycle RPC grants are incomplete';
  end if;
  if has_function_privilege('anon', v_create, 'execute')
    or has_function_privilege('anon', v_issue, 'execute')
    or has_function_privilege('anon', v_revoke, 'execute')
    or has_function_privilege('anon', v_cancel, 'execute') then
    raise exception 'Anon can execute an authenticated consent lifecycle RPC';
  end if;
  if (
    select count(*) from pg_proc
    where oid in (v_create::oid, v_issue::oid, v_revoke::oid, v_cancel::oid)
      and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
  ) <> 4 then raise exception 'Consent lifecycle RPC security properties are incomplete'; end if;
end
$$;

-- The reset seed must remain compatible with the mandatory universal-record link.
do $$
begin
  if not exists (
    select 1
    from public.consents as consent
    join public.clinical_records as record
      on record.clinic_id = consent.clinic_id
     and record.id = consent.clinical_record_id
     and record.patient_id = consent.patient_id
    where consent.id = '50000000-0000-0000-0000-000000000001'
  ) then raise exception 'Seeded historical consent is not linked to its universal record'; end if;
end
$$;

insert into auth.users(id, email) values
  ('11000000-0000-4000-8000-000000000001', 'consent-owner-a@example.test'),
  ('11000000-0000-4000-8000-000000000002', 'consent-admin-a@example.test'),
  ('11000000-0000-4000-8000-000000000003', 'consent-doctor-a@example.test'),
  ('11000000-0000-4000-8000-000000000004', 'consent-assistant-a@example.test'),
  ('11000000-0000-4000-8000-000000000005', 'consent-outsider@example.test'),
  ('11000000-0000-4000-8000-000000000006', 'consent-doctor-b@example.test');

insert into public.clinics(id, name) values
  ('22000000-0000-4000-8000-000000000001', 'Consent Clinic A'),
  ('22000000-0000-4000-8000-000000000002', 'Consent Clinic B');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('22000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('22000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('22000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003', 'doctor', 'active'),
  ('22000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000004', 'assistant', 'active'),
  ('22000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000006', 'doctor', 'active');

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values
  ('22000000-0000-4000-8000-000000000001', 'pro', 'active', 'manual'),
  ('22000000-0000-4000-8000-000000000002', 'pro', 'active', 'manual');

insert into public.patients(
  id, clinic_id, full_name, first_names, paternal_surname, internal_identifier, status
) values
  ('33000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Paciente Uno', 'Paciente', 'Uno', 'PAC-CONSENT01', 'active'),
  ('33000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', 'Paciente Dos', 'Paciente', 'Dos', 'PAC-CONSENT02', 'active'),
  ('33000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', 'Paciente Tres', 'Paciente', 'Tres', 'PAC-CONSENT03', 'active'),
  ('33000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000001', 'Paciente Cuatro', 'Paciente', 'Cuatro', 'PAC-CONSENT04', 'active'),
  ('33000000-0000-4000-8000-000000000005', '22000000-0000-4000-8000-000000000002', 'Paciente Cinco', 'Paciente', 'Cinco', 'PAC-CONSENT05', 'active');

insert into public.clinical_records(id, clinic_id, patient_id, status) values
  ('44000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'active'),
  ('44000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002', 'active'),
  ('44000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003', 'active'),
  ('44000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000004', 'active'),
  ('44000000-0000-4000-8000-000000000005', '22000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000005', 'active');

create temporary table consent_test_ids(key text primary key, value uuid not null);
grant select, insert, update on consent_test_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
insert into consent_test_ids values (
  'owner', public.create_consent_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001',
    'Consentimiento owner', 'v1', 'Texto ficticio de prueba para owner.', null
  )
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
insert into consent_test_ids values (
  'admin', public.create_consent_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002',
    'Consentimiento admin', 'v1', 'Texto ficticio de prueba para admin.', null
  )
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
insert into consent_test_ids values (
  'doctor', public.create_consent_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
    'Consentimiento doctor', 'v1', 'Texto ficticio de prueba para firma.', null
  )
);
insert into consent_test_ids values (
  'cancel', public.create_consent_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000004',
    'Consentimiento cancelable', 'v1', 'Texto ficticio de prueba para cancelación.', null
  )
);

do $$
begin
  if exists (
    select 1 from consent_test_ids as test
    join public.consents as consent on consent.id = test.value
    join public.clinical_records as record
      on record.clinic_id = consent.clinic_id
     and record.id = consent.clinical_record_id
     and record.patient_id = consent.patient_id
    where test.key in ('owner', 'admin', 'doctor', 'cancel')
    group by test.key
    having count(*) <> 1
  ) or (
    select count(*) from public.consents where id in (select value from consent_test_ids)
  ) <> 4 then raise exception 'Consent creation did not derive each active clinical record'; end if;
  begin
    perform public.create_consent_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000005',
      'Cross tenant', 'v1', 'Debe rechazarse.', null
    );
    raise exception 'Doctor created a consent for another clinic patient';
  exception when invalid_parameter_value then null; end;

  begin
    insert into public.consents(clinic_id, patient_id, clinical_record_id, consent_type, consent_version, consent_text, status)
    values ('22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', 'Direct', 'v1', 'Rejected', 'pending');
    raise exception 'Authenticated retained direct consent insert';
  exception when insufficient_privilege then null; end;
end
$$;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', true);
do $$ begin
  if exists (select 1 from public.consents where clinic_id = '22000000-0000-4000-8000-000000000001') then
    raise exception 'Assistant read clinical consents';
  end if;
  begin
    perform public.create_consent_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001',
      'Assistant', 'v1', 'Debe rechazarse.', null
    );
    raise exception 'Assistant created a consent';
  exception when insufficient_privilege then null; end;
  begin
    perform public.issue_consent_signing_link_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
      (select value from consent_test_ids where key = 'doctor'), repeat('d', 64), now() + interval '7 days'
    );
    raise exception 'Assistant issued a consent signing link';
  exception when insufficient_privilege then null; end;
  begin
    perform public.revoke_consent_signing_link_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
      (select value from consent_test_ids where key = 'doctor')
    );
    raise exception 'Assistant revoked a consent signing link';
  exception when insufficient_privilege then null; end;
  begin
    perform public.cancel_consent_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
      (select value from consent_test_ids where key = 'doctor'), null
    );
    raise exception 'Assistant cancelled a consent';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', true);
do $$ begin
  if exists (select 1 from public.consents) then raise exception 'Outsider read consents'; end if;
  begin
    perform public.create_consent_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001',
      'Outsider', 'v1', 'Debe rechazarse.', null
    );
    raise exception 'Outsider created a consent';
  exception when insufficient_privilege then null; end;
  begin
    perform public.issue_consent_signing_link_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
      (select value from consent_test_ids where key = 'doctor'), repeat('e', 64), now() + interval '7 days'
    );
    raise exception 'Outsider issued a consent signing link';
  exception when insufficient_privilege then null; end;
  begin
    perform public.revoke_consent_signing_link_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
      (select value from consent_test_ids where key = 'doctor')
    );
    raise exception 'Outsider revoked a consent signing link';
  exception when insufficient_privilege then null; end;
  begin
    perform public.cancel_consent_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
      (select value from consent_test_ids where key = 'doctor'), null
    );
    raise exception 'Outsider cancelled a consent';
  exception when insufficient_privilege then null; end;
end $$;

reset role;

-- Direct privileged writes still cannot create cross-tenant or mismatched relationships.
do $$
begin
  begin
    insert into public.consents(clinic_id, patient_id, clinical_record_id, consent_type, consent_version, consent_text, status)
    values ('22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000005', '44000000-0000-4000-8000-000000000005', 'Cross patient', 'v1', 'Rejected', 'pending');
    raise exception 'Consent accepted another clinic patient';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.consents(clinic_id, patient_id, clinical_record_id, consent_type, consent_version, consent_text, status)
    values ('22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000005', 'Cross record', 'v1', 'Rejected', 'pending');
    raise exception 'Consent accepted another clinic record';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.consents(clinic_id, patient_id, clinical_record_id, consent_type, consent_version, consent_text, status)
    values ('22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000001', 'Mismatched record', 'v1', 'Rejected', 'pending');
    raise exception 'Consent accepted a same-clinic record belonging to another patient';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.consent_signatures(clinic_id, consent_id, patient_id, signer_full_name)
    values ('22000000-0000-4000-8000-000000000002', (select value from consent_test_ids where key = 'doctor'), '33000000-0000-4000-8000-000000000003', 'Cross tenant signer');
    raise exception 'Signature accepted a different tenant';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.consents(clinic_id, patient_id, clinical_record_id, consent_type, consent_version, consent_text, status, signed_at)
    values ('22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', 'Legacy expired', 'v1', 'Rejected', 'expired', null);
    raise exception 'New expired document status was accepted';
  exception when check_violation then null; end;
  begin
    update public.consents
    set status = 'signed', signed_at = now()
    where id = (select value from consent_test_ids where key = 'owner');
    raise exception 'Consent became signed without a final signature';
  exception when check_violation then null; end;
end
$$;

set local role anon;
do $$ begin
  begin perform id from public.consents limit 1; raise exception 'Anon read consent tables directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.consent_signatures(clinic_id, consent_id, patient_id, signer_full_name)
    values ('22000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'Anon direct');
    raise exception 'Anon wrote a signature without the public RPC';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_doctor uuid := (select value from consent_test_ids where key = 'doctor');
  v_cancel uuid := (select value from consent_test_ids where key = 'cancel');
begin
  begin
    perform public.issue_consent_signing_link_for_current_user(
      '22000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000005',
      v_doctor, repeat('c', 64), now() + interval '7 days'
    );
    raise exception 'Doctor issued a signing link through another clinic';
  exception when insufficient_privilege then null; end;
  begin
    perform public.revoke_consent_signing_link_for_current_user(
      '22000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000005', v_doctor
    );
    raise exception 'Doctor revoked a signing link through another clinic';
  exception when insufficient_privilege then null; end;
  begin
    perform public.cancel_consent_for_current_user(
      '22000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000005',
      v_doctor, 'Cross tenant'
    );
    raise exception 'Doctor cancelled a consent through another clinic';
  exception when insufficient_privilege then null; end;
  if public.issue_consent_signing_link_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000005',
    v_doctor, repeat('c', 64), now() + interval '7 days'
  ) then raise exception 'Doctor issued a link with a foreign patient ID'; end if;
  if public.revoke_consent_signing_link_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000005', v_doctor
  ) then raise exception 'Doctor revoked a link with a foreign patient ID'; end if;
  if public.cancel_consent_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000005',
    v_doctor, 'Foreign patient'
  ) <> 'unavailable' then raise exception 'Doctor resolved a consent with a foreign patient ID'; end if;

  if not public.issue_consent_signing_link_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
    v_doctor, repeat('a', 64), now() + interval '7 days'
  ) then raise exception 'Doctor could not issue a signing link'; end if;
  if not public.issue_consent_signing_link_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000004',
    v_cancel, repeat('b', 64), now() + interval '7 days'
  ) then raise exception 'Doctor could not issue a cancellable signing link'; end if;
  if public.cancel_consent_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000004',
    v_cancel, '  Corrección administrativa  '
  ) <> 'cancelled' then raise exception 'Pending consent was not cancelled'; end if;
  if public.cancel_consent_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000004',
    v_cancel, null
  ) <> 'already_cancelled' then raise exception 'Second cancellation was not safely idempotent'; end if;
end
$$;

-- New writes are blocked without entitlement, while revoking an already-issued
-- public link remains available as a safety operation.
reset role;
update public.clinic_subscriptions
set status = 'past_due'
where clinic_id = '22000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_doctor uuid := (select value from consent_test_ids where key = 'doctor');
begin
  begin
    perform public.create_consent_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001',
      'Blocked entitlement', 'v1', 'Debe rechazarse.', null
    );
    raise exception 'Past-due clinic created a consent';
  exception when insufficient_privilege then null; end;
  begin
    perform public.issue_consent_signing_link_for_current_user(
      '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
      v_doctor, repeat('f', 64), now() + interval '7 days'
    );
    raise exception 'Past-due clinic issued a signing link';
  exception when insufficient_privilege then null; end;
  if not public.revoke_consent_signing_link_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003', v_doctor
  ) then raise exception 'Past-due clinic could not revoke an existing public link'; end if;
end
$$;

reset role;
update public.clinic_subscriptions
set status = 'active'
where clinic_id = '22000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not public.issue_consent_signing_link_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
    (select value from consent_test_ids where key = 'doctor'), repeat('a', 64), now() + interval '7 days'
  ) then raise exception 'Doctor could not reissue the revoked signing link'; end if;
end
$$;

set local role anon;
do $$
declare
  v_png text := 'data:image/png;base64,' || encode(decode('89504e470d0a1a0a0000000d494844520000000100000001', 'hex'), 'base64');
begin
  if public.sign_public_consent(repeat('a', 64), '   ', v_png, true, true) <> 'invalid' then
    raise exception 'Whitespace-only signer name was accepted';
  end if;
  if public.sign_public_consent(repeat('b', 64), 'Paciente Cancelado', v_png, true, true) <> 'invalid' then
    raise exception 'Cancelled consent accepted a public signature';
  end if;
  if public.sign_public_consent(repeat('a', 64), 'Paciente Firmante', v_png, true, true) <> 'signed' then
    raise exception 'Valid public consent signature failed';
  end if;
  if public.sign_public_consent(repeat('a', 64), 'Paciente Firmante', v_png, true, true) <> 'already_signed' then
    raise exception 'Second public signature was not rejected idempotently';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_doctor uuid := (select value from consent_test_ids where key = 'doctor');
begin
  if public.cancel_consent_for_current_user(
    '22000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003',
    v_doctor, 'No permitido después de firma'
  ) <> 'invalid_state' then raise exception 'Signed consent was cancelled'; end if;
end
$$;

reset role;
do $$
declare
  v_doctor uuid := (select value from consent_test_ids where key = 'doctor');
  v_cancel uuid := (select value from consent_test_ids where key = 'cancel');
  v_patient_two uuid := '33000000-0000-4000-8000-000000000002';
  v_record_two uuid := '44000000-0000-4000-8000-000000000002';
begin
  if (select status from public.consents where id = v_doctor) <> 'signed'
    or (select count(*) from public.consent_signatures where consent_id = v_doctor) <> 1 then
    raise exception 'Signed consent final state is inconsistent';
  end if;
  if (select status from public.consents where id = v_cancel) <> 'cancelled'
    or (select cancellation_reason from public.consents where id = v_cancel) <> 'Corrección administrativa'
    or exists (select 1 from public.consent_signatures where consent_id = v_cancel) then
    raise exception 'Cancelled consent final state is inconsistent';
  end if;
  if (select count(*) from public.audit_logs where entity_id = v_doctor and action = 'consent_signed') <> 1
    or (select count(*) from public.audit_logs where entity_id = v_cancel and action = 'consent_cancelled') <> 1 then
    raise exception 'Consent signature or cancellation audit is incomplete';
  end if;
  if (
    select count(*) from public.audit_logs
    where entity_id in (select value from consent_test_ids) and action = 'consent_created'
  ) <> 4 then raise exception 'Consent creation audit is incomplete'; end if;
  if exists (
    select 1 from public.audit_logs
    where entity_id in (v_doctor, v_cancel)
      and metadata::text ~* '(token|signature|png|user.agent|ip)'
  ) then raise exception 'Consent audit contains prohibited technical evidence'; end if;

  begin update public.consents set status = 'pending' where id = v_doctor;
    raise exception 'Signed consent returned to pending'; exception when check_violation then null; end;
  begin update public.consents set status = 'cancelled', cancelled_at = now() where id = v_doctor;
    raise exception 'Signed consent changed to cancelled'; exception when check_violation then null; end;
  begin update public.consents set patient_id = v_patient_two where id = v_doctor;
    raise exception 'Signed consent changed patient'; exception when check_violation then null; end;
  begin update public.consents set clinical_record_id = v_record_two where id = v_doctor;
    raise exception 'Signed consent changed record'; exception when check_violation then null; end;
  begin update public.consents set clinic_id = '22000000-0000-4000-8000-000000000002' where id = v_doctor;
    raise exception 'Signed consent changed clinic'; exception when check_violation then null; end;
  begin update public.consents set consent_text = 'Alterado' where id = v_doctor;
    raise exception 'Signed consent changed protected content'; exception when check_violation then null; end;
  begin update public.consent_signatures set signer_full_name = 'Alterado' where consent_id = v_doctor;
    raise exception 'Final signature was updated'; exception when check_violation then null; end;
  begin delete from public.consent_signatures where consent_id = v_doctor;
    raise exception 'Final signature was deleted'; exception when check_violation then null; end;
  begin
    insert into public.consent_signatures(clinic_id, consent_id, patient_id, signer_full_name)
    values ('22000000-0000-4000-8000-000000000001', v_doctor, '33000000-0000-4000-8000-000000000003', 'Segunda firma');
    raise exception 'Second final signature was inserted';
  exception when unique_violation or check_violation then null; end;

  begin update public.consents set status = 'pending', cancelled_at = null, cancelled_by = null, cancellation_reason = null where id = v_cancel;
    raise exception 'Cancelled consent returned to pending'; exception when check_violation then null; end;
  begin update public.consents set status = 'signed', signed_at = now(), cancelled_at = null, cancelled_by = null, cancellation_reason = null where id = v_cancel;
    raise exception 'Cancelled consent changed to signed'; exception when check_violation then null; end;
  begin update public.consents set consent_text = 'Alterado' where id = v_cancel;
    raise exception 'Cancelled consent changed protected content'; exception when check_violation then null; end;
end
$$;

rollback;

select '0022 consent integrity and lifecycle tests passed' as result;
