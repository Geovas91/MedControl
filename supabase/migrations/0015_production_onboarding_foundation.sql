-- Controlled production-onboarding foundation. This migration is intentionally not applied by the application.

alter table public.clinics
  add column if not exists country text,
  add column if not exists region text;

create or replace function public.complete_clinic_onboarding_for_current_user(
  p_clinic_name text,
  p_legal_name text,
  p_phone text,
  p_email text,
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
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_clinic_id uuid;
  v_clinic_id uuid;
  v_clinic_name text := nullif(trim(p_clinic_name), '');
  v_owner_full_name text := nullif(trim(p_owner_full_name), '');
  v_timezone text := nullif(trim(p_timezone), '');
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
    or char_length(coalesce(p_email, '')) > 254
    or char_length(coalesce(p_country, '')) > 80
    or char_length(coalesce(p_region, '')) > 120
    or char_length(coalesce(p_address, '')) > 500 then
    raise exception 'One or more fields are too long.';
  end if;

  select cm.clinic_id into v_existing_clinic_id
  from public.clinic_members as cm
  where cm.user_id = v_user_id
    and cm.status = 'active'
  order by cm.created_at asc
  limit 1;

  if v_existing_clinic_id is not null then
    return v_existing_clinic_id;
  end if;

  insert into public.profiles as p (id, full_name, email)
  values (v_user_id, v_owner_full_name, nullif(trim(p_email), ''))
  on conflict (id) do update
  set full_name = excluded.full_name,
      email = coalesce(p.email, excluded.email);

  insert into public.clinics as c (
    name, legal_name, phone, email, timezone, country, region, address
  ) values (
    v_clinic_name,
    nullif(trim(p_legal_name), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''),
    v_timezone,
    nullif(trim(p_country), ''),
    nullif(trim(p_region), ''),
    nullif(trim(p_address), '')
  ) returning c.id into v_clinic_id;

  insert into public.clinic_members as cm (clinic_id, user_id, role, status)
  values (v_clinic_id, v_user_id, 'owner', 'active');

  -- This is explicitly not a payment or a paid entitlement. A trusted billing flow changes it later.
  insert into public.clinic_subscriptions as cs (
    clinic_id, plan_id, status, billing_provider, provider_subscription_id, provider_plan_id
  ) values (
    v_clinic_id, p_plan_id, 'inactive', 'manual', null, null
  );

  return v_clinic_id;
end;
$$;

revoke all on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) to authenticated;

comment on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) is
  'Creates one clinic, its active owner membership, and an inactive manual subscription for auth.uid(). It never creates paid access or clinical payments.';
