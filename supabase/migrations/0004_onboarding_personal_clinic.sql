-- Minimal onboarding bootstrap for authenticated users.
-- Creates one initial clinic, owner membership, and inactive internal subscription without PayPal checkout.

create or replace function public.create_personal_clinic_for_current_user(
  clinic_name text,
  full_name text default null,
  email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_clinic_id uuid;
  new_clinic_id uuid;
  normalized_clinic_name text := nullif(trim(clinic_name), '');
  normalized_full_name text := nullif(trim(full_name), '');
  normalized_email text := nullif(trim(email), '');
begin
  if current_user_id is null then
    raise exception 'Authentication required to create a clinic.';
  end if;

  insert into public.profiles (id, full_name, email)
  values (current_user_id, normalized_full_name, normalized_email)
  on conflict (id) do update
    set
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      email = coalesce(public.profiles.email, excluded.email);

  select clinic_members.clinic_id
    into existing_clinic_id
  from public.clinic_members
  where clinic_members.user_id = current_user_id
  order by clinic_members.created_at asc
  limit 1;

  if existing_clinic_id is not null then
    return existing_clinic_id;
  end if;

  insert into public.clinics (name)
  values (coalesce(normalized_clinic_name, 'Mi consultorio'))
  returning id into new_clinic_id;

  insert into public.clinic_members (clinic_id, user_id, role, status)
  values (new_clinic_id, current_user_id, 'owner', 'active');

  insert into public.clinic_subscriptions (
    clinic_id,
    plan_id,
    status,
    billing_provider,
    provider_subscription_id,
    provider_plan_id
  )
  values (
    new_clinic_id,
    'basic',
    'inactive',
    'paypal',
    null,
    null
  )
  on conflict (clinic_id) do nothing;

  return new_clinic_id;
end;
$$;

comment on function public.create_personal_clinic_for_current_user(text, text, text) is
  'Bootstraps the authenticated user into one personal clinic with owner membership and an inactive Basic subscription. TODO: activate subscriptions from a trusted PayPal webhook/backend flow.';
