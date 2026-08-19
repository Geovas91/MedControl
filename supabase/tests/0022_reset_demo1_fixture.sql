-- Prepare one reset_demo1_data.sql scenario after `supabase db reset --local`
-- and supabase/seeds/demo1.sql.
-- Required psql variable: evidence=mutable|signature|finalized_note
\if :{?evidence}
\else
  \echo 'Missing required psql variable: evidence'
  \quit 2
\endif

select :'evidence' = 'mutable' as is_mutable,
       :'evidence' = 'signature' as is_signature,
       :'evidence' = 'finalized_note' as is_finalized_note
\gset

\if :is_mutable
\elif :is_signature
\elif :is_finalized_note
\else
  \echo 'Invalid evidence value; use mutable, signature, or finalized_note'
  \quit 2
\endif

insert into public.patients (
  id, clinic_id, primary_doctor_id, full_name, first_names,
  internal_identifier, status
) values (
  '21000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Paciente Reset Demo', 'Paciente Reset Demo', 'PAC-RESET0001', 'active'
);

insert into public.clinical_records (
  id, clinic_id, patient_id, status, created_by
) values (
  '2b000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'active', '00000000-0000-0000-0000-000000000001'
);

insert into public.consents (
  id, clinic_id, patient_id, clinical_record_id, created_by,
  consent_type, consent_version, consent_text, signing_token, status
) values (
  '26000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '2b000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Reset demo test', 'test-v1', 'Fictional reset test consent.', null, 'pending'
);

insert into public.medical_notes (
  id, clinic_id, patient_id, doctor_id, status, specialty,
  clinical_impression, note_data, finalized_at, finalized_by
) values (
  '25000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  case when :'is_finalized_note'::boolean then 'finalized' else 'draft' end::public.medical_note_status,
  'Reset demo test', 'Fictional reset test note.', '{"test":true}'::jsonb,
  case when :'is_finalized_note'::boolean then now() else null end,
  case when :'is_finalized_note'::boolean then '00000000-0000-0000-0000-000000000001'::uuid else null end
);

\if :is_signature
insert into public.consent_signatures (
  id, clinic_id, consent_id, patient_id, signer_full_name, signature_data,
  accepted_privacy_notice, accepted_sensitive_data_processing
) values (
  '27000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Firmante Ficticio', 'data:image/png;base64,reset-test-only', true, true
);

update public.consents
set status = 'signed', signed_at = now(), signing_token_used_at = now()
where id = '26000000-0000-4000-8000-000000000001';
\endif
