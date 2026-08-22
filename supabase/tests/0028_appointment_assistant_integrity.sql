-- Run after a local `supabase db reset`.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users(id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'assistant-owner-a@example.test'),
  ('d1000000-0000-4000-8000-000000000002', 'assistant-admin-a@example.test'),
  ('d1000000-0000-4000-8000-000000000003', 'assistant-doctor-a@example.test'),
  ('d1000000-0000-4000-8000-000000000004', 'assistant-scheduler-a@example.test'),
  ('d1000000-0000-4000-8000-000000000005', 'assistant-outsider@example.test');

insert into public.clinics(id, name) values
  ('d2000000-0000-4000-8000-000000000001', 'Asistente Clínica A'),
  ('d2000000-0000-4000-8000-000000000002', 'Asistente Clínica B');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'doctor', 'active'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 'assistant', 'active'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000005', 'owner', 'suspended');

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values
  ('d2000000-0000-4000-8000-000000000001', 'pro', 'active', 'manual'),
  ('d2000000-0000-4000-8000-000000000002', 'pro', 'active', 'manual');

insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier) values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Paciente Agenda A', 'Paciente Agenda A', 'PAC-ASSISTA01'),
  ('d3000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'Paciente Agenda A Dos', 'Paciente Agenda A Dos', 'PAC-ASSISTA02'),
  ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'Paciente Agenda B', 'Paciente Agenda B', 'PAC-ASSISTB01');

insert into public.appointments(id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at, status, created_at) values
  ('d4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'Cita real A', now() + interval '1 day', now() + interval '1 day 1 hour', 'scheduled', timestamptz '2099-01-01 00:00:00+00'),
  ('d4000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002', null, 'Cita real B', now() + interval '2 days', now() + interval '2 days 1 hour', 'scheduled', now() - interval '1 hour');

insert into public.appointment_invites(
  id, clinic_id, appointment_id, patient_id, channel, provider, status, ics_uid,
  sequence, last_method, last_idempotency_key, delivery_status, provider_message_id,
  last_attempted_at, sent_at
) values (
  'd5000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'email', 'resend', 'sent', 'd4000000-0000-4000-8000-000000000001@calendar.clinicontrol.mx',
  0, 'REQUEST', 'assistant-test-send', 'sent', 'provider-test-id', now() - interval '30 minutes', now() - interval '30 minutes'
);

-- Two source tables may legitimately reuse a UUID. Matching all three cursor
-- fields proves the merged timeline cannot skip a boundary collision.
insert into public.audit_logs(id, clinic_id, entity_type, entity_id, action, metadata, created_at)
values (
  'd4000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'appointment',
  'd4000000-0000-4000-8000-000000000001',
  'appointment_waiting',
  '{"must_not_leak":"test-secret"}'::jsonb,
  timestamptz '2099-01-01 00:00:00+00'
);

do $$
begin
  if (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='bot_settings' and grantee='authenticated') <> 1
    or not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='bot_settings' and grantee='authenticated' and privilege_type='SELECT'
    ) then
    raise exception 'Authenticated bot_settings grants are not SELECT-only';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name in ('bot_settings', 'bot_logs')
      and grantee in ('anon', 'PUBLIC')
  ) or exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='bot_logs' and grantee='authenticated'
  ) then
    raise exception 'Bot tables retain unsafe direct grants';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.appointments'::regclass
      and conname='appointments_clinic_patient_fk'
      and convalidated
  ) then
    raise exception 'The appointment tenant/patient foreign key is not validated';
  end if;
  if (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='appointments' and grantee='authenticated') <> 3
    or exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='appointments' and grantee='authenticated'
        and privilege_type not in ('SELECT', 'INSERT', 'UPDATE')
    ) or exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='appointments' and grantee in ('anon', 'PUBLIC')
    ) then
    raise exception 'Appointment grants are broader than SELECT, INSERT, UPDATE for authenticated';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='audit_logs'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'Client roles retain direct audit_logs privileges';
  end if;
  if (select count(*) from pg_indexes where schemaname='public' and indexname in (
    'appointments_clinic_starts_id_idx',
    'appointments_clinic_status_starts_id_idx',
    'audit_logs_appointment_timeline_idx'
  )) <> 3 then
    raise exception 'Appointment assistant indexes are missing';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid='public.audit_appointment_schedule_change()'::regprocedure and prosecdef
  ) then
    raise exception 'The audit trigger lacks the required definer boundary';
  end if;
  if exists (
    select 1 from pg_proc
    where oid='public.protect_appointment_integrity()'::regprocedure and prosecdef
  ) then
    raise exception 'The appointment relation guard became SECURITY DEFINER';
  end if;
  if pg_get_function_result('public.list_appointment_assistant_activity_for_current_user(uuid,timestamptz,text,uuid,integer)'::regprocedure)
    <> 'TABLE(event_id uuid, event_source text, action text, appointment_id uuid, patient_name text, occurred_at timestamp with time zone)' then
    raise exception 'The activity RPC exposes unsafe fields';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);

select * from public.save_appointment_assistant_settings_for_current_user(
  'd2000000-0000-4000-8000-000000000001', true, 24, time '20:00', time '08:00'
);

do $$
begin
  if not exists (
    select 1 from public.bot_settings
    where clinic_id='d2000000-0000-4000-8000-000000000001'
      and enabled and reminder_hours_before=24
      and quiet_hours_start=time '20:00' and quiet_hours_end=time '08:00'
  ) then
    raise exception 'Owner settings were not persisted';
  end if;
  begin
    insert into public.audit_logs(clinic_id, entity_type, action)
    values ('d2000000-0000-4000-8000-000000000001', 'appointment', 'fabricated');
    raise exception 'Owner fabricated an audit event directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.bot_settings(clinic_id) values ('d2000000-0000-4000-8000-000000000002');
    raise exception 'Owner wrote bot_settings directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bot_settings set clinic_id='d2000000-0000-4000-8000-000000000002'
    where clinic_id='d2000000-0000-4000-8000-000000000001';
    raise exception 'Owner manipulated bot_settings clinic_id directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.save_appointment_assistant_settings_for_current_user(
      'd2000000-0000-4000-8000-000000000002', true, 24, null, null
    );
    raise exception 'Owner configured a foreign clinic';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.save_appointment_assistant_settings_for_current_user(
      'd2000000-0000-4000-8000-000000000001', true, 0, null, null
    );
    raise exception 'Invalid reminder window was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform * from public.save_appointment_assistant_settings_for_current_user(
      'd2000000-0000-4000-8000-000000000001', true, 24, time '20:00', null
    );
    raise exception 'Unpaired quiet hours were accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

update public.appointments
set status='confirmed'
where id='d4000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.list_appointment_assistant_activity_for_current_user(
      'd2000000-0000-4000-8000-000000000001', null, null, null, 20
    ) where action='appointment_confirmed' and appointment_id='d4000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Confirmed appointment activity was not audited';
  end if;
  if not exists (
    select 1 from public.list_appointment_assistant_activity_for_current_user(
      'd2000000-0000-4000-8000-000000000001', null, null, null, 20
    ) where action='calendar_invitation_sent' and appointment_id='d4000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Real calendar delivery activity is missing';
  end if;
  if exists (
    select 1 from public.list_appointment_assistant_activity_for_current_user(
      'd2000000-0000-4000-8000-000000000001', null, null, null, 20
    ) where appointment_id='d4000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Cross-tenant appointment activity leaked';
  end if;
  if (select count(*) from public.list_appointment_assistant_activity_for_current_user(
    'd2000000-0000-4000-8000-000000000001', null, null, null, 1
  )) <> 1 then
    raise exception 'Activity page limit was not enforced';
  end if;
  if not exists (
    select 1 from public.list_appointment_assistant_activity_for_current_user(
      'd2000000-0000-4000-8000-000000000001',
      timestamptz '2099-01-01 00:00:00+00',
      'audit_log',
      'd4000000-0000-4000-8000-000000000001',
      1
    ) where event_source='appointment' and event_id='d4000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Stable activity cursor skipped an equal timestamp/id from another source';
  end if;
  begin
    insert into public.appointments(clinic_id, patient_id, title, starts_at, ends_at, status)
    values (
      'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      'Invalid initial status', now() - interval '2 hours', now() - interval '1 hour', 'completed'
    );
    raise exception 'Direct insert bypassed the initial appointment state';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.appointments(clinic_id, patient_id, title, starts_at, ends_at)
    values (
      'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000002',
      'Cross tenant patient', now() + interval '3 days', now() + interval '3 days 1 hour'
    );
    raise exception 'Cross-tenant patient appointment was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.appointments
    set id='d4000000-0000-4000-8000-000000000099'
    where id='d4000000-0000-4000-8000-000000000001';
    raise exception 'Appointment id was reassigned';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.appointments
    set created_at=created_at - interval '1 day'
    where id='d4000000-0000-4000-8000-000000000001';
    raise exception 'Appointment created_at was changed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.appointments
    set clinic_id='d2000000-0000-4000-8000-000000000002'
    where id='d4000000-0000-4000-8000-000000000001';
    raise exception 'Appointment clinic_id was reassigned';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.appointments
    set patient_id='d3000000-0000-4000-8000-000000000003'
    where id='d4000000-0000-4000-8000-000000000001';
    raise exception 'Appointment patient_id was reassigned';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before
  from public.list_appointment_assistant_activity_for_current_user(
    'd2000000-0000-4000-8000-000000000001', null, null, null, 20
  ) where event_source='audit_log';

  update public.appointments set notes='Cambio no auditable'
  where id='d4000000-0000-4000-8000-000000000001';

  select count(*) into v_after
  from public.list_appointment_assistant_activity_for_current_user(
    'd2000000-0000-4000-8000-000000000001', null, null, null, 20
  ) where event_source='audit_log';

  if v_after <> v_before then
    raise exception 'Non-schedule appointment update created audit noise';
  end if;

  update public.appointments
  set starts_at=starts_at + interval '1 hour', ends_at=ends_at + interval '1 hour'
  where id='d4000000-0000-4000-8000-000000000001';

  if (select count(*) from public.list_appointment_assistant_activity_for_current_user(
    'd2000000-0000-4000-8000-000000000001', null, null, null, 20
  ) where event_source='audit_log' and action='appointment_rescheduled') <> 1 then
    raise exception 'A single reschedule did not produce exactly one audit event';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);
do $$
begin
  if (select count(*) from public.bot_settings) <> 0 then
    raise exception 'Doctor read global assistant settings';
  end if;
  if not exists (
    select 1 from public.list_appointment_assistant_activity_for_current_user(
      'd2000000-0000-4000-8000-000000000001', null, null, null, 20
    ) where appointment_id='d4000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Doctor could not read authorized agenda activity';
  end if;
  begin
    perform * from public.save_appointment_assistant_settings_for_current_user(
      'd2000000-0000-4000-8000-000000000001', false, 48, null, null
    );
    raise exception 'Doctor changed global assistant settings';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.appointments(clinic_id, patient_id, doctor_id, title, starts_at, ends_at)
    values (
      'd2000000-0000-4000-8000-000000000002',
      'd3000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000003',
      'Foreign clinic write', now() + interval '4 days', now() + interval '4 days 1 hour'
    );
    raise exception 'Doctor inserted an appointment in a foreign clinic';
  exception when insufficient_privilege then null;
  end;

  insert into public.appointments(
    id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at
  ) values (
    'd4000000-0000-4000-8000-000000000003',
    'd2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000003',
    'd1000000-0000-4000-8000-000000000003',
    'Doctor scheduled appointment', now() + interval '4 days', now() + interval '4 days 1 hour'
  );

  update public.appointments set title='Doctor updated allowed content'
  where id='d4000000-0000-4000-8000-000000000003';
  if not found then
    raise exception 'Doctor could not perform an allowed appointment update';
  end if;

  begin
    update public.appointments set status='completed'
    where id='d4000000-0000-4000-8000-000000000003';
    raise exception 'Doctor completed a future appointment directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.appointments set status='waiting'
    where id='d4000000-0000-4000-8000-000000000003';
    raise exception 'Doctor moved a future appointment to waiting directly';
  exception when insufficient_privilege then null;
  end;

  insert into public.appointments(
    id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at
  ) values (
    'd4000000-0000-4000-8000-000000000004',
    'd2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000003',
    'd1000000-0000-4000-8000-000000000003',
    'Doctor past appointment', now() - interval '2 days', now() - interval '2 days' + interval '1 hour'
  );
  begin
    update public.appointments set status='confirmed'
    where id='d4000000-0000-4000-8000-000000000004';
    raise exception 'Doctor confirmed a past appointment directly';
  exception when insufficient_privilege then null;
  end;
  update public.appointments set status='completed'
  where id='d4000000-0000-4000-8000-000000000004';
  begin
    update public.appointments set status='cancelled'
    where id='d4000000-0000-4000-8000-000000000004';
    raise exception 'Completed appointment left its terminal state';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.appointments set starts_at=starts_at + interval '1 hour', ends_at=ends_at + interval '1 hour'
    where id='d4000000-0000-4000-8000-000000000004';
    raise exception 'Completed appointment schedule changed directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.appointments set status='scheduled'
    where id='d4000000-0000-4000-8000-000000000001';
    raise exception 'Doctor bypassed the status transition graph';
  exception when insufficient_privilege then null;
  end;

  update public.appointments set status='cancelled'
  where id='d4000000-0000-4000-8000-000000000001';
  if not found then
    raise exception 'Doctor could not perform an allowed cancellation';
  end if;

  begin
    update public.appointments set status='scheduled'
    where id='d4000000-0000-4000-8000-000000000001';
    raise exception 'Doctor restored a cancelled appointment directly';
  exception when insufficient_privilege then null;
  end;

  update public.appointments set title='Cross-tenant update'
  where id='d4000000-0000-4000-8000-000000000002';
  if found then
    raise exception 'Doctor updated a foreign-clinic appointment';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
select * from public.save_appointment_assistant_settings_for_current_user(
  'd2000000-0000-4000-8000-000000000001', false, 48, null, null
);
do $$
begin
  if not exists (
    select 1 from public.bot_settings
    where clinic_id='d2000000-0000-4000-8000-000000000001'
      and not enabled and reminder_hours_before=48
  ) then
    raise exception 'Admin could not read and modify assistant settings';
  end if;

  update public.appointments set status='scheduled'
  where id='d4000000-0000-4000-8000-000000000001';
  if not found then
    raise exception 'Admin could not restore a cancelled appointment';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000004', true);
do $$
begin
  if (select count(*) from public.bot_settings) <> 0 then
    raise exception 'Assistant read global assistant settings';
  end if;
  if not exists (
    select 1 from public.list_appointment_assistant_activity_for_current_user(
      'd2000000-0000-4000-8000-000000000001', null, null, null, 20
    ) where appointment_id='d4000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Assistant could not read authorized agenda activity';
  end if;
  begin
    update public.appointments set status='cancelled'
    where id='d4000000-0000-4000-8000-000000000001';
    if found then
      raise exception 'Assistant updated an appointment directly';
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.appointments(clinic_id, patient_id, title, starts_at, ends_at)
    values (
      'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      'Assistant direct insert', now() + interval '5 days', now() + interval '5 days 1 hour'
    );
    raise exception 'Assistant inserted an appointment directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.bot_logs(clinic_id, appointment_id, patient_id, message)
    values (
      'd2000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      'fabricated bot log'
    );
    raise exception 'Assistant fabricated a bot log directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.audit_logs(clinic_id, entity_type, action)
    values ('d2000000-0000-4000-8000-000000000001', 'appointment', 'fabricated');
    raise exception 'Assistant fabricated an audit event directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.save_appointment_assistant_settings_for_current_user(
      'd2000000-0000-4000-8000-000000000001', false, 48, null, null
    );
    raise exception 'Assistant changed global assistant settings';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000005', true);
do $$
begin
  if exists (
    select 1 from public.list_appointment_assistant_activity_for_current_user(
      'd2000000-0000-4000-8000-000000000001', null, null, null, 20
    )
  ) then
    raise exception 'Inactive member received appointment activity';
  end if;
  begin
    perform * from public.save_appointment_assistant_settings_for_current_user(
      'd2000000-0000-4000-8000-000000000001', false, 48, null, null
    );
    raise exception 'Inactive owner changed global assistant settings';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform * from public.list_appointment_assistant_activity_for_current_user(
      'd2000000-0000-4000-8000-000000000001', null, null, null, 20
    );
    raise exception 'Anonymous user executed assistant activity RPC';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select extensions.pass('0028 appointment assistant integrity, roles and tenant isolation');
select * from extensions.finish();
rollback;
