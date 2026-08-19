-- Prepare a pending consent for two concurrent sign_public_consent calls.
insert into public.consents (
  id, clinic_id, patient_id, clinical_record_id, created_by,
  consent_type, consent_version, consent_text, signing_token,
  signing_token_hash, signing_token_expires_at, status
) values (
  '51000000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Concurrent signature test', 'test-v1', 'Fictional concurrent-signature test.', null,
  repeat('c', 64), now() + interval '1 hour', 'pending'
);
