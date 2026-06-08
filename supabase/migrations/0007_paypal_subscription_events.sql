-- PayPal subscription event tracking.
-- Stores only minimal webhook metadata for idempotency. No cards, payer secrets, or financial payloads are stored.

create table public.paypal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text not null,
  provider_subscription_id text,
  processing_status text not null default 'processed',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint paypal_webhook_events_event_id_unique unique (event_id),
  constraint paypal_webhook_events_processing_status_check check (
    processing_status in ('processed', 'ignored', 'failed')
  )
);

create index paypal_webhook_events_provider_subscription_id_idx
  on public.paypal_webhook_events(provider_subscription_id)
  where provider_subscription_id is not null;

create index paypal_webhook_events_event_type_idx on public.paypal_webhook_events(event_type);

alter table public.paypal_webhook_events enable row level security;

comment on table public.paypal_webhook_events is
  'Minimal PayPal webhook metadata used for idempotency. Updated only by trusted server-side routes.';
comment on column public.paypal_webhook_events.event_id is
  'PayPal webhook event id used to avoid processing duplicate deliveries.';
