-- CliniControl internal clinic subscription state.
-- This prepares PayPal subscription metadata without checkout, webhooks, card data, or sensitive provider payloads.

create table public.clinic_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  plan_id text not null,
  status text not null default 'inactive',
  billing_provider text not null default 'paypal',
  provider_subscription_id text,
  provider_plan_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_subscriptions_clinic_id_unique unique (clinic_id),
  constraint clinic_subscriptions_plan_id_check check (plan_id in ('basic', 'plus', 'pro')),
  constraint clinic_subscriptions_status_check check (
    status in ('inactive', 'trialing', 'active', 'past_due', 'cancelled')
  ),
  constraint clinic_subscriptions_billing_provider_check check (billing_provider = 'paypal'),
  constraint clinic_subscriptions_period_check check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  )
);

create unique index clinic_subscriptions_provider_subscription_id_idx
  on public.clinic_subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;

create index clinic_subscriptions_clinic_id_idx on public.clinic_subscriptions(clinic_id);
create index clinic_subscriptions_plan_id_idx on public.clinic_subscriptions(plan_id);
create index clinic_subscriptions_status_idx on public.clinic_subscriptions(status);

create trigger clinic_subscriptions_set_updated_at
  before update on public.clinic_subscriptions
  for each row
  execute function public.set_updated_at();

alter table public.clinic_subscriptions enable row level security;

create policy "Clinic members can read own clinic subscription"
  on public.clinic_subscriptions
  for select
  using (public.is_clinic_member(clinic_id) or public.is_platform_admin());

create policy "Platform owners and admins can insert clinic subscriptions"
  on public.clinic_subscriptions
  for insert
  with check (public.has_platform_admin_role(array['owner', 'admin']));

create policy "Platform owners and admins can update clinic subscriptions"
  on public.clinic_subscriptions
  for update
  using (public.has_platform_admin_role(array['owner', 'admin']))
  with check (public.has_platform_admin_role(array['owner', 'admin']));

create policy "Platform owners and admins can delete clinic subscriptions"
  on public.clinic_subscriptions
  for delete
  using (public.has_platform_admin_role(array['owner', 'admin']));

comment on table public.clinic_subscriptions is
  'Internal clinic subscription state for CliniControl plans. PayPal checkout, webhooks, card data, and sensitive provider payloads are intentionally not implemented here.';
comment on column public.clinic_subscriptions.provider_subscription_id is
  'External PayPal subscription identifier when available. Do not store sensitive provider payloads.';
comment on column public.clinic_subscriptions.provider_plan_id is
  'External PayPal plan identifier when available. Public plan metadata only.';
