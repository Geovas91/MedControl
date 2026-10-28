-- V1-02. Prepare for review only; deploy with old billing writers stopped.
begin;

-- Preserve ambiguous legacy operations. Never expire/delete one to make room
-- for another provider request. Existing duplicates require reviewed recovery.
lock table public.paypal_billing_intents in share row exclusive mode;
do $$ begin
  if exists(select 1 from public.paypal_billing_intents where status='pending'
    group by clinic_id having count(*) > 1) then
    raise exception 'billing_legacy_pending_conflict' using errcode='23505';
  end if;
end $$;

-- Existing rows and privileged inserts default to uncertain/already dispatched.
-- Only begin_paypal_billing_intent explicitly creates a fresh, unsent operation.
alter table public.paypal_billing_intents
  add column creation_dispatched_at timestamptz default now();
comment on column public.paypal_billing_intents.creation_dispatched_at is
  'One-use creation fence. Legacy rows use migration time for unknown outcomes; this is not confirmation of a provider request or payment.';
create unique index paypal_billing_intents_one_pending_per_clinic
  on public.paypal_billing_intents(clinic_id) where status='pending';
revoke all on table public.paypal_billing_intents from service_role;
grant select on table public.paypal_billing_intents to service_role;

create or replace function public.begin_paypal_billing_intent(p_clinic uuid, p_user uuid, p_plan text, p_provider_plan text)
returns public.paypal_billing_intents language plpgsql security definer set search_path = public, pg_temp as $$
declare v_intent public.paypal_billing_intents; v_subscription public.clinic_subscriptions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_clinic::text, 35));
  perform 1 from public.clinic_members where clinic_id=p_clinic and user_id=p_user and role='owner' and status='active' for share;
  if not found then raise exception 'billing_owner_required' using errcode='42501'; end if;
  if p_plan is null or p_plan not in ('basic','plus','pro') or p_provider_plan is null or length(p_provider_plan) not between 1 and 128 then
    raise exception 'invalid_plan' using errcode='22023';
  end if;
  select * into v_subscription from public.clinic_subscriptions where clinic_id=p_clinic for update;
  if found and (v_subscription.status in ('active','past_due') or v_subscription.provider_subscription_id is not null) then
    raise exception 'billing_subscription_exists' using errcode='23505';
  end if;
  if exists(select 1 from public.paypal_billing_intents where clinic_id=p_clinic and status<>'pending'
    and (provider_subscription_id is not null or creation_dispatched_at is not null)) then
    raise exception 'billing_reconciliation_required' using errcode='23505';
  end if;
  select * into v_intent from public.paypal_billing_intents where clinic_id=p_clinic and status='pending' for update;
  if found then
    if v_intent.user_id<>p_user or v_intent.plan_id<>p_plan or v_intent.provider_plan_id<>p_provider_plan then
      raise exception 'billing_intent_in_progress' using errcode='23505';
    end if;
    if v_intent.creation_dispatched_at is not null and v_intent.provider_subscription_id is null then
      raise exception 'billing_creation_unknown' using errcode='23505';
    end if;
    if v_intent.expires_at<=now() then
      if v_intent.creation_dispatched_at is not null or v_intent.provider_subscription_id is not null then
        raise exception 'billing_reconciliation_required' using errcode='23505';
      end if;
      update public.paypal_billing_intents set expires_at=now()+interval '30 minutes'
        where id=v_intent.id returning * into v_intent;
    end if;
    return v_intent;
  end if;
  insert into public.paypal_billing_intents(clinic_id,user_id,plan_id,provider_plan_id,creation_dispatched_at)
    values(p_clinic,p_user,p_plan,p_provider_plan,null) returning * into v_intent;
  return v_intent;
end $$;

-- No lease expiry or automatic reset. This permit authorizes at most ONE POST.
create function public.claim_paypal_billing_creation(p_intent uuid, p_clinic uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_subscription public.clinic_subscriptions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_clinic::text, 35));
  perform 1 from public.clinic_members where clinic_id=p_clinic and user_id=p_user and role='owner' and status='active' for share;
  if not found then raise exception 'billing_owner_required' using errcode='42501'; end if;
  select * into v_subscription from public.clinic_subscriptions where clinic_id=p_clinic for update;
  if found and (v_subscription.status in ('active','past_due') or v_subscription.provider_subscription_id is not null) then
    raise exception 'billing_subscription_exists' using errcode='23505';
  end if;
  update public.paypal_billing_intents set creation_dispatched_at=clock_timestamp()
    where id=p_intent and clinic_id=p_clinic and user_id=p_user and status='pending'
      and expires_at>clock_timestamp() and creation_dispatched_at is null and provider_subscription_id is null;
  return found;
end $$;

create or replace function public.bind_paypal_billing_intent(p_intent uuid, p_subscription text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_subscription is null or p_subscription !~ '^I-[A-Z0-9]{6,64}$' then raise exception 'invalid_subscription' using errcode='22023'; end if;
  -- Record a known identity even when provider latency outlived approval expiry.
  update public.paypal_billing_intents set provider_subscription_id=p_subscription
    where id=p_intent and creation_dispatched_at is not null
      and ((status='pending' and provider_subscription_id is null) or provider_subscription_id=p_subscription);
  if not found then raise exception 'invalid_billing_intent' using errcode='42501'; end if;
end $$;

create or replace function public.complete_paypal_billing_intent(p_intent uuid, p_clinic uuid, p_user uuid, p_plan text,
  p_subscription text, p_provider_plan text, p_status text, p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_intent public.paypal_billing_intents; v_current public.clinic_subscriptions;
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
  select * into v_current from public.clinic_subscriptions where clinic_id=p_clinic for update;
  if v_intent.status='completed' then
    if v_current.provider_subscription_id is distinct from p_subscription then raise exception 'superseded_billing_intent' using errcode='42501'; end if;
    return;
  end if;
  -- An old approval cannot replace another paid/unresolved subscription either.
  if v_current.provider_subscription_id is not null or v_current.status in ('active','past_due') then
    raise exception 'billing_subscription_exists' using errcode='23505';
  end if;
  if v_intent.expires_at<=now() or v_current.provider_subscription_id is distinct from v_intent.previous_subscription_id then
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

revoke all on function public.claim_paypal_billing_creation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_paypal_billing_creation(uuid,uuid,uuid) to service_role;
-- Existing RPC ACLs are retained by CREATE OR REPLACE (service_role only).
commit;
