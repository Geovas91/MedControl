-- Run after `supabase db reset --local --version 0022 --no-seed`.
-- Required psql variable: mismatch=none|clinic|uuid|marker
\if :{?mismatch}
\else
  \echo 'Missing required psql variable: mismatch'
  \quit 2
\endif

select :'mismatch' = 'clinic' as mismatch_clinic,
       :'mismatch' = 'uuid' as mismatch_uuid,
       :'mismatch' = 'marker' as mismatch_marker,
       :'mismatch' = 'none' as mismatch_none
\gset

\if :mismatch_clinic
\elif :mismatch_uuid
\elif :mismatch_marker
\elif :mismatch_none
\else
  \echo 'Invalid mismatch value; use none, clinic, uuid, or marker'
  \quit 2
\endif

insert into public.clinics(id, name, tenant_type)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Demo fixture repair test',
    (case when :'mismatch_clinic'::boolean then 'qa' else 'demo' end)::public.tenant_type
  ),
  ('10000000-0000-4000-8000-000000000002', 'Unaffected tenant test', 'qa');

insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier, status)
values
  ('21000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Paciente Demo Uno', 'Paciente', 'PAC-REPAIR001', 'active'),
  ('21000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Paciente Demo Tres', 'Paciente', 'PAC-REPAIR003', 'active'),
  ('21000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000002', 'Paciente Otro Tenant', 'Paciente', 'PAC-REPAIR099', 'active');

insert into public.clinical_records(id, clinic_id, patient_id, status)
values
  ('2b000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'active'),
  ('2b000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000003', 'active'),
  ('2b000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000099', 'active');

insert into public.consents(
  id, clinic_id, patient_id, clinical_record_id, consent_type, consent_version,
  consent_text, signing_token, status
)
values
  ('26000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'Fixture demo histórico 1', 'demo-v1', 'Contenido ficticio.', 'demo-repair-token-1', 'pending'),
  ('26000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000003', 'Fixture demo histórico 4', 'demo-v1', 'Contenido ficticio.', 'demo-repair-token-4', 'pending'),
  ('26000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000099', '2b000000-0000-4000-8000-000000000099', 'Consentimiento no objetivo', 'test-v1', 'Contenido ficticio.', 'other-tenant-token', 'pending');

insert into public.consent_signatures(
  id, clinic_id, consent_id, patient_id, signer_full_name, signature_data,
  accepted_privacy_notice, accepted_sensitive_data_processing, user_agent
)
values
  (
    '27000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'Firmante Fixture Uno', null, true, true,
    case when :'mismatch_marker'::boolean then 'unexpected marker' else 'CliniControl fictional seed' end
  ),
  (
    case when :'mismatch_uuid'::boolean
      then '27000000-0000-4000-8000-000000000009'::uuid
      else '27000000-0000-4000-8000-000000000002'::uuid
    end,
    '10000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000004',
    '21000000-0000-4000-8000-000000000003',
    'Firmante Fixture Dos', null, true, true, 'CliniControl fictional seed'
  );

update public.consents
set status = 'signed', signed_at = now(), signing_token_used_at = now()
where id in (
  '26000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000004'
);
