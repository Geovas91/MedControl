-- V1-03-B. Review locally; no remote application authorized.
begin;
create table public.paypal_reconciliation_fences (
 provider_subscription_id text primary key,
 generation bigint not null default 0 check(generation>=0),
 lease_until timestamptz,
 provider_updated_at timestamptz
);
create table public.paypal_reconciliations (
 id uuid primary key default gen_random_uuid(),
 provider_subscription_id text not null,
 generation bigint not null,
 clinic_id uuid references public.clinics(id),
 actor_id uuid,
 event_id text,
 event_token uuid,
 local_fingerprint text,
 provider_plan text,
 custom_id text,
 state text not null check(state in ('claimed','verified','applied','requires_review','failed','stale')),
 reason text check(reason in ('subscription_not_found','identity_unverified','provider_mismatch','local_conflict','stale_observation','terminal_conflict','provider_unavailable')),
 provider_status text,
 provider_updated_at timestamptz,
 verified_at timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
create index paypal_reconciliations_pending on public.paypal_reconciliations(state,created_at) where state<>'applied';
alter table public.paypal_reconciliation_fences enable row level security;
alter table public.paypal_reconciliations enable row level security;
revoke all on public.paypal_reconciliation_fences,public.paypal_reconciliations from public,anon,authenticated,service_role;
grant select on public.paypal_reconciliation_fences,public.paypal_reconciliations to service_role;

create function public.begin_paypal_reconciliation(p_subscription text,p_event text default null,p_token uuid default null,p_clinic uuid default null,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare s public.clinic_subscriptions; f public.paypal_reconciliation_fences; a public.paypal_reconciliations; v_custom text;
begin
 if p_subscription is null or p_subscription !~ '^I-[A-Z0-9]{6,64}$' then raise exception 'invalid_subscription' using errcode='22023'; end if;
 if p_event is not null then
  perform 1 from public.paypal_webhook_events where event_id=p_event and provider_subscription_id=p_subscription
   and processing_status='processing' and lease_token=p_token and lease_until>clock_timestamp() for update;
  if not found or p_actor is not null or p_clinic is not null then raise exception 'invalid_webhook_lease' using errcode='42501'; end if;
 else
  if p_actor is null or p_clinic is null or p_token is not null then raise exception 'owner_required' using errcode='42501'; end if;
  perform 1 from public.clinic_members where clinic_id=p_clinic and user_id=p_actor and role='owner' and status='active' for share;
  if not found then raise exception 'owner_required' using errcode='42501'; end if;
 end if;
 insert into public.paypal_reconciliation_fences(provider_subscription_id) values(p_subscription) on conflict do nothing;
 update public.paypal_reconciliation_fences set generation=generation+1,lease_until=clock_timestamp()+interval '2 minutes'
  where provider_subscription_id=p_subscription returning * into f;
 select * into s from public.clinic_subscriptions where billing_provider='paypal' and provider_subscription_id=p_subscription;
 if p_event is null and (s.id is null or s.clinic_id is distinct from p_clinic) then raise exception 'subscription_denied' using errcode='42501'; end if;
 -- A completed owner-approved intent is the provenance of the local binding.
 -- Pending/expired unresolved history must not become a verified association.
 select id::text into v_custom from public.paypal_billing_intents where provider_subscription_id=p_subscription and clinic_id=s.clinic_id
  and provider_plan_id=s.provider_plan_id and plan_id=s.plan_id and status='completed' and completed_at is not null and creation_dispatched_at is not null;
 insert into public.paypal_reconciliations(provider_subscription_id,generation,clinic_id,actor_id,event_id,event_token,local_fingerprint,provider_plan,custom_id,state,reason)
 values(p_subscription,f.generation,s.clinic_id,p_actor,p_event,p_token,case when s.id is not null then md5(s::text) end,s.provider_plan_id,v_custom,
 case when s.id is null or v_custom is null then 'requires_review' else 'claimed' end,
 case when s.id is null then 'subscription_not_found' when v_custom is null then 'identity_unverified' end) returning * into a;
 return jsonb_build_object('id',a.id,'generation',a.generation,'provider_plan',a.provider_plan,'custom_id',a.custom_id,'identity_trusted',a.state='claimed','state',a.state);
end $$;

create function public.finish_paypal_reconciliation(p_id uuid,p_generation bigint,p_subscription text,p_plan text,p_status text,p_custom text,p_updated timestamptz,p_verified timestamptz,p_start timestamptz,p_end timestamptz)
returns text language plpgsql security definer set search_path=public,pg_temp set timezone='UTC' as $$
declare a public.paypal_reconciliations; f public.paypal_reconciliation_fences; s public.clinic_subscriptions; mapped text; why text; outcome text;
begin
 -- Independent: membership -> fence -> attempt -> subscription.
 -- Webhook: event -> fence -> attempt -> subscription. No intent row locks.
 -- Match V1-02's membership-before-subscription order; never take membership
 -- after a fence/subscription lock (including when revocation is queued).
 select * into a from public.paypal_reconciliations where id=p_id;
 if a.actor_id is not null then
  perform 1 from public.clinic_members where clinic_id=a.clinic_id and user_id=a.actor_id and role='owner' and status='active' for share;
  if not found then raise exception 'owner_required' using errcode='42501'; end if;
 end if;
 if a.event_id is not null then perform 1 from public.paypal_webhook_events where event_id=a.event_id for update; end if;
 select * into f from public.paypal_reconciliation_fences where provider_subscription_id=a.provider_subscription_id for update;
 select * into a from public.paypal_reconciliations where id=p_id for update;
 if a.id is null then raise exception 'reconciliation_missing' using errcode='42501'; end if;
 if a.state<>'claimed' then return a.state; end if;
 if a.generation is distinct from p_generation or f.generation is distinct from p_generation or f.lease_until is null or f.lease_until<=clock_timestamp() then
  update public.paypal_reconciliations set state='stale',reason='stale_observation' where id=p_id; return 'stale'; end if;
 select * into s from public.clinic_subscriptions where provider_subscription_id=a.provider_subscription_id and billing_provider='paypal' for update;
 -- Waiting for the subscription lock can outlive a previously valid lease.
 if f.lease_until<=clock_timestamp() then
  update public.paypal_reconciliations set state='stale',reason='stale_observation' where id=p_id; return 'stale'; end if;
 if a.event_id is not null then
  perform 1 from public.paypal_webhook_events where event_id=a.event_id and processing_status='processing'
   and lease_token=a.event_token and lease_until>clock_timestamp();
  if not found then raise exception 'webhook_lease_lost' using errcode='40001'; end if;
 end if;
 mapped:=case p_status when 'ACTIVE' then 'active' when 'APPROVAL_PENDING' then 'inactive' when 'APPROVED' then 'inactive' when 'SUSPENDED' then 'past_due' when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'cancelled' end;
 if s.id is null or s.clinic_id is distinct from a.clinic_id or md5(s::text) is distinct from a.local_fingerprint then why:='local_conflict';
 elsif not exists(select 1 from public.paypal_billing_intents where id::text=a.custom_id and clinic_id=s.clinic_id
  and provider_subscription_id=s.provider_subscription_id and provider_plan_id=s.provider_plan_id and plan_id=s.plan_id
  and status='completed' and completed_at is not null and creation_dispatched_at is not null) then why:='identity_unverified';
 elsif p_subscription is distinct from a.provider_subscription_id or p_plan is distinct from a.provider_plan or mapped is null
  or (p_custom is not null and p_custom is distinct from a.custom_id) or p_verified is null
  or not isfinite(p_verified) or (p_updated is not null and not isfinite(p_updated))
  or (p_start is not null and not isfinite(p_start)) or (p_end is not null and not isfinite(p_end))
  or coalesce(p_end,s.current_period_end)<coalesce(p_start,s.current_period_start)
  or p_updated>clock_timestamp()+interval '5 seconds' or p_verified>clock_timestamp()+interval '5 seconds' or p_verified<clock_timestamp()-interval '2 minutes' then why:='provider_mismatch';
 elsif f.provider_updated_at is not null and (p_updated is null or p_updated<f.provider_updated_at or (p_updated=f.provider_updated_at and mapped<>s.status)) then why:='stale_observation';
 -- status_update_time versions status, not the billing schedule. Equal status
 -- versions may advance the schedule, but never silently regress stored dates.
 elsif p_start<s.current_period_start or p_end<s.current_period_end then why:='stale_observation';
 elsif s.status='cancelled' and mapped<>'cancelled' then why:='terminal_conflict';
 end if;
 if why is not null then update public.paypal_reconciliations set state='requires_review',reason=why,provider_status=case when mapped is not null then p_status end,provider_updated_at=p_updated,verified_at=p_verified where id=p_id; return 'requires_review'; end if;
 update public.paypal_reconciliations set state='verified',provider_status=p_status,provider_updated_at=p_updated,verified_at=p_verified where id=p_id;
 if a.event_id is not null then
  outcome:=public.finish_paypal_webhook(a.event_id,a.event_token,mapped,p_plan,p_start,p_end);
  if outcome<>'processed' then update public.paypal_reconciliations set state='requires_review',reason='local_conflict' where id=p_id;return 'requires_review';end if;
 else
  update public.clinic_subscriptions set status=mapped,cancel_at_period_end=(mapped='cancelled'),
   current_period_start=coalesce(p_start,current_period_start),current_period_end=coalesce(p_end,current_period_end) where id=s.id;
 end if;
 update public.paypal_reconciliation_fences set provider_updated_at=coalesce(p_updated,provider_updated_at) where provider_subscription_id=a.provider_subscription_id;
 update public.paypal_reconciliations set state='applied' where id=p_id;
 return 'processed';
end $$;
create function public.fail_paypal_reconciliation(p_id uuid,p_generation bigint,p_reason text default 'provider_unavailable')
returns void language sql security definer set search_path=public,pg_temp set timezone='UTC' as $$
 update public.paypal_reconciliations set state=case when p_reason in ('identity_unverified','provider_mismatch') then 'requires_review' else 'failed' end,reason=p_reason
  where id=p_id and generation=p_generation and state='claimed' and p_reason in ('provider_mismatch','provider_unavailable','identity_unverified');
$$;
-- The legacy writer is now reachable only from the fenced SECURITY DEFINER RPC.
revoke all on function public.finish_paypal_webhook(text,uuid,text,text,timestamptz,timestamptz) from service_role;
revoke all on function public.begin_paypal_reconciliation(text,text,uuid,uuid,uuid), public.finish_paypal_reconciliation(uuid,bigint,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz),public.fail_paypal_reconciliation(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.begin_paypal_reconciliation(text,text,uuid,uuid,uuid), public.finish_paypal_reconciliation(uuid,bigint,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz),public.fail_paypal_reconciliation(uuid,bigint,text) to service_role;
create function public.ignore_paypal_webhook(p_event text,p_token uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.paypal_webhook_events set processing_status='processed',processed_at=now(),last_error_code='unsupported_event',lease_token=null,lease_until=null
 where event_id=p_event and processing_status='processing' and lease_token=p_token and lease_until>clock_timestamp()
 and event_type not in ('BILLING.SUBSCRIPTION.ACTIVATED','BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.EXPIRED','BILLING.SUBSCRIPTION.SUSPENDED','BILLING.SUBSCRIPTION.PAYMENT.FAILED','PAYMENT.SALE.COMPLETED','PAYMENT.SALE.DENIED');
 if not found then raise exception 'invalid_ignored_event' using errcode='42501';end if;
 return 'processed';
end $$;
revoke all on function public.ignore_paypal_webhook(text,uuid) from public,anon,authenticated;
grant execute on function public.ignore_paypal_webhook(text,uuid) to service_role;
commit;
