-- Links an existing Auth account to demo1. This seed never creates Auth users,
-- platform admins, or clinical records.

begin;

do $$
declare
  demo_user_id uuid;
  demo_clinic_id constant uuid := '10000000-0000-4000-8000-000000000001';
  demo_email constant text := 'demo1@clinicontrol.mx';
begin
  select id
  into demo_user_id
  from auth.users
  where email = demo_email
  limit 1;

  if demo_user_id is null then
    raise exception 'Required Auth user % does not exist. Create it through Supabase Auth before running demo1_account.sql.', demo_email;
  end if;

  perform 1
  from public.clinics
  where id = demo_clinic_id
    and tenant_type = 'demo'
  for update;

  if not found then
    raise exception 'Required demo1 tenant % does not exist or is not classified as demo. Run demo1.sql first.', demo_clinic_id;
  end if;

  insert into public.profiles (
    id,
    full_name,
    email,
    role
  )
  values (
    demo_user_id,
    'demo1',
    demo_email,
    'doctor'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;

  insert into public.clinic_members (
    clinic_id,
    user_id,
    role,
    status
  )
  values (
    demo_clinic_id,
    demo_user_id,
    'owner',
    'active'
  )
  on conflict (clinic_id, user_id) do update
  set
    role = excluded.role,
    status = excluded.status;

  insert into public.clinic_subscriptions (
    clinic_id,
    plan_id,
    status,
    billing_provider,
    provider_subscription_id,
    provider_plan_id,
    current_period_start,
    current_period_end,
    cancel_at_period_end
  )
  values (
    demo_clinic_id,
    'pro',
    'active',
    'demo',
    null,
    null,
    now(),
    null,
    false
  )
  on conflict (clinic_id) do update
  set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_provider = excluded.billing_provider,
    provider_subscription_id = excluded.provider_subscription_id,
    provider_plan_id = excluded.provider_plan_id,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end;
end;
$$;

commit;
