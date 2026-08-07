-- This setup must be concatenated with migration 0020 and executed with
-- ON_ERROR_STOP=1. The expected result is a unique_violation while creating
-- appointment_invites_appointment_email_unique_idx. The open transaction is
-- automatically rolled back when psql exits after that expected error.
begin;

insert into auth.users(id, email)
values ('10000000-0000-4000-8000-000000000029', 'duplicate-guard@example.test');
insert into public.clinics(id, name)
values ('20000000-0000-4000-8000-000000000029', 'Duplicate Guard Clinic');
insert into public.patients(id, clinic_id, full_name)
values (
  '30000000-0000-4000-8000-000000000029',
  '20000000-0000-4000-8000-000000000029',
  'Duplicate Guard Patient'
);
insert into public.appointments(id, clinic_id, patient_id, title, starts_at, ends_at)
values (
  '40000000-0000-4000-8000-000000000029',
  '20000000-0000-4000-8000-000000000029',
  '30000000-0000-4000-8000-000000000029',
  'Duplicate Guard Appointment',
  now() + interval '3 days',
  now() + interval '3 days 1 hour'
);

drop index public.appointment_invites_appointment_email_unique_idx;

insert into public.appointment_invites(
  clinic_id, appointment_id, patient_id, channel, ics_uid, last_idempotency_key
) values
  (
    '20000000-0000-4000-8000-000000000029',
    '40000000-0000-4000-8000-000000000029',
    '30000000-0000-4000-8000-000000000029',
    'email', 'duplicate-a@example.test', 'duplicate-a'
  ),
  (
    '20000000-0000-4000-8000-000000000029',
    '40000000-0000-4000-8000-000000000029',
    '30000000-0000-4000-8000-000000000029',
    'email', 'duplicate-b@example.test', 'duplicate-b'
  );
