-- Run after a local `supabase db reset`.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users(id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'calendar-owner-a@example.test'),
  ('e1000000-0000-4000-8000-000000000002', 'calendar-doctor-a@example.test'),
  ('e1000000-0000-4000-8000-000000000003', 'calendar-assistant-a@example.test'),
  ('e1000000-0000-4000-8000-000000000004', 'calendar-doctor-b@example.test');

insert into public.clinics(id, name) values
  ('e2000000-0000-4000-8000-000000000001', 'Calendar Clinic A'),
  ('e2000000-0000-4000-8000-000000000002', 'Calendar Clinic B');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'doctor', 'active'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'assistant', 'active'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000004', 'doctor', 'active');

insert into public.patients(id, clinic_id, full_name, first_names, internal_identifier) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Calendar Patient A', 'Calendar Patient A', 'PAC-CALENDA01'),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'Calendar Patient B', 'Calendar Patient B', 'PAC-CALENDB01');

insert into public.appointments(id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at) values
  ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'Calendar appointment A', now() + interval '1 day', now() + interval '1 day 1 hour'),
  ('e4000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000004', 'Calendar appointment B', now() + interval '2 days', now() + interval '2 days 1 hour');

insert into public.calendar_integrations(
  id, clinic_id, user_id, provider, provider_calendar_id, calendar_name,
  sync_direction, refresh_token_encrypted, scopes, status, connected_at,
  token_encryption_version
) values
  ('e5000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'google', 'primary', 'Primary', 'clinicontrol_to_provider', 'v1.test.ciphertext.tag', array['https://www.googleapis.com/auth/calendar.events.owned'], 'connected', now(), 1),
  ('e5000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000004', 'google', 'primary', 'Primary', 'clinicontrol_to_provider', 'v1.test.ciphertext.tag', array['https://www.googleapis.com/auth/calendar.events.owned'], 'connected', now(), 1);

insert into public.google_calendar_oauth_states(clinic_id, user_id, state_hash, session_hash, expires_at)
values ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', repeat('a', 64), repeat('b', 64), now() + interval '10 minutes');

insert into public.google_calendar_events(
  id, clinic_id, appointment_id, integration_id, doctor_user_id,
  google_event_id, appointment_version, sync_status, last_synced_at
) values (
  'e6000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002',
  'safe-google-event-id',
  now(),
  'synced',
  now()
);

do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public'
      and table_name in ('calendar_integrations', 'google_calendar_oauth_states', 'google_calendar_events')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'Calendar secret tables retain client grants';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.calendar_integrations'::regclass
      and conname='calendar_integrations_clinic_user_provider_unique'
      and convalidated
  ) then
    raise exception 'Per-user/clinic/provider uniqueness is missing';
  end if;

  if (select count(*) from pg_indexes where schemaname='public' and indexname in (
    'google_calendar_oauth_states_expiry_idx',
    'google_calendar_events_appointment_idx',
    'google_calendar_events_pending_idx'
  )) <> 3 then
    raise exception 'Google Calendar indexes are missing';
  end if;

  if pg_get_function_result(
    'public.list_google_calendar_integration_status_for_current_user(uuid)'::regprocedure
  ) ~* '(token|scope|provider_calendar_id|google_event_id)' then
    raise exception 'Safe integration status RPC exposes a secret or provider identifier';
  end if;

  if has_function_privilege('anon',
      'public.list_google_calendar_integration_status_for_current_user(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated',
      'public.list_google_calendar_integration_status_for_current_user(uuid)', 'EXECUTE') then
    raise exception 'Safe integration status RPC grants are incorrect';
  end if;

  begin
    insert into public.calendar_integrations(
      clinic_id, user_id, provider, provider_calendar_id, sync_direction,
      refresh_token_encrypted, scopes, status, connected_at, token_encryption_version
    ) values (
      'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
      'google', 'primary', 'clinicontrol_to_provider', 'v1.test.ciphertext.tag',
      array['https://www.googleapis.com/auth/calendar'], 'connected', now(), 1
    );
    raise exception 'Broader Google Calendar scope was persisted';
  exception when check_violation then null;
  end;

  begin
    insert into public.calendar_integrations(
      clinic_id, user_id, provider, provider_calendar_id, sync_direction,
      access_token_encrypted, refresh_token_encrypted, scopes, status, connected_at, token_encryption_version
    ) values (
      'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
      'google', 'primary', 'clinicontrol_to_provider', 'must-not-persist', 'v1.test.ciphertext.tag',
      array['https://www.googleapis.com/auth/calendar.events.owned'], 'connected', now(), 1
    );
    raise exception 'Google access token was persisted';
  exception when check_violation then null;
  end;

  begin
    insert into public.google_calendar_events(
      clinic_id, appointment_id, integration_id, doctor_user_id,
      google_event_id, appointment_version, sync_status
    ) values (
      'e2000000-0000-4000-8000-000000000001',
      'e4000000-0000-4000-8000-000000000002',
      'e5000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000002',
      'cross-tenant-event', now(), 'synced'
    );
    raise exception 'Cross-tenant appointment mapping was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.google_calendar_events(
      clinic_id, appointment_id, integration_id, doctor_user_id,
      google_event_id, appointment_version, sync_status
    ) values (
      'e2000000-0000-4000-8000-000000000001',
      'e4000000-0000-4000-8000-000000000001',
      'e5000000-0000-4000-8000-000000000002',
      'e1000000-0000-4000-8000-000000000004',
      'foreign-integration-event', now(), 'synced'
    );
    raise exception 'Foreign integration mapping was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.google_calendar_events(
      clinic_id, appointment_id, integration_id, doctor_user_id,
      google_event_id, appointment_version, sync_status
    ) values (
      'e2000000-0000-4000-8000-000000000001',
      'e4000000-0000-4000-8000-000000000001',
      'e5000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000002',
      'duplicate-event', now(), 'synced'
    );
    raise exception 'Duplicate appointment/integration mapping was accepted';
  exception when unique_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
do $$
begin
  if (select count(*) from public.list_google_calendar_integration_status_for_current_user(
    'e2000000-0000-4000-8000-000000000001'
  )) <> 1 then
    raise exception 'Owner did not receive the clinic-safe Google integration status';
  end if;
  if (select count(*) from public.list_google_calendar_integration_status_for_current_user(
    'e2000000-0000-4000-8000-000000000002'
  )) <> 0 then
    raise exception 'Owner crossed tenant boundary through the status RPC';
  end if;
  begin
    perform * from public.calendar_integrations;
    raise exception 'Owner read encrypted calendar integration rows directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.google_calendar_oauth_states;
    raise exception 'Owner read OAuth states directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.google_calendar_events;
    raise exception 'Owner read Google event ids directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.list_google_calendar_integration_status_for_current_user(
    'e2000000-0000-4000-8000-000000000001'
  )) <> 1 then
    raise exception 'Doctor did not receive their own integration status';
  end if;
  if exists (
    select 1 from public.list_google_calendar_integration_status_for_current_user(
      'e2000000-0000-4000-8000-000000000001'
    ) where user_id <> 'e1000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Doctor received another user integration status';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000003', true);
do $$
begin
  if (select count(*) from public.list_google_calendar_integration_status_for_current_user(
    'e2000000-0000-4000-8000-000000000001'
  )) <> 0 then
    raise exception 'Assistant received Google integration status';
  end if;
  begin
    insert into public.calendar_integrations(clinic_id, user_id, provider)
    values ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'google');
    raise exception 'Assistant connected a Google account directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform * from public.list_google_calendar_integration_status_for_current_user(
      'e2000000-0000-4000-8000-000000000001'
    );
    raise exception 'Anonymous user executed the safe integration status RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.calendar_integrations;
    raise exception 'Anonymous user read calendar integrations';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select extensions.pass('0029 Google Calendar tenant integrity and secret isolation');
select * from extensions.finish();
rollback;
