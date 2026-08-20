-- Removes only the deterministic fictional records managed by demo1_data.sql.
-- The demo1 clinic, Auth account, public.profiles row, owner membership, and subscription remain intact.
-- The fictional directory profile is part of this dataset and is removed.

begin;

do $$
declare
  demo_clinic_id constant uuid := '10000000-0000-4000-8000-000000000001';
  patient_ids constant uuid[] := array[
    '21000000-0000-4000-8000-000000000001'::uuid,
    '21000000-0000-4000-8000-000000000002'::uuid,
    '21000000-0000-4000-8000-000000000003'::uuid,
    '21000000-0000-4000-8000-000000000004'::uuid,
    '21000000-0000-4000-8000-000000000005'::uuid,
    '21000000-0000-4000-8000-000000000006'::uuid,
    '21000000-0000-4000-8000-000000000007'::uuid,
    '21000000-0000-4000-8000-000000000008'::uuid,
    '21000000-0000-4000-8000-000000000009'::uuid,
    '21000000-0000-4000-8000-000000000010'::uuid,
    '21000000-0000-4000-8000-000000000011'::uuid,
    '21000000-0000-4000-8000-000000000012'::uuid
  ];
  record_ids constant uuid[] := array[
    '2b000000-0000-4000-8000-000000000001'::uuid,
    '2b000000-0000-4000-8000-000000000002'::uuid,
    '2b000000-0000-4000-8000-000000000003'::uuid,
    '2b000000-0000-4000-8000-000000000004'::uuid,
    '2b000000-0000-4000-8000-000000000005'::uuid,
    '2b000000-0000-4000-8000-000000000006'::uuid,
    '2b000000-0000-4000-8000-000000000007'::uuid,
    '2b000000-0000-4000-8000-000000000008'::uuid,
    '2b000000-0000-4000-8000-000000000009'::uuid,
    '2b000000-0000-4000-8000-000000000010'::uuid,
    '2b000000-0000-4000-8000-000000000011'::uuid,
    '2b000000-0000-4000-8000-000000000012'::uuid
  ];
  appointment_ids constant uuid[] := array[
    '22000000-0000-4000-8000-000000000001'::uuid,
    '22000000-0000-4000-8000-000000000002'::uuid,
    '22000000-0000-4000-8000-000000000003'::uuid,
    '22000000-0000-4000-8000-000000000004'::uuid,
    '22000000-0000-4000-8000-000000000005'::uuid,
    '22000000-0000-4000-8000-000000000006'::uuid,
    '22000000-0000-4000-8000-000000000007'::uuid,
    '22000000-0000-4000-8000-000000000008'::uuid,
    '22000000-0000-4000-8000-000000000009'::uuid,
    '22000000-0000-4000-8000-000000000010'::uuid,
    '22000000-0000-4000-8000-000000000011'::uuid,
    '22000000-0000-4000-8000-000000000012'::uuid,
    '22000000-0000-4000-8000-000000000013'::uuid,
    '22000000-0000-4000-8000-000000000014'::uuid,
    '22000000-0000-4000-8000-000000000015'::uuid,
    '22000000-0000-4000-8000-000000000016'::uuid,
    '22000000-0000-4000-8000-000000000017'::uuid,
    '22000000-0000-4000-8000-000000000018'::uuid
  ];
  payment_ids constant uuid[] := array[
    '23000000-0000-4000-8000-000000000001'::uuid,
    '23000000-0000-4000-8000-000000000002'::uuid,
    '23000000-0000-4000-8000-000000000003'::uuid,
    '23000000-0000-4000-8000-000000000004'::uuid,
    '23000000-0000-4000-8000-000000000005'::uuid,
    '23000000-0000-4000-8000-000000000006'::uuid,
    '23000000-0000-4000-8000-000000000007'::uuid,
    '23000000-0000-4000-8000-000000000008'::uuid,
    '23000000-0000-4000-8000-000000000009'::uuid,
    '23000000-0000-4000-8000-000000000010'::uuid,
    '23000000-0000-4000-8000-000000000011'::uuid,
    '23000000-0000-4000-8000-000000000012'::uuid
  ];
  template_ids constant uuid[] := array[
    '24000000-0000-4000-8000-000000000001'::uuid,
    '24000000-0000-4000-8000-000000000002'::uuid
  ];
  note_ids constant uuid[] := array[
    '25000000-0000-4000-8000-000000000001'::uuid,
    '25000000-0000-4000-8000-000000000002'::uuid,
    '25000000-0000-4000-8000-000000000003'::uuid,
    '25000000-0000-4000-8000-000000000004'::uuid,
    '25000000-0000-4000-8000-000000000005'::uuid
  ];
  consent_ids constant uuid[] := array[
    '26000000-0000-4000-8000-000000000001'::uuid,
    '26000000-0000-4000-8000-000000000002'::uuid,
    '26000000-0000-4000-8000-000000000003'::uuid,
    '26000000-0000-4000-8000-000000000004'::uuid
  ];
  review_ids constant uuid[] := array[
    '2a000000-0000-4000-8000-000000000001'::uuid,
    '2a000000-0000-4000-8000-000000000002'::uuid,
    '2a000000-0000-4000-8000-000000000003'::uuid
  ];
  public_profile_id constant uuid := '29000000-0000-4000-8000-000000000001';
begin
  perform 1
  from public.clinics
  where id = demo_clinic_id
    and tenant_type = 'demo'
  for update;

  if not found then
    raise exception 'Reset blocked: demo1 does not exist with the expected UUID and tenant_type demo.';
  end if;

  -- This helper is intentionally incapable of deleting immutable clinical
  -- evidence. Rebuild the complete local database when the demo has advanced
  -- to a signed, cancelled, or finalized state.
  if exists (
    select 1
    from public.consent_signatures
    where consent_id = any(consent_ids)
      or patient_id = any(patient_ids)
  ) or exists (
    select 1
    from public.consents
    where (id = any(consent_ids) or patient_id = any(patient_ids))
      and status in ('signed', 'cancelled')
  ) or exists (
    select 1
    from public.medical_notes
    where (
      id = any(note_ids)
      or patient_id = any(patient_ids)
      or appointment_id = any(appointment_ids)
      or template_id = any(template_ids)
    )
      and status = 'finalized'
  ) then
    raise exception using
      message = 'Reset blocked: demo1 contains immutable clinical evidence. Use a full local Supabase reset to regenerate the demo dataset.';
  end if;

  if exists (
    select 1 from public.appointments
    where patient_id = any(patient_ids) and not (id = any(appointment_ids))
  ) then
    raise exception 'Reset blocked: unmanaged appointments reference demo1 seed patients.';
  end if;

  if exists (
    select 1 from public.clinical_records
    where patient_id = any(patient_ids) and not (id = any(record_ids))
  ) then
    raise exception 'Reset blocked: unmanaged clinical records reference demo1 seed patients.';
  end if;

  if exists (
    select 1 from public.clinical_records
    where id = any(record_ids)
      and (clinic_id <> demo_clinic_id or not (patient_id = any(patient_ids)))
  ) then
    raise exception 'Reset blocked: deterministic clinical record UUIDs are owned outside demo1.';
  end if;

  if exists (
    select 1 from public.payments
    where (patient_id = any(patient_ids) or appointment_id = any(appointment_ids))
      and not (id = any(payment_ids))
  ) then
    raise exception 'Reset blocked: unmanaged payments reference demo1 seed records.';
  end if;

  if exists (
    select 1 from public.medical_notes
    where (
      patient_id = any(patient_ids)
      or appointment_id = any(appointment_ids)
      or template_id = any(template_ids)
    ) and not (id = any(note_ids))
  ) then
    raise exception 'Reset blocked: unmanaged medical notes reference demo1 seed records.';
  end if;

  if exists (
    select 1 from public.consents
    where patient_id = any(patient_ids) and not (id = any(consent_ids))
  ) then
    raise exception 'Reset blocked: unmanaged consents reference demo1 seed patients.';
  end if;

  if exists (
    select 1 from public.appointment_invites
    where appointment_id = any(appointment_ids) or patient_id = any(patient_ids)
  ) then
    raise exception 'Reset blocked: appointment invites reference demo1 seed records.';
  end if;

  if exists (
    select 1 from public.bot_logs
    where appointment_id = any(appointment_ids) or patient_id = any(patient_ids)
  ) then
    raise exception 'Reset blocked: bot logs reference demo1 seed records.';
  end if;

  if exists (
    select 1 from public.doctor_reviews
    where (
      doctor_public_profile_id = public_profile_id
      or appointment_id = any(appointment_ids)
      or patient_id = any(patient_ids)
    ) and not (id = any(review_ids))
  ) then
    raise exception 'Reset blocked: unmanaged reviews reference demo1 seed records.';
  end if;
end;
$$;

delete from public.doctor_reviews
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id in (
    '2a000000-0000-4000-8000-000000000001',
    '2a000000-0000-4000-8000-000000000002',
    '2a000000-0000-4000-8000-000000000003'
  );

delete from public.doctor_public_profiles
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id = '29000000-0000-4000-8000-000000000001';

delete from public.consents
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id in (
    '26000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000003',
    '26000000-0000-4000-8000-000000000004'
  );

delete from public.medical_notes
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id in (
    '25000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000003',
    '25000000-0000-4000-8000-000000000004',
    '25000000-0000-4000-8000-000000000005'
  );

delete from public.medical_note_templates
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id in (
    '24000000-0000-4000-8000-000000000001',
    '24000000-0000-4000-8000-000000000002'
  );

delete from public.payments
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id in (
    '23000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002',
    '23000000-0000-4000-8000-000000000003',
    '23000000-0000-4000-8000-000000000004',
    '23000000-0000-4000-8000-000000000005',
    '23000000-0000-4000-8000-000000000006',
    '23000000-0000-4000-8000-000000000007',
    '23000000-0000-4000-8000-000000000008',
    '23000000-0000-4000-8000-000000000009',
    '23000000-0000-4000-8000-000000000010',
    '23000000-0000-4000-8000-000000000011',
    '23000000-0000-4000-8000-000000000012'
  );

delete from public.appointments
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id in (
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000004',
    '22000000-0000-4000-8000-000000000005',
    '22000000-0000-4000-8000-000000000006',
    '22000000-0000-4000-8000-000000000007',
    '22000000-0000-4000-8000-000000000008',
    '22000000-0000-4000-8000-000000000009',
    '22000000-0000-4000-8000-000000000010',
    '22000000-0000-4000-8000-000000000011',
    '22000000-0000-4000-8000-000000000012',
    '22000000-0000-4000-8000-000000000013',
    '22000000-0000-4000-8000-000000000014',
    '22000000-0000-4000-8000-000000000015',
    '22000000-0000-4000-8000-000000000016',
    '22000000-0000-4000-8000-000000000017',
    '22000000-0000-4000-8000-000000000018'
  );

delete from public.clinical_records
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id in (
    '2b000000-0000-4000-8000-000000000001',
    '2b000000-0000-4000-8000-000000000002',
    '2b000000-0000-4000-8000-000000000003',
    '2b000000-0000-4000-8000-000000000004',
    '2b000000-0000-4000-8000-000000000005',
    '2b000000-0000-4000-8000-000000000006',
    '2b000000-0000-4000-8000-000000000007',
    '2b000000-0000-4000-8000-000000000008',
    '2b000000-0000-4000-8000-000000000009',
    '2b000000-0000-4000-8000-000000000010',
    '2b000000-0000-4000-8000-000000000011',
    '2b000000-0000-4000-8000-000000000012'
  );

delete from public.patients
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id in (
    '21000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000003',
    '21000000-0000-4000-8000-000000000004',
    '21000000-0000-4000-8000-000000000005',
    '21000000-0000-4000-8000-000000000006',
    '21000000-0000-4000-8000-000000000007',
    '21000000-0000-4000-8000-000000000008',
    '21000000-0000-4000-8000-000000000009',
    '21000000-0000-4000-8000-000000000010',
    '21000000-0000-4000-8000-000000000011',
    '21000000-0000-4000-8000-000000000012'
  );

delete from public.bot_settings
where clinic_id = '10000000-0000-4000-8000-000000000001'
  and id = '28000000-0000-4000-8000-000000000001';

commit;
