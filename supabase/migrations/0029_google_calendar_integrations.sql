-- Real per-user Google Calendar integration. OAuth tokens remain server-only and
-- access tokens are intentionally never persisted.

do $$
begin
  if exists (
    select 1 from public.calendar_integrations
    where access_token_encrypted is not null
  ) then
    raise exception 'Cannot harden calendar integrations while persisted access tokens exist.';
  end if;

  if exists (
    select 1
    from public.calendar_integrations
    group by clinic_id, user_id, provider
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one calendar integration per clinic, user and provider: duplicates found.';
  end if;

  if exists (
    select 1 from public.calendar_integrations
    where status = 'connected'
      and (provider <> 'google' or refresh_token_encrypted is null)
  ) then
    raise exception 'Cannot migrate an incomplete connected calendar integration.';
  end if;
end;
$$;

alter table public.calendar_integrations
  add column scopes text[] not null default '{}'::text[],
  add column connected_at timestamptz,
  add column revoked_at timestamptz,
  add column last_error_code text,
  add column token_encryption_version smallint;

alter table public.calendar_integrations
  add constraint calendar_integrations_clinic_user_provider_unique
    unique (clinic_id, user_id, provider),
  add constraint calendar_integrations_clinic_id_user_unique
    unique (clinic_id, id, user_id),
  add constraint calendar_integrations_access_token_null_check
    check (access_token_encrypted is null),
  add constraint calendar_integrations_error_code_check
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  add constraint calendar_integrations_google_shape_check check (
    provider <> 'google' or status <> 'connected' or (
      provider_calendar_id = 'primary'
      and sync_direction = 'clinicontrol_to_provider'
      and scopes <@ array['https://www.googleapis.com/auth/calendar.events.owned']::text[]
    )
  ),
  add constraint calendar_integrations_connected_secret_check check (
    status <> 'connected' or (
      provider = 'google'
      and refresh_token_encrypted is not null
      and token_encryption_version = 1
      and scopes = array['https://www.googleapis.com/auth/calendar.events.owned']::text[]
      and connected_at is not null
      and revoked_at is null
    )
  );

comment on column public.calendar_integrations.access_token_encrypted is
  'Must remain NULL. Google access tokens are short-lived and used only in server memory.';
comment on column public.calendar_integrations.refresh_token_encrypted is
  'AES-256-GCM encrypted Google refresh token. Never selectable by client roles.';

drop policy if exists "Clinic owners and admins can read calendar integrations" on public.calendar_integrations;
drop policy if exists "Clinic owners and admins can manage calendar integrations" on public.calendar_integrations;
revoke all privileges on table public.calendar_integrations from public, anon, authenticated;

create or replace function public.list_google_calendar_integration_status_for_current_user(
  p_clinic_id uuid
)
returns table (
  user_id uuid,
  status public.calendar_integration_status,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error_code text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select integration.user_id, integration.status, integration.connected_at,
    integration.last_sync_at, integration.last_error_code
  from public.calendar_integrations as integration
  where integration.clinic_id = p_clinic_id
    and integration.provider = 'google'
    and public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor'])
    and (
      public.has_clinic_role(p_clinic_id, array['owner', 'admin'])
      or integration.user_id = auth.uid()
    );
$$;

revoke all on function public.list_google_calendar_integration_status_for_current_user(uuid)
  from public, anon, authenticated;
grant execute on function public.list_google_calendar_integration_status_for_current_user(uuid)
  to authenticated;

comment on function public.list_google_calendar_integration_status_for_current_user(uuid) is
  'Safe Calendar status projection: owner/admin see clinic status; doctors see only their own row. No OAuth secrets or provider event ids.';

create table public.google_calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  session_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint google_calendar_oauth_states_hash_check check (state_hash ~ '^[a-f0-9]{64}$'),
  constraint google_calendar_oauth_states_session_hash_check check (session_hash ~ '^[a-f0-9]{64}$'),
  constraint google_calendar_oauth_states_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  constraint google_calendar_oauth_states_consumed_check check (consumed_at is null or consumed_at >= created_at)
);

alter table public.google_calendar_oauth_states enable row level security;
revoke all privileges on table public.google_calendar_oauth_states from public, anon, authenticated;
create index google_calendar_oauth_states_expiry_idx
  on public.google_calendar_oauth_states(expires_at)
  where consumed_at is null;

alter table public.appointments
  add constraint appointments_clinic_id_id_unique unique (clinic_id, id);

create table public.google_calendar_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  appointment_id uuid not null,
  integration_id uuid not null,
  doctor_user_id uuid not null,
  google_event_id text,
  appointment_version timestamptz not null,
  sync_status text not null default 'pending',
  last_error_code text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_events_appointment_fk
    foreign key (clinic_id, appointment_id)
    references public.appointments(clinic_id, id) on delete cascade,
  constraint google_calendar_events_integration_fk
    foreign key (clinic_id, integration_id, doctor_user_id)
    references public.calendar_integrations(clinic_id, id, user_id) on delete cascade,
  constraint google_calendar_events_integration_appointment_unique
    unique (integration_id, appointment_id),
  constraint google_calendar_events_status_check
    check (sync_status in ('pending', 'synced', 'deleted', 'failed')),
  constraint google_calendar_events_event_id_check
    check (google_event_id is null or (char_length(google_event_id) between 1 and 1024 and google_event_id !~ '[[:cntrl:]]')),
  constraint google_calendar_events_error_check
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  constraint google_calendar_events_synced_shape_check
    check (sync_status not in ('synced', 'deleted') or google_event_id is not null)
);

create trigger google_calendar_events_set_updated_at
before update on public.google_calendar_events
for each row execute function public.set_updated_at();

alter table public.google_calendar_events enable row level security;
revoke all privileges on table public.google_calendar_events from public, anon, authenticated;
create index google_calendar_events_appointment_idx
  on public.google_calendar_events(clinic_id, appointment_id);
create index google_calendar_events_pending_idx
  on public.google_calendar_events(clinic_id, sync_status, updated_at)
  where sync_status in ('pending', 'failed');
