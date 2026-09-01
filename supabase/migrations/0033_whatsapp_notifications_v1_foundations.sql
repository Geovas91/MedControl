-- WhatsApp Notifications v1, phase 1: data foundations only.
-- This migration does not enqueue WhatsApp jobs, call Meta or expose client projections.

create table public.whatsapp_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  scope text not null,
  owner_clinic_id uuid references public.clinics(id) on delete restrict,
  waba_id text not null,
  phone_number_id text not null,
  display_phone_last4 text not null,
  status text not null default 'disconnected',
  access_token_encrypted text,
  token_encryption_version smallint,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_activity_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_provider_accounts_provider_check
    check (provider ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint whatsapp_provider_accounts_scope_check
    check (scope in ('platform_shared', 'clinic_owned')),
  constraint whatsapp_provider_accounts_owner_check check (
    (scope = 'platform_shared' and owner_clinic_id is null)
    or (scope = 'clinic_owned' and owner_clinic_id is not null)
  ),
  constraint whatsapp_provider_accounts_waba_check
    check (waba_id ~ '^[0-9]{1,32}$'),
  constraint whatsapp_provider_accounts_phone_id_check
    check (phone_number_id ~ '^[0-9]{1,32}$'),
  constraint whatsapp_provider_accounts_last4_check
    check (display_phone_last4 ~ '^[0-9]{4}$'),
  constraint whatsapp_provider_accounts_status_check
    check (status in ('connected', 'disconnected', 'reconnect_required', 'disabled')),
  constraint whatsapp_provider_accounts_secret_check check (
    (access_token_encrypted is null and token_encryption_version is null)
    or (
      access_token_encrypted ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
      and token_encryption_version is not null
      and token_encryption_version > 0
    )
  ),
  constraint whatsapp_provider_accounts_connection_check check (
    (status = 'connected' and connected_at is not null and disconnected_at is null)
    or status <> 'connected'
  ),
  constraint whatsapp_provider_accounts_error_check
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  constraint whatsapp_provider_accounts_provider_sender_unique
    unique (provider, waba_id, phone_number_id)
);

create trigger whatsapp_provider_accounts_set_updated_at
before update on public.whatsapp_provider_accounts
for each row execute function public.set_updated_at();

alter table public.whatsapp_provider_accounts enable row level security;
revoke all privileges on table public.whatsapp_provider_accounts from public, anon, authenticated;

create index whatsapp_provider_accounts_owner_idx
  on public.whatsapp_provider_accounts(owner_clinic_id)
  where owner_clinic_id is not null;

create table public.whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider_account_id uuid not null references public.whatsapp_provider_accounts(id) on delete restrict,
  enabled boolean not null default false,
  reminder_enabled boolean not null default false,
  default_language text not null default 'es_MX',
  status text not null default 'disconnected',
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_integrations_language_check check (default_language = 'es_MX'),
  constraint whatsapp_integrations_status_check
    check (status in ('connected', 'disconnected', 'reconnect_required', 'disabled')),
  constraint whatsapp_integrations_clinic_account_unique unique (clinic_id, provider_account_id),
  constraint whatsapp_integrations_clinic_id_id_account_unique unique (clinic_id, id, provider_account_id),
  constraint whatsapp_integrations_id_account_unique unique (id, provider_account_id)
);

create function public.protect_whatsapp_integration_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope text;
  v_owner_clinic_id uuid;
begin
  select account.scope, account.owner_clinic_id
  into v_scope, v_owner_clinic_id
  from public.whatsapp_provider_accounts account
  where account.id = new.provider_account_id;

  if not found or (
    v_scope = 'clinic_owned' and v_owner_clinic_id is distinct from new.clinic_id
  ) then
    raise exception 'WhatsApp integration tenant mismatch.' using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_whatsapp_integration_tenant() from public, anon, authenticated;

create trigger whatsapp_integrations_protect_tenant
before insert or update of clinic_id, provider_account_id on public.whatsapp_integrations
for each row execute function public.protect_whatsapp_integration_tenant();

create trigger whatsapp_integrations_set_updated_at
before update on public.whatsapp_integrations
for each row execute function public.set_updated_at();

alter table public.whatsapp_integrations enable row level security;
revoke all privileges on table public.whatsapp_integrations from public, anon, authenticated;

create index whatsapp_integrations_clinic_status_idx
  on public.whatsapp_integrations(clinic_id, status);

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references public.whatsapp_provider_accounts(id) on delete restrict,
  logical_key text not null,
  provider_template_name text not null,
  language_code text not null,
  provider_template_id text,
  version integer not null default 1,
  status text not null default 'draft',
  allowed_variables text[] not null,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_templates_logical_key_check check (logical_key = 'appointment_reminder'),
  constraint whatsapp_templates_name_check
    check (
      char_length(provider_template_name) between 1 and 512
      and provider_template_name ~ '^[a-z][a-z0-9_]*$'
    ),
  constraint whatsapp_templates_language_check check (language_code = 'es_MX'),
  constraint whatsapp_templates_provider_id_check check (
    provider_template_id is null
    or (char_length(provider_template_id) between 1 and 128 and provider_template_id !~ '[[:cntrl:]]')
  ),
  constraint whatsapp_templates_version_check check (version > 0),
  constraint whatsapp_templates_status_check
    check (status in ('draft', 'pending', 'approved', 'paused', 'rejected', 'retired')),
  constraint whatsapp_templates_variables_check
    check (allowed_variables = array['appointment_date', 'appointment_time']::text[]),
  constraint whatsapp_templates_lifecycle_check check (
    (status = 'approved' and approved_at is not null and retired_at is null)
    or (status = 'retired' and retired_at is not null)
    or status in ('draft', 'pending', 'paused', 'rejected')
  ),
  constraint whatsapp_templates_account_key_language_version_unique
    unique (provider_account_id, logical_key, language_code, version),
  constraint whatsapp_templates_account_id_unique unique (provider_account_id, id)
);

create unique index whatsapp_templates_one_active_approved_idx
  on public.whatsapp_templates(provider_account_id, logical_key, language_code)
  where status = 'approved' and retired_at is null;

create trigger whatsapp_templates_set_updated_at
before update on public.whatsapp_templates
for each row execute function public.set_updated_at();

alter table public.whatsapp_templates enable row level security;
revoke all privileges on table public.whatsapp_templates from public, anon, authenticated;

create table public.patient_communication_preferences (
  clinic_id uuid not null,
  patient_id uuid not null,
  whatsapp_status text not null default 'not_set',
  phone_e164 text,
  opt_in_at timestamptz,
  opt_out_at timestamptz,
  source text,
  terms_version text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, patient_id),
  constraint patient_communication_preferences_patient_fk
    foreign key (clinic_id, patient_id)
    references public.patients(clinic_id, id) on delete cascade,
  constraint patient_communication_preferences_status_check
    check (whatsapp_status in ('not_set', 'opted_in', 'opted_out')),
  constraint patient_communication_preferences_phone_check
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint patient_communication_preferences_source_check
    check (source is null or source in ('patient_portal', 'clinic_staff_written', 'clinic_staff_verbal')),
  constraint patient_communication_preferences_terms_check
    check (terms_version is null or terms_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
  constraint patient_communication_preferences_staff_actor_check check (
    source not in ('clinic_staff_written', 'clinic_staff_verbal') or recorded_by is not null
  ),
  constraint patient_communication_preferences_consent_shape_check check (
    (
      whatsapp_status = 'not_set'
      and opt_in_at is null and opt_out_at is null and source is null and terms_version is null
    ) or (
      whatsapp_status = 'opted_in'
      and phone_e164 is not null and opt_in_at is not null and opt_out_at is null
      and source is not null and terms_version is not null
    ) or (
      whatsapp_status = 'opted_out'
      and phone_e164 is not null and opt_in_at is not null and opt_out_at is not null
      and source is not null and terms_version is not null and opt_out_at >= opt_in_at
    )
  )
);

create function public.invalidate_whatsapp_consent_on_phone_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.phone_e164 is not null and old.phone_e164 is distinct from new.phone_e164 then
    new.whatsapp_status := 'not_set';
    new.opt_in_at := null;
    new.opt_out_at := null;
    new.source := null;
    new.terms_version := null;
    new.recorded_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_whatsapp_consent_on_phone_change() from public, anon, authenticated;

create trigger patient_communication_preferences_invalidate_phone_change
before update of phone_e164 on public.patient_communication_preferences
for each row execute function public.invalidate_whatsapp_consent_on_phone_change();

create trigger patient_communication_preferences_set_updated_at
before update on public.patient_communication_preferences
for each row execute function public.set_updated_at();

alter table public.patient_communication_preferences enable row level security;
revoke all privileges on table public.patient_communication_preferences from public, anon, authenticated;

create index patient_communication_preferences_opt_in_idx
  on public.patient_communication_preferences(clinic_id, whatsapp_status)
  where whatsapp_status = 'opted_in';

alter table public.appointment_automation_jobs
  drop constraint appointment_automation_jobs_type_check,
  drop constraint appointment_automation_jobs_channel_check,
  drop constraint appointment_automation_jobs_dedupe_unique;

alter table public.appointment_automation_jobs
  add constraint appointment_automation_jobs_type_check
    check (type in ('reminder_email', 'review_request_email', 'reminder_whatsapp')),
  add constraint appointment_automation_jobs_channel_check
    check (channel in ('email', 'whatsapp')),
  add constraint appointment_automation_jobs_type_channel_check check (
    (type in ('reminder_email', 'review_request_email') and channel = 'email')
    or (type = 'reminder_whatsapp' and channel = 'whatsapp')
  ),
  add constraint appointment_automation_jobs_dedupe_unique unique (clinic_id, channel, dedupe_key),
  add constraint appointment_automation_jobs_clinic_id_id_appointment_unique
    unique (clinic_id, id, appointment_id);

create or replace function public.enqueue_appointment_automation_jobs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.bot_settings%rowtype;
  v_timezone text;
  v_schedule timestamptz;
  v_generation integer;
  v_schedule_changed boolean := false;
  v_restored boolean := false;
  v_completed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_schedule_changed := old.starts_at is distinct from new.starts_at
      or old.ends_at is distinct from new.ends_at
      or old.doctor_id is distinct from new.doctor_id;
    v_restored := old.status = 'cancelled' and new.status = 'scheduled';
    v_completed := old.status <> 'completed' and new.status = 'completed';

    if v_schedule_changed or new.status in ('cancelled', 'completed') or v_restored then
      update public.appointment_automation_jobs
      set status = 'cancelled', cancelled_at = now(), processed_at = now(), last_error_code = 'appointment_changed',
          locked_at = null, lease_expires_at = null, locked_by = null
      where clinic_id = new.clinic_id and appointment_id = new.id and type = 'reminder_email'
        and status in ('pending', 'retry_pending', 'processing');
    end if;
  end if;

  select * into v_settings from public.bot_settings where clinic_id = new.clinic_id;
  if not found or not v_settings.enabled or not public.clinic_has_effective_automation_subscription_internal(new.clinic_id) then
    return new;
  end if;

  select timezone into v_timezone from public.clinics where id = new.clinic_id;
  if v_settings.reminder_enabled and new.status in ('scheduled', 'confirmed', 'waiting')
    and (tg_op = 'INSERT' or v_schedule_changed or v_restored) then
    select coalesce(max(job.generation), 0) + 1 into v_generation
    from public.appointment_automation_jobs job
    where job.clinic_id = new.clinic_id and job.appointment_id = new.id and job.type = 'reminder_email';
    begin
      v_schedule := public.calculate_appointment_reminder_at(new.starts_at, v_timezone,
        v_settings.reminder_hours_before, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
      -- A late-created appointment must not enqueue an immediate attempt inside quiet hours.
      v_schedule := public.calculate_appointment_reminder_at(greatest(v_schedule, clock_timestamp()), v_timezone,
        0, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
    exception when invalid_parameter_value then
      -- Invalid tenant timezone fails closed for automation without blocking the clinical mutation.
      return new;
    end;
    if v_schedule < new.starts_at then
      insert into public.appointment_automation_jobs (
        clinic_id, appointment_id, type, source_version, generation,
        scheduled_for, next_attempt_at, dedupe_key
      ) values (
        new.clinic_id, new.id, 'reminder_email', new.starts_at, v_generation,
        v_schedule, greatest(v_schedule, now()),
        'reminder:' || new.id::text || ':' || v_generation::text
      ) on conflict (clinic_id, channel, dedupe_key) do nothing;
    end if;
  end if;

  if v_completed and v_settings.review_request_enabled then
    v_generation := 1;
    insert into public.appointment_automation_jobs (
      clinic_id, appointment_id, type, source_version, generation,
      scheduled_for, next_attempt_at, max_attempts, dedupe_key
    ) values (
      new.clinic_id, new.id, 'review_request_email', new.starts_at, v_generation,
      now(), now(), 1, 'review:' || new.id::text
    ) on conflict (clinic_id, channel, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_appointment_automation_jobs() from public, anon, authenticated;

create or replace function public.rebuild_clinic_reminder_jobs(p_clinic_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_settings public.bot_settings%rowtype;
  v_timezone text;
  v_appointment public.appointments%rowtype;
  v_schedule timestamptz;
  v_generation integer;
begin
  update public.appointment_automation_jobs
  set status = 'cancelled', cancelled_at = now(), processed_at = now(), last_error_code = 'settings_changed',
      locked_at = null, lease_expires_at = null, locked_by = null
  where clinic_id = p_clinic_id and type = 'reminder_email'
    and status in ('pending', 'retry_pending', 'processing');

  select * into v_settings from public.bot_settings where clinic_id = p_clinic_id;
  if not found or not v_settings.enabled or not v_settings.reminder_enabled
    or not public.clinic_has_effective_automation_subscription_internal(p_clinic_id) then return; end if;
  select timezone into v_timezone from public.clinics where id = p_clinic_id;

  for v_appointment in
    select * from public.appointments
    where clinic_id = p_clinic_id and status in ('scheduled', 'confirmed', 'waiting') and starts_at > clock_timestamp()
    order by starts_at, id
  loop
    begin
      v_schedule := public.calculate_appointment_reminder_at(v_appointment.starts_at, v_timezone,
        v_settings.reminder_hours_before, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
      v_schedule := public.calculate_appointment_reminder_at(greatest(v_schedule, clock_timestamp()), v_timezone,
        0, v_settings.quiet_hours_start, v_settings.quiet_hours_end);
    exception when invalid_parameter_value then
      continue;
    end;
    if v_schedule < v_appointment.starts_at then
      select coalesce(max(job.generation), 0) + 1 into v_generation
      from public.appointment_automation_jobs job
      where job.clinic_id = p_clinic_id and job.appointment_id = v_appointment.id and job.type = 'reminder_email';
      insert into public.appointment_automation_jobs(
        clinic_id, appointment_id, type, source_version, generation,
        scheduled_for, next_attempt_at, dedupe_key
      ) values (
        p_clinic_id, v_appointment.id, 'reminder_email', v_appointment.starts_at, v_generation,
        v_schedule, v_schedule, 'reminder:' || v_appointment.id::text || ':' || v_generation::text
      ) on conflict (clinic_id, channel, dedupe_key) do nothing;
    end if;
  end loop;
end;
$$;
revoke all on function public.rebuild_clinic_reminder_jobs(uuid) from public, anon, authenticated;

create table public.whatsapp_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  appointment_id uuid not null,
  job_id uuid not null,
  integration_id uuid not null,
  template_id uuid not null,
  provider_account_id uuid not null,
  provider_message_id text,
  status text not null default 'sending',
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  delivery_unknown_at timestamptz,
  provider_status_at timestamptz,
  last_error_code text,
  destination_hmac text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_message_deliveries_appointment_fk
    foreign key (clinic_id, appointment_id)
    references public.appointments(clinic_id, id) on delete restrict,
  constraint whatsapp_message_deliveries_job_fk
    foreign key (clinic_id, job_id, appointment_id)
    references public.appointment_automation_jobs(clinic_id, id, appointment_id) on delete restrict,
  constraint whatsapp_message_deliveries_integration_fk
    foreign key (clinic_id, integration_id, provider_account_id)
    references public.whatsapp_integrations(clinic_id, id, provider_account_id) on delete restrict,
  constraint whatsapp_message_deliveries_template_fk
    foreign key (provider_account_id, template_id)
    references public.whatsapp_templates(provider_account_id, id) on delete restrict,
  constraint whatsapp_message_deliveries_job_unique unique (job_id),
  constraint whatsapp_message_deliveries_status_check
    check (status in ('sending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'delivery_unknown')),
  constraint whatsapp_message_deliveries_provider_message_check check (
    provider_message_id is null
    or (char_length(provider_message_id) between 1 and 1024 and provider_message_id !~ '[[:cntrl:]]')
  ),
  constraint whatsapp_message_deliveries_error_check
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  constraint whatsapp_message_deliveries_hmac_check
    check (destination_hmac ~ '^[a-f0-9]{64}$'),
  constraint whatsapp_message_deliveries_state_shape_check check (
    (status = 'sending')
    or (status = 'accepted' and provider_message_id is not null and accepted_at is not null)
    or (status = 'sent' and provider_message_id is not null and sent_at is not null)
    or (status = 'delivered' and provider_message_id is not null and delivered_at is not null)
    or (status = 'read' and provider_message_id is not null and read_at is not null)
    or (status = 'failed' and failed_at is not null)
    or (status = 'delivery_unknown' and delivery_unknown_at is not null)
  )
);

create unique index whatsapp_message_deliveries_provider_message_unique_idx
  on public.whatsapp_message_deliveries(provider_account_id, provider_message_id)
  where provider_message_id is not null;

create index whatsapp_message_deliveries_clinic_recent_idx
  on public.whatsapp_message_deliveries(clinic_id, created_at desc, id desc);
create index whatsapp_message_deliveries_appointment_idx
  on public.whatsapp_message_deliveries(clinic_id, appointment_id);

create function public.protect_whatsapp_message_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_type text;
  v_job_channel text;
  v_old_rank integer;
  v_new_rank integer;
begin
  if tg_op = 'INSERT' then
    select job.type, job.channel into v_job_type, v_job_channel
    from public.appointment_automation_jobs job
    where job.id = new.job_id and job.clinic_id = new.clinic_id and job.appointment_id = new.appointment_id;
    if not found or v_job_type <> 'reminder_whatsapp' or v_job_channel <> 'whatsapp' then
      raise exception 'WhatsApp delivery requires a WhatsApp reminder job.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.clinic_id is distinct from old.clinic_id
    or new.appointment_id is distinct from old.appointment_id
    or new.job_id is distinct from old.job_id
    or new.integration_id is distinct from old.integration_id
    or new.template_id is distinct from old.template_id
    or new.provider_account_id is distinct from old.provider_account_id
    or new.destination_hmac is distinct from old.destination_hmac
    or (old.provider_message_id is not null and new.provider_message_id is distinct from old.provider_message_id) then
    raise exception 'WhatsApp delivery relationships are immutable.' using errcode = '42501';
  end if;

  if old.status in ('failed', 'delivery_unknown') and new.status is distinct from old.status then
    raise exception 'Terminal WhatsApp delivery cannot transition.' using errcode = '42501';
  end if;

  v_old_rank := case old.status
    when 'sending' then 0 when 'accepted' then 1 when 'sent' then 2
    when 'delivered' then 3 when 'read' then 4 else null end;
  v_new_rank := case new.status
    when 'sending' then 0 when 'accepted' then 1 when 'sent' then 2
    when 'delivered' then 3 when 'read' then 4 else null end;

  if v_old_rank is not null and v_new_rank is not null and v_new_rank < v_old_rank then
    raise exception 'WhatsApp delivery status cannot regress.' using errcode = '42501';
  end if;
  if old.status in ('delivered', 'read') and new.status = 'failed' then
    raise exception 'Delivered WhatsApp message cannot fail.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_whatsapp_message_delivery() from public, anon, authenticated;

create trigger whatsapp_message_deliveries_protect
before insert or update on public.whatsapp_message_deliveries
for each row execute function public.protect_whatsapp_message_delivery();

create trigger whatsapp_message_deliveries_set_updated_at
before update on public.whatsapp_message_deliveries
for each row execute function public.set_updated_at();

alter table public.whatsapp_message_deliveries enable row level security;
revoke all privileges on table public.whatsapp_message_deliveries from public, anon, authenticated;

comment on table public.whatsapp_message_deliveries is
  'Technical WhatsApp delivery tracking. Contains no phone, message body, template variables, patient name or webhook payload.';
comment on column public.whatsapp_provider_accounts.access_token_encrypted is
  'Optional versioned encrypted token envelope. Plaintext provider tokens are prohibited.';
comment on table public.appointment_automation_jobs is
  'Persistent operational jobs for appointment email reminders, WhatsApp reminder foundations and verified-review requests. Contains no recipient, message payload, token or PHI.';
