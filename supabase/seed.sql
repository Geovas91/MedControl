-- Fictional CliniControl seed data for local development only.
-- Do not use real patient, clinic, or provider information in seed files.

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'demo.doctor@clinicontrol.local',
  crypt('demo-password', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Dr. Demo Morgan"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, email, phone, role)
values (
  '00000000-0000-0000-0000-000000000001',
  'Dr. Demo Morgan',
  'demo.doctor@clinicontrol.local',
  '+52 55 0000 0000',
  'doctor'
)
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  role = excluded.role;

insert into public.clinics (id, name, legal_name, phone, email, address, timezone, plan)
values (
  '10000000-0000-0000-0000-000000000001',
  'CliniControl Demo Clinic',
  'CliniControl Demo Clinic S.A. de C.V.',
  '+52 55 0101 0101',
  'clinic.demo@clinicontrol.local',
  'Demo Street 123, Mexico City',
  'America/Mexico_City',
  'professional'
)
on conflict (id) do nothing;

insert into public.clinic_members (clinic_id, user_id, role, status)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'owner',
  'active'
)
on conflict (clinic_id, user_id) do update set role = excluded.role, status = excluded.status;

insert into public.patients (
  id,
  clinic_id,
  primary_doctor_id,
  full_name,
  date_of_birth,
  sex,
  phone,
  email,
  allergies,
  current_medications,
  relevant_history,
  status
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Demo Alicia Rivera',
    '1984-03-12',
    'female',
    '+52 55 0202 0202',
    'demo.alicia@clinicontrol.local',
    'Demo allergy note',
    'Demo medication note',
    'Fictional history for UI testing only',
    'active'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Demo Marco Silva',
    '1990-08-21',
    'male',
    '+52 55 0303 0303',
    'demo.marco@clinicontrol.local',
    null,
    null,
    'Fictional history for UI testing only',
    'follow_up'
  )
on conflict (id) do nothing;

insert into public.appointments (
  id,
  clinic_id,
  patient_id,
  doctor_id,
  title,
  appointment_type,
  location,
  starts_at,
  ends_at,
  status,
  invite_status,
  reminder_status,
  notes
)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Demo follow-up appointment',
  'Follow-up',
  'Demo room 1',
  '2026-06-04 09:00:00-06',
  '2026-06-04 09:30:00-06',
  'scheduled',
  'not_sent',
  'not_scheduled',
  'Demo scheduling note only'
)
on conflict (id) do nothing;

insert into public.medical_note_templates (
  id,
  clinic_id,
  name,
  specialty,
  description,
  template_schema,
  is_system_template,
  created_by
)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Demo general medicine note',
  'General Medicine',
  'Fictional template for local development.',
  '{"sections":[{"id":"reason","title":"Reason for consultation","fields":[{"id":"reason","label":"Reason","type":"textarea","required":true}]}]}'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into public.consents (
  id,
  clinic_id,
  patient_id,
  created_by,
  consent_type,
  consent_version,
  consent_text,
  signing_token,
  status,
  expires_at
)
values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'General patient consent',
  'demo-v1',
  'Demo consent text for local development only. Review legal language before real use.',
  'demo-seed-token',
  'pending',
  now() + interval '30 days'
)
on conflict (id) do nothing;

insert into public.bot_settings (
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
  '10000000-0000-0000-0000-000000000001',
  false,
  'whatsapp',
  24,
  '20:00',
  '08:00',
  2,
  'Hello {{patientName}}, this is a demo appointment reminder. Reply 1 to confirm, 2 to reschedule, or 3 to cancel.',
  'notify_clinic'
)
on conflict (clinic_id) do update set
  enabled = excluded.enabled,
  channel = excluded.channel,
  reminder_hours_before = excluded.reminder_hours_before,
  quiet_hours_start = excluded.quiet_hours_start,
  quiet_hours_end = excluded.quiet_hours_end,
  max_reminders_per_patient = excluded.max_reminders_per_patient,
  message_template = excluded.message_template,
  escalation_behavior = excluded.escalation_behavior;
