-- Supports non-PayPal subscription origins without changing existing PayPal behavior.

alter table public.clinic_subscriptions
  drop constraint clinic_subscriptions_billing_provider_check;

alter table public.clinic_subscriptions
  add constraint clinic_subscriptions_billing_provider_check
  check (billing_provider in ('paypal', 'demo', 'manual'));

alter table public.clinic_subscriptions
  alter column billing_provider set default 'paypal';

comment on table public.clinic_subscriptions is
  'Internal clinic subscription state sourced from PayPal billing, controlled demo provisioning, or authorized manual provisioning. Sensitive provider payloads are not stored here.';

comment on column public.clinic_subscriptions.billing_provider is
  'Subscription origin: paypal for PayPal-managed billing, demo for controlled demonstration tenants, or manual for authorized internal provisioning.';
