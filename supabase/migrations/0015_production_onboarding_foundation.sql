-- Controlled production-onboarding foundation. This migration is intentionally not applied by the application.

alter table public.clinics
  add column if not exists country text,
  add column if not exists region text;

create table if not exists public.clinic_onboarding_acceptances (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  terms_version text not null,
  privacy_version text not null,
  clinical_responsibility_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint clinic_onboarding_acceptances_clinic_user_unique unique (clinic_id, user_id)
);

alter table public.clinic_onboarding_acceptances enable row level security;

create or replace function public.complete_clinic_onboarding_for_current_user(
  p_clinic_name text,
  p_legal_name text,
  p_phone text,
  p_clinic_email text,
  p_timezone text,
  p_country text,
  p_region text,
  p_address text,
  p_owner_full_name text,
  p_plan_id text,
  p_accepted_terms boolean,
  p_accepted_privacy boolean,
  p_accepted_clinical_responsibility boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_clinic_id uuid;
  v_clinic_id uuid;
  v_clinic_name text := nullif(trim(p_clinic_name), '');
  v_owner_full_name text := nullif(trim(p_owner_full_name), '');
  v_timezone text := nullif(trim(p_timezone), '');
  v_auth_email text;
  v_trial_duration constant interval := interval '14 days';
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if v_clinic_name is null or char_length(v_clinic_name) > 160 then
    raise exception 'Invalid clinic name.';
  end if;
  if v_owner_full_name is null or char_length(v_owner_full_name) > 160 then
    raise exception 'Invalid owner name.';
  end if;
  if v_timezone is null or char_length(v_timezone) > 80 then
    raise exception 'Invalid timezone.';
  end if;
  if p_plan_id not in ('basic', 'plus', 'pro') then
    raise exception 'Invalid plan.';
  end if;
  if not coalesce(p_accepted_terms, false)
    or not coalesce(p_accepted_privacy, false)
    or not coalesce(p_accepted_clinical_responsibility, false) then
    raise exception 'Required acknowledgements are missing.';
  end if;
  if char_length(coalesce(p_legal_name, '')) > 200
    or char_length(coalesce(p_phone, '')) > 40
    or char_length(coalesce(p_clinic_email, '')) > 254
    or char_length(coalesce(p_country, '')) > 80
    or char_length(coalesce(p_region, '')) > 120
    or char_length(coalesce(p_address, '')) > 500 then
    raise exception 'One or more fields are too long.';
  end if;

  -- Serializes all onboarding attempts for this authenticated account, including retries and parallel tabs.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select cm.clinic_id into v_existing_clinic_id
  from public.clinic_members as cm
  where cm.user_id = v_user_id
    and cm.status = 'active'
  order by cm.created_at asc
  limit 1;

  if v_existing_clinic_id is not null then
    return v_existing_clinic_id;
  end if;

  select u.email into v_auth_email
  from auth.users as u
  where u.id = v_user_id;

  if v_auth_email is null then
    raise exception 'Authenticated account is unavailable.';
  end if;

  insert into public.profiles as p (id, full_name, email)
  values (v_user_id, v_owner_full_name, v_auth_email)
  on conflict (id) do update
  set full_name = coalesce(p.full_name, excluded.full_name),
      email = coalesce(p.email, excluded.email);

  insert into public.clinics as c (
    name, legal_name, phone, email, timezone, country, region, address
  ) values (
    v_clinic_name,
    nullif(trim(p_legal_name), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_clinic_email), ''),
    v_timezone,
    nullif(trim(p_country), ''),
    nullif(trim(p_region), ''),
    nullif(trim(p_address), '')
  ) returning c.id into v_clinic_id;

  insert into public.clinic_members as cm (clinic_id, user_id, role, status)
  values (v_clinic_id, v_user_id, 'owner', 'active');

  -- A beta trial is not a payment or paid entitlement; a trusted billing flow changes it later.
  insert into public.clinic_subscriptions as cs (
    clinic_id, plan_id, status, billing_provider, provider_subscription_id, provider_plan_id, current_period_start, current_period_end
  ) values (
    v_clinic_id, p_plan_id, 'trialing', 'manual', null, null, now(), now() + v_trial_duration
  );

  insert into public.clinic_onboarding_acceptances as coa (
    clinic_id, user_id, terms_version, privacy_version, clinical_responsibility_version
  ) values (v_clinic_id, v_user_id, 'pending-legal-v1', 'pending-privacy-v1', 'onboarding-responsibility-v1');

  return v_clinic_id;
end;
$$;

revoke all on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) to authenticated;

comment on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) is
  'Serializes onboarding for auth.uid(), uses auth.users email only for profiles, stores clinic contact separately, records versioned acknowledgements, and creates a 14-day manual trial without clinical payments.';

create or replace function public.add_clinic_member_by_email_for_current_user(
  target_clinic_id uuid,
  member_email text,
  member_role text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(nullif(trim(member_email), ''));
  normalized_role text := lower(nullif(trim(member_role), ''));
  target_user_id uuid;
  existing_membership_id uuid;
  existing_membership_role text;
  current_plan_id text;
  current_subscription_status text;
  active_doctor_count integer;
  new_membership_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required to add clinic members.'; end if;
  if not public.has_clinic_role(target_clinic_id, array['owner', 'admin']) then raise exception 'Only clinic owners and admins can add members.'; end if;
  if normalized_role not in ('doctor', 'admin', 'assistant') then raise exception 'Unsupported clinic role.'; end if;
  if normalized_email is null or char_length(normalized_email) > 254 then raise exception 'Email is required.'; end if;

  select cs.status, cs.plan_id into current_subscription_status, current_plan_id
  from public.clinic_subscriptions as cs where cs.clinic_id = target_clinic_id limit 1;
  if current_subscription_status is distinct from 'active' and current_subscription_status is distinct from 'trialing' then
    raise exception 'The current subscription does not allow member administration.';
  end if;

  select p.id into target_user_id from public.profiles as p where lower(p.email) = normalized_email limit 1;
  if target_user_id is null then raise exception 'No existe un usuario de CliniControl con ese correo. Pídele que cree su cuenta antes de agregarlo.'; end if;
  select cm.id, cm.role::text into existing_membership_id, existing_membership_role from public.clinic_members as cm where cm.clinic_id = target_clinic_id and cm.user_id = target_user_id limit 1;

  if normalized_role = 'doctor' and coalesce(existing_membership_role, '') <> 'doctor' then
    active_doctor_count := public.count_clinic_doctors_for_current_user(target_clinic_id);
    if current_plan_id = 'basic' and active_doctor_count >= 1 then raise exception 'Doctor limit reached for the current plan.'; end if;
    if current_plan_id = 'plus' and active_doctor_count >= 5 then raise exception 'Doctor limit reached for the current plan.'; end if;
  end if;

  insert into public.clinic_members as cm (clinic_id, user_id, role, status)
  values (target_clinic_id, target_user_id, normalized_role::public.clinic_member_role, 'active')
  on conflict (clinic_id, user_id) do update set role = excluded.role, status = 'active'
  returning cm.id into new_membership_id;
  return new_membership_id;
end;
$$;

revoke all on function public.add_clinic_member_by_email_for_current_user(uuid, text, text) from public, anon;
grant execute on function public.add_clinic_member_by_email_for_current_user(uuid, text, text) to authenticated;
