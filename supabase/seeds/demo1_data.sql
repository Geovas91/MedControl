-- Fictional demo1 dataset for controlled demonstrations only.
-- Never use real people, contact details, credentials, or clinical information here.

begin;

do $$
declare
  demo_clinic_id constant uuid := '10000000-0000-4000-8000-000000000001';
  demo_email constant text := 'demo1@clinicontrol.mx';
  demo_user_id uuid;
  demo_member_id uuid;
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
  signature_ids constant uuid[] := array[
    '27000000-0000-4000-8000-000000000001'::uuid,
    '27000000-0000-4000-8000-000000000002'::uuid
  ];
  demo_bot_id constant uuid := '28000000-0000-4000-8000-000000000001';
  demo_public_profile_id constant uuid := '29000000-0000-4000-8000-000000000001';
  review_ids constant uuid[] := array[
    '2a000000-0000-4000-8000-000000000001'::uuid,
    '2a000000-0000-4000-8000-000000000002'::uuid,
    '2a000000-0000-4000-8000-000000000003'::uuid
  ];
begin
  select id
  into demo_user_id
  from auth.users
  where email = demo_email
  limit 1;

  if demo_user_id is null then
    raise exception 'Required Auth user % does not exist. Run the account setup before demo1_data.sql.', demo_email;
  end if;

  perform 1
  from public.clinics
  where id = demo_clinic_id
    and tenant_type = 'demo'
  for update;

  if not found then
    raise exception 'Required demo1 tenant % does not exist or is not classified as demo.', demo_clinic_id;
  end if;

  select id
  into demo_member_id
  from public.clinic_members
  where clinic_id = demo_clinic_id
    and user_id = demo_user_id
    and role = 'owner'
    and status = 'active'
  limit 1;

  if demo_member_id is null then
    raise exception 'Required owner/active membership for % in demo1 does not exist. Run demo1_account.sql first.', demo_email;
  end if;

  if not exists (
    select 1
    from public.clinic_subscriptions
    where clinic_id = demo_clinic_id
      and plan_id = 'pro'
      and status = 'active'
      and billing_provider = 'demo'
      and current_period_end is null
      and cancel_at_period_end = false
  ) then
    raise exception 'demo1 must have an active permanent Pro subscription with billing_provider demo.';
  end if;

  insert into public.patients as existing_patient (
    id,
    clinic_id,
    primary_doctor_id,
    full_name,
    date_of_birth,
    sex,
    phone,
    email,
    relevant_history,
    status
  )
  select
    seeded.id,
    demo_clinic_id,
    demo_user_id,
    seeded.full_name,
    seeded.date_of_birth,
    seeded.sex,
    seeded.phone,
    seeded.email,
    'Dato ficticio de demostración; no representa antecedentes reales.',
    seeded.status::public.patient_status
  from (
    values
      (patient_ids[1], 'Paciente Demo 01', date '1988-02-14', 'female', '+1 202 555 0101', 'patient01@example.com', 'active'),
      (patient_ids[2], 'Paciente Demo 02', date '1976-11-03', 'male', '+1 202 555 0102', 'patient02@example.com', 'follow_up'),
      (patient_ids[3], 'Paciente Demo 03', date '1994-06-22', 'female', '+1 202 555 0103', 'patient03@example.com', 'active'),
      (patient_ids[4], 'Paciente Demo 04', date '1982-09-09', 'male', '+1 202 555 0104', 'patient04@example.com', 'active'),
      (patient_ids[5], 'Paciente Demo 05', date '2001-01-18', 'unspecified', '+1 202 555 0105', 'patient05@example.com', 'inactive'),
      (patient_ids[6], 'Paciente Demo 06', date '1969-04-27', 'female', '+1 202 555 0106', 'patient06@example.com', 'follow_up'),
      (patient_ids[7], 'Paciente Demo 07', date '1998-12-05', 'male', '+1 202 555 0107', 'patient07@example.com', 'active'),
      (patient_ids[8], 'Paciente Demo 08', date '1985-07-30', 'female', '+1 202 555 0108', 'patient08@example.com', 'active'),
      (patient_ids[9], 'Paciente Demo 09', date '1979-03-16', 'male', '+1 202 555 0109', 'patient09@example.com', 'active'),
      (patient_ids[10], 'Paciente Demo 10', date '1991-10-11', 'female', '+1 202 555 0110', 'patient10@example.com', 'active'),
      (patient_ids[11], 'Paciente Demo 11', date '2003-05-24', 'unspecified', '+1 202 555 0111', 'patient11@example.com', 'inactive'),
      (patient_ids[12], 'Paciente Demo 12', date '1972-08-08', 'male', '+1 202 555 0112', 'patient12@example.com', 'active')
  ) as seeded(id, full_name, date_of_birth, sex, phone, email, status)
  on conflict (id) do update
  set
    clinic_id = excluded.clinic_id,
    primary_doctor_id = excluded.primary_doctor_id,
    full_name = excluded.full_name,
    date_of_birth = excluded.date_of_birth,
    sex = excluded.sex,
    phone = excluded.phone,
    email = excluded.email,
    relevant_history = excluded.relevant_history,
    status = excluded.status
  where existing_patient.clinic_id = demo_clinic_id;

  if (select count(*) from public.patients where clinic_id = demo_clinic_id and id = any(patient_ids)) <> 12 then
    raise exception 'One or more deterministic patient UUIDs are owned outside demo1.';
  end if;

  insert into public.appointments as existing_appointment (
    id,
    clinic_id,
    patient_id,
    doctor_id,
    title,
    appointment_type,
    location,
    meeting_url,
    starts_at,
    ends_at,
    status,
    invite_status,
    reminder_status,
    notes
  )
  select
    seeded.id,
    demo_clinic_id,
    seeded.patient_id,
    demo_user_id,
    seeded.title,
    'Consulta ficticia',
    'Consultorio demo',
    null,
    seeded.starts_at,
    seeded.starts_at + interval '45 minutes',
    seeded.status::public.appointment_status,
    seeded.invite_status::public.invite_status,
    seeded.reminder_status::public.reminder_status,
    'Cita ficticia para demostración funcional.'
  from (
    values
      (appointment_ids[1], patient_ids[1], 'Consulta demo pasada 01', ((current_date - 14) + time '09:00')::timestamptz, 'completed', 'accepted', 'sent'),
      (appointment_ids[2], patient_ids[2], 'Consulta demo pasada 02', ((current_date - 10) + time '10:00')::timestamptz, 'completed', 'accepted', 'sent'),
      (appointment_ids[3], patient_ids[3], 'Consulta demo pasada 03', ((current_date - 7) + time '12:00')::timestamptz, 'completed', 'accepted', 'sent'),
      (appointment_ids[4], patient_ids[4], 'Consulta demo pasada 04', ((current_date - 5) + time '15:00')::timestamptz, 'completed', 'accepted', 'sent'),
      (appointment_ids[5], patient_ids[5], 'Consulta demo cancelada', ((current_date - 3) + time '11:00')::timestamptz, 'cancelled', 'declined', 'sent'),
      (appointment_ids[6], patient_ids[6], 'Seguimiento demo pasado 01', ((current_date - 2) + time '09:30')::timestamptz, 'completed', 'accepted', 'sent'),
      (appointment_ids[7], patient_ids[7], 'Seguimiento demo pasado 02', ((current_date - 1) + time '16:00')::timestamptz, 'completed', 'accepted', 'sent'),
      (appointment_ids[8], patient_ids[8], 'Consulta demo de hoy 01', (current_date + time '09:00')::timestamptz, 'waiting', 'accepted', 'sent'),
      (appointment_ids[9], patient_ids[9], 'Consulta demo de hoy 02', (current_date + time '11:00')::timestamptz, 'confirmed', 'accepted', 'sent'),
      (appointment_ids[10], patient_ids[10], 'Consulta demo de hoy 03', (current_date + time '14:00')::timestamptz, 'scheduled', 'sent', 'scheduled'),
      (appointment_ids[11], patient_ids[11], 'Consulta demo de hoy 04', (current_date + time '16:00')::timestamptz, 'scheduled', 'not_sent', 'not_scheduled'),
      (appointment_ids[12], patient_ids[12], 'Consulta demo próxima 01', ((current_date + 1) + time '09:00')::timestamptz, 'confirmed', 'accepted', 'scheduled'),
      (appointment_ids[13], patient_ids[1], 'Consulta demo próxima 02', ((current_date + 1) + time '11:00')::timestamptz, 'scheduled', 'sent', 'scheduled'),
      (appointment_ids[14], patient_ids[2], 'Consulta demo próxima 03', ((current_date + 2) + time '10:00')::timestamptz, 'scheduled', 'not_sent', 'not_scheduled'),
      (appointment_ids[15], patient_ids[3], 'Consulta demo próxima 04', ((current_date + 3) + time '13:00')::timestamptz, 'confirmed', 'accepted', 'scheduled'),
      (appointment_ids[16], patient_ids[4], 'Consulta demo próxima 05', ((current_date + 5) + time '15:00')::timestamptz, 'scheduled', 'sent', 'scheduled'),
      (appointment_ids[17], patient_ids[5], 'Consulta demo próxima 06', ((current_date + 7) + time '09:00')::timestamptz, 'scheduled', 'not_sent', 'not_scheduled'),
      (appointment_ids[18], patient_ids[6], 'Consulta demo próxima 07', ((current_date + 10) + time '12:00')::timestamptz, 'scheduled', 'not_sent', 'not_scheduled')
  ) as seeded(id, patient_id, title, starts_at, status, invite_status, reminder_status)
  on conflict (id) do update
  set
    clinic_id = excluded.clinic_id,
    patient_id = excluded.patient_id,
    doctor_id = excluded.doctor_id,
    title = excluded.title,
    appointment_type = excluded.appointment_type,
    location = excluded.location,
    meeting_url = excluded.meeting_url,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    invite_status = excluded.invite_status,
    reminder_status = excluded.reminder_status,
    notes = excluded.notes
  where existing_appointment.clinic_id = demo_clinic_id;

  if (select count(*) from public.appointments where clinic_id = demo_clinic_id and id = any(appointment_ids)) <> 18 then
    raise exception 'One or more deterministic appointment UUIDs are owned outside demo1.';
  end if;

  insert into public.payments as existing_payment (
    id,
    clinic_id,
    patient_id,
    appointment_id,
    amount,
    currency,
    status,
    payment_method,
    concept,
    paid_at
  )
  select
    seeded.id,
    demo_clinic_id,
    seeded.patient_id,
    seeded.appointment_id,
    seeded.amount,
    'MXN',
    seeded.status::public.payment_status,
    seeded.payment_method,
    'Cobro ficticio de demostración',
    seeded.paid_at
  from (
    values
      (payment_ids[1], patient_ids[1], appointment_ids[1], 650.00, 'paid', 'Efectivo demo', ((current_date - 14) + time '10:00')::timestamptz),
      (payment_ids[2], patient_ids[2], appointment_ids[2], 800.00, 'paid', 'Tarjeta demo', ((current_date - 10) + time '11:00')::timestamptz),
      (payment_ids[3], patient_ids[3], appointment_ids[3], 700.00, 'refunded', 'Tarjeta demo', ((current_date - 7) + time '13:00')::timestamptz),
      (payment_ids[4], patient_ids[4], appointment_ids[4], 900.00, 'paid', 'Transferencia demo', ((current_date - 5) + time '16:00')::timestamptz),
      (payment_ids[5], patient_ids[6], appointment_ids[6], 650.00, 'refunded', 'Efectivo demo', ((current_date - 2) + time '10:30')::timestamptz),
      (payment_ids[6], patient_ids[7], appointment_ids[7], 750.00, 'paid', 'Tarjeta demo', ((current_date - 1) + time '17:00')::timestamptz),
      (payment_ids[7], patient_ids[8], appointment_ids[8], 600.00, 'paid', 'Efectivo demo', now() - interval '2 hours'),
      (payment_ids[8], patient_ids[9], appointment_ids[9], 850.00, 'paid', 'Transferencia demo', now() - interval '1 hour'),
      (payment_ids[9], patient_ids[10], appointment_ids[10], 700.00, 'pending', 'Pendiente demo', null::timestamptz),
      (payment_ids[10], patient_ids[11], appointment_ids[11], 500.00, 'pending', 'Pendiente demo', null::timestamptz),
      (payment_ids[11], patient_ids[12], appointment_ids[12], 950.00, 'pending', 'Pendiente demo', null::timestamptz),
      (payment_ids[12], patient_ids[1], appointment_ids[13], 650.00, 'paid', 'Tarjeta demo', now() - interval '1 day')
  ) as seeded(id, patient_id, appointment_id, amount, status, payment_method, paid_at)
  on conflict (id) do update
  set
    clinic_id = excluded.clinic_id,
    patient_id = excluded.patient_id,
    appointment_id = excluded.appointment_id,
    amount = excluded.amount,
    currency = excluded.currency,
    status = excluded.status,
    payment_method = excluded.payment_method,
    concept = excluded.concept,
    paid_at = excluded.paid_at
  where existing_payment.clinic_id = demo_clinic_id;

  if (select count(*) from public.payments where clinic_id = demo_clinic_id and id = any(payment_ids)) <> 12 then
    raise exception 'One or more deterministic payment UUIDs are owned outside demo1.';
  end if;

  insert into public.medical_note_templates as existing_template (
    id,
    clinic_id,
    name,
    specialty,
    description,
    template_schema,
    is_system_template,
    is_active,
    created_by
  )
  values
    (
      template_ids[1],
      demo_clinic_id,
      'Plantilla demo general',
      'Demostración general',
      'Plantilla ficticia sin instrucciones clínicas.',
      '{"sections":[{"id":"summary","title":"Resumen demo","fields":[{"id":"summary","label":"Texto de ejemplo","type":"textarea","required":false}]}]}'::jsonb,
      false,
      true,
      demo_user_id
    ),
    (
      template_ids[2],
      demo_clinic_id,
      'Plantilla demo de seguimiento',
      'Seguimiento de demostración',
      'Plantilla ficticia para mostrar campos de seguimiento.',
      '{"sections":[{"id":"follow_up","title":"Seguimiento demo","fields":[{"id":"observation","label":"Observación ficticia","type":"textarea","required":false}]}]}'::jsonb,
      false,
      true,
      demo_user_id
    )
  on conflict (id) do update
  set
    clinic_id = excluded.clinic_id,
    name = excluded.name,
    specialty = excluded.specialty,
    description = excluded.description,
    template_schema = excluded.template_schema,
    is_system_template = excluded.is_system_template,
    is_active = excluded.is_active,
    created_by = excluded.created_by
  where existing_template.clinic_id = demo_clinic_id;

  if (select count(*) from public.medical_note_templates where clinic_id = demo_clinic_id and id = any(template_ids)) <> 2 then
    raise exception 'One or more deterministic template UUIDs are owned outside demo1.';
  end if;

  insert into public.medical_notes as existing_note (
    id,
    clinic_id,
    patient_id,
    doctor_id,
    appointment_id,
    template_id,
    status,
    specialty,
    clinical_impression,
    diagnosis,
    icd10_code,
    note_data,
    finalized_at
  )
  select
    seeded.id,
    demo_clinic_id,
    seeded.patient_id,
    demo_user_id,
    seeded.appointment_id,
    seeded.template_id,
    seeded.status::public.medical_note_status,
    'Demostración general',
    'Registro ficticio de demostración sin valoración clínica.',
    null,
    null,
    seeded.note_data,
    seeded.finalized_at
  from (
    values
      (note_ids[1], patient_ids[1], appointment_ids[1], template_ids[1], 'finalized', '{"demo":true,"summary":"Contenido ficticio de ejemplo 01."}'::jsonb, ((current_date - 14) + time '10:00')::timestamptz),
      (note_ids[2], patient_ids[2], appointment_ids[2], template_ids[2], 'finalized', '{"demo":true,"summary":"Contenido ficticio de ejemplo 02."}'::jsonb, ((current_date - 10) + time '11:00')::timestamptz),
      (note_ids[3], patient_ids[3], appointment_ids[3], template_ids[1], 'archived', '{"demo":true,"summary":"Contenido ficticio archivado."}'::jsonb, ((current_date - 7) + time '13:00')::timestamptz),
      (note_ids[4], patient_ids[6], appointment_ids[6], template_ids[2], 'finalized', '{"demo":true,"summary":"Contenido ficticio de seguimiento."}'::jsonb, ((current_date - 2) + time '10:30')::timestamptz),
      (note_ids[5], patient_ids[8], appointment_ids[8], template_ids[1], 'draft', '{"demo":true,"summary":"Borrador ficticio sin contenido clínico."}'::jsonb, null::timestamptz)
  ) as seeded(id, patient_id, appointment_id, template_id, status, note_data, finalized_at)
  on conflict (id) do update
  set
    clinic_id = excluded.clinic_id,
    patient_id = excluded.patient_id,
    doctor_id = excluded.doctor_id,
    appointment_id = excluded.appointment_id,
    template_id = excluded.template_id,
    status = excluded.status,
    specialty = excluded.specialty,
    clinical_impression = excluded.clinical_impression,
    diagnosis = excluded.diagnosis,
    icd10_code = excluded.icd10_code,
    note_data = excluded.note_data,
    finalized_at = excluded.finalized_at
  where existing_note.clinic_id = demo_clinic_id;

  if (select count(*) from public.medical_notes where clinic_id = demo_clinic_id and id = any(note_ids)) <> 5 then
    raise exception 'One or more deterministic medical note UUIDs are owned outside demo1.';
  end if;

  insert into public.consents as existing_consent (
    id,
    clinic_id,
    patient_id,
    created_by,
    consent_type,
    consent_version,
    consent_text,
    signing_token,
    status,
    expires_at,
    signed_at,
    revoked_at
  )
  select
    seeded.id,
    demo_clinic_id,
    seeded.patient_id,
    demo_user_id,
    seeded.consent_type,
    'demo-v1',
    'Consentimiento completamente ficticio para demostración. No constituye texto legal ni autorización real.',
    seeded.signing_token,
    seeded.status::public.consent_status,
    seeded.expires_at,
    seeded.signed_at,
    seeded.revoked_at
  from (
    values
      (consent_ids[1], patient_ids[1], 'Consentimiento demo firmado', 'demo1-fictional-consent-01-not-secret', 'signed', (current_date + 300)::timestamptz, ((current_date - 14) + time '10:05')::timestamptz, null::timestamptz),
      (consent_ids[2], patient_ids[8], 'Consentimiento demo pendiente', 'demo1-fictional-consent-02-not-secret', 'pending', (current_date + 30)::timestamptz, null::timestamptz, null::timestamptz),
      (consent_ids[3], patient_ids[2], 'Consentimiento demo expirado', 'demo1-fictional-consent-03-not-secret', 'expired', (current_date - 1)::timestamptz, null::timestamptz, null::timestamptz),
      (consent_ids[4], patient_ids[3], 'Consentimiento demo revocado', 'demo1-fictional-consent-04-not-secret', 'revoked', (current_date + 100)::timestamptz, ((current_date - 7) + time '13:05')::timestamptz, ((current_date - 2) + time '08:00')::timestamptz)
  ) as seeded(id, patient_id, consent_type, signing_token, status, expires_at, signed_at, revoked_at)
  on conflict (id) do update
  set
    clinic_id = excluded.clinic_id,
    patient_id = excluded.patient_id,
    created_by = excluded.created_by,
    consent_type = excluded.consent_type,
    consent_version = excluded.consent_version,
    consent_text = excluded.consent_text,
    signing_token = excluded.signing_token,
    status = excluded.status,
    expires_at = excluded.expires_at,
    signed_at = excluded.signed_at,
    revoked_at = excluded.revoked_at
  where existing_consent.clinic_id = demo_clinic_id;

  if (select count(*) from public.consents where clinic_id = demo_clinic_id and id = any(consent_ids)) <> 4 then
    raise exception 'One or more deterministic consent UUIDs are owned outside demo1.';
  end if;

  if exists (
    select 1
    from public.consent_signatures
    left join public.consents on consents.id = consent_signatures.consent_id
    where consent_signatures.id = any(signature_ids)
      and (
        consents.clinic_id is distinct from demo_clinic_id
        or not (consent_signatures.consent_id = any(consent_ids))
      )
  ) then
    raise exception 'One or more deterministic consent signature UUIDs are owned outside demo1.';
  end if;

  insert into public.consent_signatures (
    id,
    consent_id,
    patient_id,
    signer_full_name,
    signature_data,
    accepted_privacy_notice,
    accepted_sensitive_data_processing,
    signed_at,
    ip_metadata,
    user_agent,
    document_hash
  )
  values
    (
      signature_ids[1],
      consent_ids[1],
      patient_ids[1],
      'Firmante Demo 01',
      null,
      true,
      true,
      ((current_date - 14) + time '10:05')::timestamptz,
      null,
      'CliniControl fictional seed',
      null
    ),
    (
      signature_ids[2],
      consent_ids[4],
      patient_ids[3],
      'Firmante Demo 03',
      null,
      true,
      true,
      ((current_date - 7) + time '13:05')::timestamptz,
      null,
      'CliniControl fictional seed',
      null
    )
  on conflict (id) do update
  set
    consent_id = excluded.consent_id,
    patient_id = excluded.patient_id,
    signer_full_name = excluded.signer_full_name,
    signature_data = excluded.signature_data,
    accepted_privacy_notice = excluded.accepted_privacy_notice,
    accepted_sensitive_data_processing = excluded.accepted_sensitive_data_processing,
    signed_at = excluded.signed_at,
    ip_metadata = excluded.ip_metadata,
    user_agent = excluded.user_agent,
    document_hash = excluded.document_hash;

  if (
    select count(*)
    from public.consent_signatures
    join public.consents on consents.id = consent_signatures.consent_id
    where consent_signatures.id = any(signature_ids)
      and consents.clinic_id = demo_clinic_id
  ) <> 2 then
    raise exception 'One or more deterministic consent signature UUIDs are owned outside demo1.';
  end if;

  if exists (
    select 1
    from public.bot_settings
    where clinic_id = demo_clinic_id
      and id <> demo_bot_id
  ) or exists (
    select 1
    from public.bot_settings
    where id = demo_bot_id
      and clinic_id <> demo_clinic_id
  ) then
    raise exception 'demo1 already has a bot configuration not managed by demo1_data.sql.';
  end if;

  insert into public.bot_settings as existing_bot (
    id,
    clinic_id,
    enabled,
    channel,
    reminder_hours_before,
    quiet_hours_start,
    quiet_hours_end,
    max_reminders_per_patient,
    message_template,
    escalation_behavior
  )
  values (
    demo_bot_id,
    demo_clinic_id,
    false,
    'whatsapp',
    24,
    time '20:00',
    time '08:00',
    1,
    'Mensaje ficticio de recordatorio. No enviar.',
    'notify_clinic'
  )
  on conflict (id) do update
  set
    enabled = excluded.enabled,
    channel = excluded.channel,
    reminder_hours_before = excluded.reminder_hours_before,
    quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end,
    max_reminders_per_patient = excluded.max_reminders_per_patient,
    message_template = excluded.message_template,
    escalation_behavior = excluded.escalation_behavior
  where existing_bot.clinic_id = demo_clinic_id;

  if not exists (
    select 1
    from public.bot_settings
    where id = demo_bot_id
      and clinic_id = demo_clinic_id
      and enabled = false
  ) then
    raise exception 'The safe demo1 bot configuration could not be created.';
  end if;

  if exists (
    select 1
    from public.doctor_public_profiles
    where (clinic_member_id = demo_member_id or slug = 'demo1-ficticio')
      and id <> demo_public_profile_id
  ) or exists (
    select 1
    from public.doctor_public_profiles
    where id = demo_public_profile_id
      and clinic_id <> demo_clinic_id
  ) then
    raise exception 'demo1 already has a public profile not managed by demo1_data.sql.';
  end if;

  insert into public.doctor_public_profiles as existing_public_profile (
    id,
    clinic_id,
    profile_id,
    clinic_member_id,
    slug,
    display_name,
    professional_title,
    specialty,
    subspecialty,
    professional_license,
    specialty_license,
    bio,
    years_experience,
    languages,
    services,
    consultation_mode,
    address_line,
    city,
    state,
    country,
    phone,
    whatsapp,
    public_email,
    website_url,
    profile_image_url,
    is_published,
    accepts_new_patients
  )
  values (
    demo_public_profile_id,
    demo_clinic_id,
    demo_user_id,
    demo_member_id,
    'demo1-ficticio',
    'Profesional Demo 01',
    'Perfil profesional ficticio',
    'Medicina general de demostración',
    null,
    null,
    null,
    'Ficha pública completamente ficticia para mostrar el directorio de CliniControl.',
    0,
    array['Español'],
    array['Consulta ficticia', 'Seguimiento ficticio'],
    'hibrida',
    'Consultorio ficticio, sin ubicación real',
    'Ciudad Demo',
    'Estado Demo',
    'México',
    null,
    null,
    'demo1@example.com',
    'https://example.com',
    null,
    true,
    true
  )
  on conflict (id) do update
  set
    clinic_id = excluded.clinic_id,
    profile_id = excluded.profile_id,
    clinic_member_id = excluded.clinic_member_id,
    slug = excluded.slug,
    display_name = excluded.display_name,
    professional_title = excluded.professional_title,
    specialty = excluded.specialty,
    subspecialty = excluded.subspecialty,
    professional_license = excluded.professional_license,
    specialty_license = excluded.specialty_license,
    bio = excluded.bio,
    years_experience = excluded.years_experience,
    languages = excluded.languages,
    services = excluded.services,
    consultation_mode = excluded.consultation_mode,
    address_line = excluded.address_line,
    city = excluded.city,
    state = excluded.state,
    country = excluded.country,
    phone = excluded.phone,
    whatsapp = excluded.whatsapp,
    public_email = excluded.public_email,
    website_url = excluded.website_url,
    profile_image_url = excluded.profile_image_url,
    is_published = excluded.is_published,
    accepts_new_patients = excluded.accepts_new_patients
  where existing_public_profile.clinic_id = demo_clinic_id;

  if not exists (
    select 1
    from public.doctor_public_profiles
    where id = demo_public_profile_id
      and clinic_id = demo_clinic_id
      and profile_id = demo_user_id
      and clinic_member_id = demo_member_id
      and is_published = true
  ) then
    raise exception 'The fictional demo1 public profile could not be created.';
  end if;

  insert into public.doctor_reviews (
    id,
    doctor_public_profile_id,
    clinic_id,
    appointment_id,
    patient_id,
    rating,
    is_verified,
    is_visible
  )
  values
    (review_ids[1], demo_public_profile_id, demo_clinic_id, appointment_ids[1], patient_ids[1], 5, true, true),
    (review_ids[2], demo_public_profile_id, demo_clinic_id, appointment_ids[2], patient_ids[2], 4, true, true),
    (review_ids[3], demo_public_profile_id, demo_clinic_id, appointment_ids[3], patient_ids[3], 5, true, true)
  on conflict (id) do nothing;

  if (
    select count(*)
    from public.doctor_reviews
    where id = any(review_ids)
      and clinic_id = demo_clinic_id
      and doctor_public_profile_id = demo_public_profile_id
  ) <> 3 then
    raise exception 'One or more deterministic review UUIDs are owned outside demo1.';
  end if;
end;
$$;

commit;
