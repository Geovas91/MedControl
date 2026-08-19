-- Run after `supabase db reset --local --version 0021 --no-seed`.
-- These rows reproduce the three legacy lifecycle shapes migration 0022 must
-- preserve while backfilling the universal clinical record and signature tenant.

insert into public.clinics (id, name)
values ('82000000-0000-4000-8000-000000000001', 'Clínica Legacy 0022');

insert into public.patients (
  id, clinic_id, full_name, first_names, paternal_surname, internal_identifier
)
values (
  '82000000-0000-4000-8000-000000000002',
  '82000000-0000-4000-8000-000000000001',
  'Paciente Histórica',
  'Paciente',
  'Histórica',
  'PAC-LEGACY0022'
);

insert into public.clinical_records (id, clinic_id, patient_id, status)
values (
  '82000000-0000-4000-8000-000000000003',
  '82000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000002',
  'active'
);

insert into public.consents (
  id, clinic_id, patient_id, consent_type, consent_version, consent_text,
  status, expires_at, revoked_at, signed_at
)
values
  (
    '82000000-0000-4000-8000-000000000010',
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002',
    'Legacy expired link', 'legacy', 'Contenido histórico ficticio.',
    'expired', now() - interval '1 day', null, null
  ),
  (
    '82000000-0000-4000-8000-000000000011',
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002',
    'Legacy expired signed', 'legacy', 'Contenido histórico firmado ficticio.',
    'expired', now() - interval '1 day', null, now() - interval '2 days'
  ),
  (
    '82000000-0000-4000-8000-000000000012',
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002',
    'Legacy revoked', 'legacy', 'Contenido histórico cancelado ficticio.',
    'revoked', null, now() - interval '1 day', null
  );

insert into public.consent_signatures (
  id, consent_id, patient_id, signer_full_name,
  accepted_privacy_notice, accepted_sensitive_data_processing, signed_at
)
values (
  '82000000-0000-4000-8000-000000000020',
  '82000000-0000-4000-8000-000000000011',
  '82000000-0000-4000-8000-000000000002',
  'Paciente Histórica', true, true, now() - interval '2 days'
);
