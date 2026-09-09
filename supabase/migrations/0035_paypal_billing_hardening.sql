-- SaaS billing only. Historical migrations and clinical payments are unchanged.
create table public.paypal_billing_intents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('basic','plus','pro')),
  provider_plan_id text not null,
  provider_subscription_id text unique,
  previous_subscription_id text,
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  completed_at timestamptz
);
alter table public.paypal_billing_intents enable row level security;
revoke all on public.paypal_billing_intents from public, anon, authenticated;
grant select, insert, update on public.paypal_billing_intents to service_role;
create index paypal_billing_intents_clinic_pending_idx on public.paypal_billing_intents(clinic_id) where status='pending';

create function public.begin_paypal_billing_intent(p_clinic uuid, p_user uuid, p_plan text, p_provider_plan text)
returns public.paypal_billing_intents language plpgsql security definer set search_path = public, pg_temp as $$
declare v_intent public.paypal_billing_intents;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_clinic::text, 35));
  perform 1 from public.clinic_members where clinic_id=p_clinic and user_id=p_user and role='owner' and status='active' for share;
  if not found then raise exception 'billing_owner_required' using errcode='42501'; end if;
  if p_plan not in ('basic','plus','pro') or p_provider_plan is null or length(p_provider_plan) not between 1 and 128 then
    raise exception 'invalid_plan' using errcode='22023';
  end if;
  select * into v_intent from public.paypal_billing_intents where clinic_id=p_clinic and status='pending' and expires_at>now() for update;
  if found then
    if v_intent.user_id<>p_user or v_intent.plan_id<>p_plan or v_intent.provider_plan_id<>p_provider_plan then
      raise exception 'billing_intent_in_progress' using errcode='23505';
    end if;
    return v_intent;
  end if;
  insert into public.paypal_billing_intents(clinic_id,user_id,plan_id,provider_plan_id,previous_subscription_id)
    values(p_clinic,p_user,p_plan,p_provider_plan,(select provider_subscription_id from public.clinic_subscriptions where clinic_id=p_clinic))
    returning * into v_intent;
  return v_intent;
end $$;

create function public.bind_paypal_billing_intent(p_intent uuid, p_subscription text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_subscription is null or p_subscription !~ '^I-[A-Z0-9]{6,64}$' then raise exception 'invalid_subscription' using errcode='22023'; end if;
  update public.paypal_billing_intents set provider_subscription_id=p_subscription
    where id=p_intent and status='pending' and expires_at>now()
      and (provider_subscription_id is null or provider_subscription_id=p_subscription);
  if not found then raise exception 'invalid_billing_intent' using errcode='42501'; end if;
end $$;

create function public.complete_paypal_billing_intent(p_intent uuid, p_clinic uuid, p_user uuid, p_plan text,
  p_subscription text, p_provider_plan text, p_status text, p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_intent public.paypal_billing_intents; v_current text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_clinic::text, 35));
  perform 1 from public.clinic_members where clinic_id=p_clinic and user_id=p_user and role='owner' and status='active' for share;
  if not found then raise exception 'billing_owner_required' using errcode='42501'; end if;
  select * into v_intent from public.paypal_billing_intents where id=p_intent for update;
  if not found or v_intent.clinic_id is distinct from p_clinic or v_intent.user_id is distinct from p_user
    or v_intent.plan_id is distinct from p_plan or v_intent.provider_subscription_id is distinct from p_subscription
    or v_intent.provider_plan_id is distinct from p_provider_plan or p_subscription is null then
    raise exception 'invalid_billing_intent' using errcode='42501';
  end if;
  select provider_subscription_id into v_current from public.clinic_subscriptions where clinic_id=p_clinic for update;
  if v_intent.status='completed' then
    if v_current is distinct from p_subscription then raise exception 'superseded_billing_intent' using errcode='42501'; end if;
    return;
  end if;
  if v_intent.expires_at<=now() or v_current is distinct from v_intent.previous_subscription_id then
    raise exception 'expired_or_superseded_intent' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('active','inactive') then raise exception 'invalid_provider_status' using errcode='22023'; end if;
  insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider,provider_subscription_id,provider_plan_id,current_period_start,current_period_end,cancel_at_period_end)
    values(p_clinic,p_plan,p_status,'paypal',p_subscription,p_provider_plan,p_start,p_end,false)
    on conflict(clinic_id) do update set plan_id=excluded.plan_id,status=excluded.status,billing_provider='paypal',
      provider_subscription_id=excluded.provider_subscription_id,provider_plan_id=excluded.provider_plan_id,
      current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at_period_end=false;
  update public.paypal_billing_intents set status='completed',completed_at=now() where id=p_intent;
end $$;

alter table public.paypal_webhook_events drop constraint paypal_webhook_events_processing_status_check;
alter table public.paypal_webhook_events add constraint paypal_webhook_events_processing_status_check
  check(processing_status in ('received','processing','processed','ignored','failed'));
alter table public.paypal_webhook_events alter column processing_status set default 'received';
alter table public.paypal_webhook_events
  add column attempt_count integer not null default 0,
  add column lease_until timestamptz,
  add column lease_token uuid,
  add column failed_at timestamptz,
  add column last_error_code text check(last_error_code in ('processing_failed','subscription_not_found','provider_mismatch','unsupported_event'));
-- Legacy rows are retained as-is. Historical processed rows cannot prove that a subscription mutation succeeded.
revoke all on public.paypal_webhook_events from public, anon, authenticated;
grant select, insert, update on public.paypal_webhook_events to service_role;

create function public.claim_paypal_webhook(p_event text, p_type text, p_subscription text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_event public.paypal_webhook_events; v_token uuid;
begin
  if p_event is null or length(p_event) not between 1 and 128 or p_type is null or length(p_type) not between 1 and 128 then
    raise exception 'invalid_event' using errcode='22023';
  end if;
  insert into public.paypal_webhook_events(event_id,event_type,provider_subscription_id,processing_status)
    values(p_event,p_type,p_subscription,'received') on conflict(event_id) do nothing;
  select * into v_event from public.paypal_webhook_events where event_id=p_event for update;
  if v_event.event_type is distinct from p_type or v_event.provider_subscription_id is distinct from p_subscription then
    raise exception 'event_mismatch' using errcode='22023';
  end if;
  if v_event.processing_status in ('processed','ignored') then return jsonb_build_object('state','processed'); end if;
  if v_event.processing_status='processing' and v_event.lease_until>now() then return jsonb_build_object('state','busy'); end if;
  v_token:=gen_random_uuid();
  update public.paypal_webhook_events set processing_status='processing',attempt_count=attempt_count+1,
    lease_until=now()+interval '2 minutes',lease_token=v_token,processed_at=null,last_error_code=null where event_id=p_event;
  return jsonb_build_object('state','claimed','token',v_token);
end $$;

create function public.fail_paypal_webhook(p_event text, p_token uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.paypal_webhook_events set processing_status='failed',failed_at=now(),last_error_code='processing_failed',lease_until=null,lease_token=null
    where event_id=p_event and processing_status='processing' and lease_token=p_token;
$$;

create function public.finish_paypal_webhook(p_event text, p_token uuid, p_status text, p_provider_plan text,
  p_start timestamptz, p_end timestamptz)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_event public.paypal_webhook_events; v_subscription public.clinic_subscriptions;
begin
  select * into v_event from public.paypal_webhook_events where event_id=p_event for update;
  if not found or v_event.processing_status<>'processing' or v_event.lease_token is distinct from p_token or v_event.lease_until<=now() then
    raise exception 'webhook_lease_lost' using errcode='40001';
  end if;
  if p_status is not null then
    if p_status not in ('active','inactive','past_due','cancelled','trialing') then raise exception 'invalid_status' using errcode='22023'; end if;
    select * into v_subscription from public.clinic_subscriptions
      where billing_provider='paypal' and provider_subscription_id=v_event.provider_subscription_id for update;
    if not found then
      update public.paypal_webhook_events set processing_status='failed',failed_at=now(),last_error_code='subscription_not_found',lease_until=null,lease_token=null where event_id=p_event;
      return 'failed';
    end if;
    if p_provider_plan is distinct from v_subscription.provider_plan_id then
      update public.paypal_webhook_events set processing_status='failed',failed_at=now(),last_error_code='provider_mismatch',lease_until=null,lease_token=null where event_id=p_event;
      return 'failed';
    end if;
    update public.clinic_subscriptions set status=p_status,current_period_start=coalesce(p_start,current_period_start),
      current_period_end=coalesce(p_end,current_period_end),cancel_at_period_end=(p_status='cancelled') where id=v_subscription.id;
  end if;
  update public.paypal_webhook_events set processing_status='processed',processed_at=now(),failed_at=null,
    lease_until=null,lease_token=null,last_error_code=case when p_status is null then 'unsupported_event' else null end where event_id=p_event;
  return 'processed';
end $$;

revoke all on function public.begin_paypal_billing_intent(uuid,uuid,text,text),public.bind_paypal_billing_intent(uuid,text),
  public.complete_paypal_billing_intent(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz),
  public.claim_paypal_webhook(text,text,text),public.fail_paypal_webhook(text,uuid),
  public.finish_paypal_webhook(text,uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.begin_paypal_billing_intent(uuid,uuid,text,text),public.bind_paypal_billing_intent(uuid,text),
  public.complete_paypal_billing_intent(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz),
  public.claim_paypal_webhook(text,text,text),public.fail_paypal_webhook(text,uuid),
  public.finish_paypal_webhook(text,uuid,text,text,timestamptz,timestamptz) to service_role;
