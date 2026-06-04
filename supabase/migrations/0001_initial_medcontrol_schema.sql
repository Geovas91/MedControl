-- MedControl initial Supabase schema.
-- This migration prepares the data model and RLS architecture; the UI remains mock-first.

create extension if not exists pgcrypto;

create type public.profile_role as enum ('doctor', 'admin', 'assistant');
create type public.clinic_plan as enum ('initial', 'professional', 'clinic');
create type public.clinic_member_role as enum ('owner', 'doctor', 'assistant', 'admin');
create type public.clinic_member_status as enum ('active', 'invited', 'suspended');
create type public.patient_status as enum ('active', 'inactive', 'follow_up');
create type public.appointment_status as enum ('scheduled', 'confirmed', 'waiting', 'completed', 'cancelled');
create type public.invite_status as enum ('not_sent', 'sent', 'accepted', 'declined', 'pending', 'failed');
create type public.reminder_status as enum ('not_scheduled', 'scheduled', 'sent', 'failed');
create type public.payment_status as enum ('pending', 'paid', 'cancelled', 'refunded');
create type public.medical_note_status as enum ('draft', 'finalized', 'archived');
create type public.consent_status as enum ('pending', 'signed', 'expired', 'revoked');
create type public.calendar_integration_status as enum ('connected', 'disconnected', 'expired', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  role public.profile_role default 'doctor' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  phone text,
  email text,
  address text,
  timezone text default 'America/Mexico_City' not null,
  plan public.clinic_plan default 'initial' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.clinic_member_role default 'doctor' not null,
  status public.clinic_member_status default 'active' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint clinic_members_clinic_user_unique unique (clinic_id, user_id)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  primary_doctor_id uuid references auth.users(id),
  full_name text not null,
  date_of_birth date,
  sex text,
  phone text,
  email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  allergies text,
  current_medications text,
  relevant_history text,
  status public.patient_status default 'active' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  doctor_id uuid references auth.users(id),
  title text not null,
  appointment_type text,
  location text,
  meeting_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status default 'scheduled' not null,
  invite_status public.invite_status default 'not_sent' not null,
  reminder_status public.reminder_status default 'not_scheduled' not null,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint appointments_valid_time_range check (ends_at > starts_at)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  amount numeric(12,2) not null,
  currency text default 'MXN' not null,
  status public.payment_status default 'pending' not null,
  payment_method text,
  concept text,
  paid_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint payments_non_negative_amount check (amount >= 0)
);

create table public.medical_note_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  name text not null,
  specialty text,
  description text,
  template_schema jsonb not null,
  is_system_template boolean default false not null,
  is_active boolean default true not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.medical_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  doctor_id uuid references auth.users(id),
  appointment_id uuid references public.appointments(id) on delete set null,
  template_id uuid references public.medical_note_templates(id) on delete set null,
  status public.medical_note_status default 'draft' not null,
  specialty text,
  clinical_impression text,
  diagnosis text,
  icd10_code text,
  note_data jsonb not null,
  finalized_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  created_by uuid references auth.users(id),
  consent_type text not null,
  consent_version text not null,
  consent_text text not null,
  signing_token text unique not null,
  status public.consent_status default 'pending' not null,
  expires_at timestamptz,
  signed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.consent_signatures (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid references public.consents(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  signer_full_name text not null,
  signature_data text,
  accepted_privacy_notice boolean default false not null,
  accepted_sensitive_data_processing boolean default false not null,
  signed_at timestamptz default now() not null,
  ip_metadata text,
  user_agent text,
  document_hash text,
  created_at timestamptz default now() not null
);

create table public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null,
  provider_calendar_id text,
  calendar_name text,
  sync_direction text default 'medcontrol_to_provider' not null,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  status public.calendar_integration_status default 'disconnected' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.appointment_invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  appointment_id uuid references public.appointments(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  channel text not null,
  provider text,
  status public.invite_status default 'not_sent' not null,
  external_event_id text,
  ics_uid text,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  failed_reason text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.bot_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade unique not null,
  enabled boolean default false not null,
  channel text default 'whatsapp' not null,
  reminder_hours_before integer default 24 not null,
  quiet_hours_start time,
  quiet_hours_end time,
  max_reminders_per_patient integer default 2 not null,
  message_template text,
  escalation_behavior text default 'notify_clinic' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint bot_settings_positive_reminder_hours check (reminder_hours_before > 0),
  constraint bot_settings_positive_max_reminders check (max_reminders_per_patient > 0)
);

create table public.bot_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  appointment_id uuid references public.appointments(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  channel text,
  message text,
  patient_response text,
  result text,
  provider_message_id text,
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz default now() not null
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade not null,
  actor_user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb,
  created_at timestamptz default now() not null
);

create index clinic_members_clinic_id_idx on public.clinic_members(clinic_id);
create index clinic_members_user_id_idx on public.clinic_members(user_id);
create index patients_clinic_id_idx on public.patients(clinic_id);
create index patients_primary_doctor_id_idx on public.patients(primary_doctor_id);
create index appointments_clinic_id_idx on public.appointments(clinic_id);
create index appointments_patient_id_idx on public.appointments(patient_id);
create index appointments_doctor_id_idx on public.appointments(doctor_id);
create index appointments_starts_at_idx on public.appointments(starts_at);
create index payments_clinic_id_idx on public.payments(clinic_id);
create index payments_patient_id_idx on public.payments(patient_id);
create index payments_appointment_id_idx on public.payments(appointment_id);
create index medical_note_templates_clinic_id_idx on public.medical_note_templates(clinic_id);
create index medical_notes_clinic_id_idx on public.medical_notes(clinic_id);
create index medical_notes_patient_id_idx on public.medical_notes(patient_id);
create index medical_notes_doctor_id_idx on public.medical_notes(doctor_id);
create index consents_clinic_id_idx on public.consents(clinic_id);
create index consents_patient_id_idx on public.consents(patient_id);
create index consents_signing_token_idx on public.consents(signing_token);
create index consent_signatures_consent_id_idx on public.consent_signatures(consent_id);
create index consent_signatures_patient_id_idx on public.consent_signatures(patient_id);
create index calendar_integrations_clinic_id_idx on public.calendar_integrations(clinic_id);
create index calendar_integrations_user_id_idx on public.calendar_integrations(user_id);
create index appointment_invites_clinic_id_idx on public.appointment_invites(clinic_id);
create index appointment_invites_appointment_id_idx on public.appointment_invites(appointment_id);
create index appointment_invites_patient_id_idx on public.appointment_invites(patient_id);
create index bot_settings_clinic_id_idx on public.bot_settings(clinic_id);
create index bot_logs_clinic_id_idx on public.bot_logs(clinic_id);
create index bot_logs_appointment_id_idx on public.bot_logs(appointment_id);
create index bot_logs_patient_id_idx on public.bot_logs(patient_id);
create index audit_logs_clinic_id_created_at_idx on public.audit_logs(clinic_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger clinics_set_updated_at before update on public.clinics for each row execute function public.set_updated_at();
create trigger clinic_members_set_updated_at before update on public.clinic_members for each row execute function public.set_updated_at();
create trigger patients_set_updated_at before update on public.patients for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger medical_note_templates_set_updated_at before update on public.medical_note_templates for each row execute function public.set_updated_at();
create trigger medical_notes_set_updated_at before update on public.medical_notes for each row execute function public.set_updated_at();
create trigger consents_set_updated_at before update on public.consents for each row execute function public.set_updated_at();
create trigger calendar_integrations_set_updated_at before update on public.calendar_integrations for each row execute function public.set_updated_at();
create trigger appointment_invites_set_updated_at before update on public.appointment_invites for each row execute function public.set_updated_at();
create trigger bot_settings_set_updated_at before update on public.bot_settings for each row execute function public.set_updated_at();

create or replace function public.current_user_clinic_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select clinic_id
  from public.clinic_members
  where user_id = auth.uid()
    and status = 'active';
$$;

create or replace function public.is_clinic_member(clinic_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.clinic_members
    where clinic_members.clinic_id = is_clinic_member.clinic_id
      and clinic_members.user_id = auth.uid()
      and clinic_members.status = 'active'
  );
$$;

create or replace function public.has_clinic_role(clinic_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.clinic_members
    where clinic_members.clinic_id = has_clinic_role.clinic_id
      and clinic_members.user_id = auth.uid()
      and clinic_members.status = 'active'
      and clinic_members.role::text = any(allowed_roles)
  );
$$;

alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.medical_note_templates enable row level security;
alter table public.medical_notes enable row level security;
alter table public.consents enable row level security;
alter table public.consent_signatures enable row level security;
alter table public.calendar_integrations enable row level security;
alter table public.appointment_invites enable row level security;
alter table public.bot_settings enable row level security;
alter table public.bot_logs enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users can read own profile" on public.profiles for select using (id = auth.uid());
create policy "Users can update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "Users can insert own profile" on public.profiles for insert with check (id = auth.uid());

create policy "Clinic members can read clinics" on public.clinics for select using (public.is_clinic_member(id));
create policy "Clinic owners and admins can update clinics" on public.clinics for update
  using (public.has_clinic_role(id, array['owner', 'admin']))
  with check (public.has_clinic_role(id, array['owner', 'admin']));

create policy "Clinic members can read memberships" on public.clinic_members for select using (public.is_clinic_member(clinic_id));
create policy "Clinic owners and admins can manage memberships" on public.clinic_members for all
  using (public.has_clinic_role(clinic_id, array['owner', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'admin']));

create policy "Clinic members can read patients" on public.patients for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can insert patients" on public.patients for insert
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));
create policy "Doctors and admins can update patients" on public.patients for update
  using (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

create policy "Clinic members can read appointments" on public.appointments for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can insert appointments" on public.appointments for insert
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));
create policy "Doctors and admins can update appointments" on public.appointments for update
  using (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

create policy "Clinic members can read payments" on public.payments for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can insert payments" on public.payments for insert
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));
create policy "Doctors and admins can update payments" on public.payments for update
  using (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

create policy "Clinic members can read medical note templates" on public.medical_note_templates for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can manage medical note templates" on public.medical_note_templates for all
  using (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

create policy "Clinic members can read medical notes" on public.medical_notes for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can insert medical notes" on public.medical_notes for insert
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));
create policy "Doctors and admins can update medical notes" on public.medical_notes for update
  using (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

create policy "Clinic members can read consents" on public.consents for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can insert consents" on public.consents for insert
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));
create policy "Doctors and admins can update consents" on public.consents for update
  using (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

create policy "Clinic members can read consent signatures" on public.consent_signatures for select
  using (
    exists (
      select 1 from public.consents
      where consents.id = consent_signatures.consent_id
        and public.is_clinic_member(consents.clinic_id)
    )
  );
create policy "Doctors and admins can insert consent signatures" on public.consent_signatures for insert
  with check (
    exists (
      select 1 from public.consents
      where consents.id = consent_signatures.consent_id
        and public.has_clinic_role(consents.clinic_id, array['owner', 'doctor', 'admin'])
    )
  );

create policy "Clinic members can read calendar integrations" on public.calendar_integrations for select using (public.is_clinic_member(clinic_id));
create policy "Clinic owners and admins can manage calendar integrations" on public.calendar_integrations for all
  using (public.has_clinic_role(clinic_id, array['owner', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'admin']));

create policy "Clinic members can read appointment invites" on public.appointment_invites for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can insert appointment invites" on public.appointment_invites for insert
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));
create policy "Doctors and admins can update appointment invites" on public.appointment_invites for update
  using (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

create policy "Clinic members can read bot settings" on public.bot_settings for select using (public.is_clinic_member(clinic_id));
create policy "Clinic owners and admins can manage bot settings" on public.bot_settings for all
  using (public.has_clinic_role(clinic_id, array['owner', 'admin']))
  with check (public.has_clinic_role(clinic_id, array['owner', 'admin']));

create policy "Clinic members can read bot logs" on public.bot_logs for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can insert bot logs" on public.bot_logs for insert
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

create policy "Clinic members can read audit logs" on public.audit_logs for select using (public.is_clinic_member(clinic_id));
create policy "Doctors and admins can insert audit logs" on public.audit_logs for insert
  with check (public.has_clinic_role(clinic_id, array['owner', 'doctor', 'admin']));

comment on column public.calendar_integrations.access_token_encrypted is
  'Placeholder only. Real provider tokens must be encrypted or stored through a secure secret management process before production use.';
comment on column public.calendar_integrations.refresh_token_encrypted is
  'Placeholder only. Real provider tokens must be encrypted or stored through a secure secret management process before production use.';
comment on table public.consents is
  'No broad anon policies are defined. Public signing should use a server-side route/action that validates signing_token and writes only the intended signature.';
