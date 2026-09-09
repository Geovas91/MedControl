create extension if not exists pgtap with schema extensions;
begin;
select extensions.no_plan();
create temporary table clinical_payment_snapshot as select count(*)::integer as total from public.payments;
insert into auth.users(id,email) values
 ('35000000-0000-4000-8000-000000000001','billing-owner@example.test'),
 ('35000000-0000-4000-8000-000000000002','billing-other@example.test');
insert into public.clinics(id,name,timezone) values
 ('35100000-0000-4000-8000-000000000001','Billing A','America/Mexico_City'),
 ('35100000-0000-4000-8000-000000000002','Billing B','America/Mexico_City');
insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','owner','active'),
 ('35100000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000002','owner','active');

select extensions.ok((select relrowsecurity from pg_class where oid='public.paypal_billing_intents'::regclass),'intent RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid='public.paypal_webhook_events'::regclass),'webhook RLS enabled');
select extensions.ok(not has_table_privilege('authenticated','public.paypal_billing_intents','select'),'tenant cannot read intents directly');
select extensions.ok(not has_table_privilege('authenticated','public.paypal_webhook_events','select'),'tenant cannot read provider events');
select extensions.ok(not has_table_privilege('anon','public.paypal_billing_intents','insert'),'anonymous cannot insert intents');
select extensions.ok(not has_function_privilege('authenticated','public.begin_paypal_billing_intent(uuid,uuid,text,text)','execute'),'tenant cannot forge provider bindings');
select extensions.ok(not has_function_privilege('authenticated','public.complete_paypal_billing_intent(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz)','execute'),'tenant cannot complete directly');
select extensions.ok(not has_function_privilege('anon','public.claim_paypal_webhook(text,text,text)','execute'),'anonymous cannot claim events');
select extensions.ok(has_function_privilege('service_role','public.claim_paypal_webhook(text,text,text)','execute'),'server may claim verified events');
select extensions.ok((select count(*)=6 and bool_and(prosecdef and proconfig @> array['search_path=public, pg_temp'])
  from pg_proc where pronamespace='public'::regnamespace and proname in ('begin_paypal_billing_intent','bind_paypal_billing_intent',
  'complete_paypal_billing_intent','claim_paypal_webhook','fail_paypal_webhook','finish_paypal_webhook')),'all six RPCs use fixed search_path and SECURITY DEFINER');
select extensions.ok((select bool_and(not has_function_privilege('anon',oid,'execute') and not has_function_privilege('authenticated',oid,'execute')
  and has_function_privilege('service_role',oid,'execute')) from pg_proc where pronamespace='public'::regnamespace and proname in
  ('begin_paypal_billing_intent','bind_paypal_billing_intent','complete_paypal_billing_intent','claim_paypal_webhook','fail_paypal_webhook','finish_paypal_webhook')),
  'all provider RPC grants deny clients and allow service role');
select extensions.ok(not has_table_privilege('authenticated','public.paypal_billing_intents','insert,update,delete')
  and not has_table_privilege('authenticated','public.paypal_webhook_events','insert,update,delete')
  and not has_table_privilege('anon','public.paypal_webhook_events','select,insert,update,delete'),'internal tables deny every client mutation');

create temporary table billing_fixture as select (public.begin_paypal_billing_intent(
 '35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','P-BASIC')).*;
select extensions.is((select count(*)::integer from billing_fixture),1,'owner starts intent');
select extensions.is((public.begin_paypal_billing_intent('35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','P-BASIC')).id,(select id from billing_fixture),'creation retry reuses server intent');
select extensions.throws_ok($$select public.begin_paypal_billing_intent('35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','pro','P-PRO')$$,'23505','billing_intent_in_progress','concurrent plan cannot replace pending intent');
select extensions.throws_ok($$select public.begin_paypal_billing_intent('35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000002','basic','P-BASIC')$$,'42501','billing_owner_required','no cross-clinic owner');
select public.bind_paypal_billing_intent((select id from billing_fixture),'I-SUBSCRIPTION1');
select extensions.lives_ok($$select public.bind_paypal_billing_intent((select id from billing_fixture),'I-SUBSCRIPTION1')$$,'binding retry idempotent');
select extensions.throws_ok($$select public.bind_paypal_billing_intent((select id from billing_fixture),'I-OTHER123')$$,'42501','invalid_billing_intent','binding cannot be replaced');

-- Every non-owner and inactive owner is rejected by the database too.
update public.clinic_members set role='admin' where user_id='35000000-0000-4000-8000-000000000001';
select extensions.throws_ok($$select public.begin_paypal_billing_intent('35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','P-BASIC')$$,'42501','billing_owner_required','admin denied');
update public.clinic_members set role='doctor' where user_id='35000000-0000-4000-8000-000000000001';
select extensions.throws_ok($$select public.begin_paypal_billing_intent('35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','P-BASIC')$$,'42501','billing_owner_required','doctor denied');
update public.clinic_members set role='assistant' where user_id='35000000-0000-4000-8000-000000000001';
select extensions.throws_ok($$select public.begin_paypal_billing_intent('35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','P-BASIC')$$,'42501','billing_owner_required','assistant denied');
update public.clinic_members set role='owner',status='suspended' where user_id='35000000-0000-4000-8000-000000000001';
select extensions.throws_ok($$select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','I-SUBSCRIPTION1','P-BASIC','active',null,null)$$,'42501','billing_owner_required','suspension after provider check blocks final write');
update public.clinic_members set status='active' where user_id='35000000-0000-4000-8000-000000000001';

select extensions.throws_ok($$select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000002','basic','I-SUBSCRIPTION1','P-BASIC','active',null,null)$$,'42501','invalid_billing_intent','other clinic and user cannot consume');
insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000002','owner','active'),
 ('35100000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000001','owner','active');
select extensions.throws_ok($$select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000002','basic','I-SUBSCRIPTION1','P-BASIC','active',null,null)$$,'42501','invalid_billing_intent','another owner in same clinic cannot consume another user intent');
select extensions.throws_ok($$select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000001','basic','I-SUBSCRIPTION1','P-BASIC','active',null,null)$$,'42501','invalid_billing_intent','same owner cannot consume intent in another clinic');
select extensions.throws_ok($$select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','pro','I-SUBSCRIPTION1','P-BASIC','active',null,null)$$,'42501','invalid_billing_intent','plan bound');
select extensions.throws_ok($$select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','I-OTHER123','P-BASIC','active',null,null)$$,'42501','invalid_billing_intent','provider id bound');
update public.paypal_billing_intents set expires_at=now()-interval '1 second';
select extensions.throws_ok($$select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','I-SUBSCRIPTION1','P-BASIC','active',null,null)$$,'42501','expired_or_superseded_intent','expired intent denied');
update public.paypal_billing_intents set expires_at=now()+interval '30 minutes';
select extensions.lives_ok($$select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','I-SUBSCRIPTION1','P-BASIC','active',null,null)$$,'owner completes');
select extensions.is((select status from public.paypal_billing_intents where id=(select id from billing_fixture)),'completed','consumed atomically');
select extensions.is((select count(*)::integer from public.clinic_subscriptions where provider_subscription_id='I-SUBSCRIPTION1'),1,'exactly one SaaS subscription');

create temporary table webhook_fixture(token uuid);
insert into webhook_fixture select (public.claim_paypal_webhook('WH-EVENT1','BILLING.SUBSCRIPTION.CANCELLED','I-SUBSCRIPTION1')->>'token')::uuid;
select extensions.is(public.claim_paypal_webhook('WH-EVENT1','BILLING.SUBSCRIPTION.CANCELLED','I-SUBSCRIPTION1')->>'state','busy','live lease prevents duplicate worker');
select extensions.is(public.finish_paypal_webhook('WH-EVENT1',(select token from webhook_fixture),'cancelled','P-BASIC',null,null),'processed','first delivery processes');
select extensions.is((select status from public.clinic_subscriptions where provider_subscription_id='I-SUBSCRIPTION1'),'cancelled','cancellation persisted');
select extensions.is(public.claim_paypal_webhook('WH-EVENT1','BILLING.SUBSCRIPTION.CANCELLED','I-SUBSCRIPTION1')->>'state','processed','duplicate acknowledged');
select extensions.throws_ok($$select public.finish_paypal_webhook('WH-EVENT1',(select token from webhook_fixture),'active','P-BASIC',null,null)$$,'40001','webhook_lease_lost','duplicate cannot mutate');
select public.complete_paypal_billing_intent((select id from billing_fixture),'35100000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','basic','I-SUBSCRIPTION1','P-BASIC','active',null,null);
select extensions.is((select status from public.clinic_subscriptions where provider_subscription_id='I-SUBSCRIPTION1'),'cancelled','approval replay cannot undo cancellation');

update webhook_fixture set token=(public.claim_paypal_webhook('WH-FAIL','BILLING.SUBSCRIPTION.ACTIVATED','I-SUBSCRIPTION1')->>'token')::uuid;
select public.fail_paypal_webhook('WH-FAIL',(select token from webhook_fixture));
select extensions.is((select processing_status from public.paypal_webhook_events where event_id='WH-FAIL'),'failed','failure tracked');
update webhook_fixture set token=(public.claim_paypal_webhook('WH-FAIL','BILLING.SUBSCRIPTION.ACTIVATED','I-SUBSCRIPTION1')->>'token')::uuid;
select extensions.is(public.finish_paypal_webhook('WH-FAIL',(select token from webhook_fixture),'active','P-BASIC',null,null),'processed','failed delivery retries');
select extensions.is((select attempt_count from public.paypal_webhook_events where event_id='WH-FAIL'),2,'attempts counted');

update webhook_fixture set token=(public.claim_paypal_webhook('WH-STALE','BILLING.SUBSCRIPTION.ACTIVATED','I-SUBSCRIPTION1')->>'token')::uuid;
update public.paypal_webhook_events set lease_until=now()-interval '1 second' where event_id='WH-STALE';
select extensions.is(public.claim_paypal_webhook('WH-STALE','BILLING.SUBSCRIPTION.ACTIVATED','I-SUBSCRIPTION1')->>'state','claimed','stale worker recoverable');
select extensions.throws_ok($$select public.finish_paypal_webhook('WH-STALE',(select token from webhook_fixture),'active','P-BASIC',null,null)$$,'40001','webhook_lease_lost','old token cannot finalize');
select public.fail_paypal_webhook('WH-STALE',(select token from webhook_fixture));
select extensions.is((select processing_status from public.paypal_webhook_events where event_id='WH-STALE'),'processing','old token cannot fail newer worker');
select extensions.is(public.finish_paypal_webhook('WH-STALE',(select lease_token from public.paypal_webhook_events where event_id='WH-STALE'),'active','P-BASIC',null,null),'processed','replacement worker completes recovered stale event');

update webhook_fixture set token=(public.claim_paypal_webhook('WH-DB','BILLING.SUBSCRIPTION.ACTIVATED','I-SUBSCRIPTION1')->>'token')::uuid;
select extensions.throws_ok($$select public.finish_paypal_webhook('WH-DB',(select token from webhook_fixture),'active','P-BASIC','2026-01-02','2026-01-01')$$,'23514',null,'subscription constraint failure rolls back finalization');
select extensions.is((select processing_status from public.paypal_webhook_events where event_id='WH-DB'),'processing','failed transaction never marks processed');
select public.fail_paypal_webhook('WH-DB',(select token from webhook_fixture));
update webhook_fixture set token=(public.claim_paypal_webhook('WH-DB','BILLING.SUBSCRIPTION.ACTIVATED','I-SUBSCRIPTION1')->>'token')::uuid;
select extensions.is(public.finish_paypal_webhook('WH-DB',(select token from webhook_fixture),'active','P-BASIC',null,null),'processed','DB failure retry succeeds');

update webhook_fixture set token=(public.claim_paypal_webhook('WH-EARLY','BILLING.SUBSCRIPTION.ACTIVATED','I-NOLOCAL1')->>'token')::uuid;
select extensions.is(public.finish_paypal_webhook('WH-EARLY',(select token from webhook_fixture),'active','P-BASIC',null,null),'failed','missing local subscription is retryable');
select extensions.is(public.claim_paypal_webhook('WH-EARLY','BILLING.SUBSCRIPTION.ACTIVATED','I-NOLOCAL1')->>'state','claimed','early webhook can retry');
update webhook_fixture set token=(public.claim_paypal_webhook('WH-UNKNOWN','UNKNOWN.EVENT',null)->>'token')::uuid;
select extensions.is(public.finish_paypal_webhook('WH-UNKNOWN',(select token from webhook_fixture),null,null,null,null),'processed','unknown event safe no-op');
select extensions.is((select last_error_code from public.paypal_webhook_events where event_id='WH-UNKNOWN'),'unsupported_event','no-op reason allowlisted');
select extensions.ok(not exists(select 1 from information_schema.columns where table_name in ('paypal_billing_intents','paypal_webhook_events') and column_name in ('payload','raw_payload','email','payer')),'no raw payload or payer fields');
select extensions.is((select count(*)::integer from public.payments),(select total from clinical_payment_snapshot),'clinical payments untouched by SaaS operations');
delete from public.clinic_members where
  (clinic_id='35100000-0000-4000-8000-000000000001' and user_id='35000000-0000-4000-8000-000000000002') or
  (clinic_id='35100000-0000-4000-8000-000000000002' and user_id='35000000-0000-4000-8000-000000000001');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider)
  values('35100000-0000-4000-8000-000000000002','basic','inactive','manual');
select extensions.ok((select relrowsecurity from pg_class where oid='public.clinic_subscriptions'::regclass),'SaaS subscription RLS remains enabled');
set local role authenticated;
select set_config('request.jwt.claim.sub','35000000-0000-4000-8000-000000000001',true);
select extensions.is((select count(*)::integer from public.clinic_subscriptions where clinic_id='35100000-0000-4000-8000-000000000001'),1,'owner reads own subscription');
select extensions.is((select count(*)::integer from public.clinic_subscriptions where clinic_id='35100000-0000-4000-8000-000000000002'),0,'owner cannot read another tenant subscription');
select extensions.throws_ok(
  $$update public.clinic_subscriptions set status='cancelled' where clinic_id='35100000-0000-4000-8000-000000000001'$$,
  '42501',null,'tenant owner cannot bypass billing and write subscription directly'
);
select extensions.throws_ok($$select * from public.paypal_billing_intents$$,'42501',null,'authenticated SELECT actually denied');
select extensions.throws_ok($$select * from public.paypal_webhook_events$$,'42501',null,'authenticated event SELECT actually denied');
select extensions.throws_ok($$select public.claim_paypal_webhook('FORGED','UNKNOWN.EVENT',null)$$,'42501',null,'authenticated RPC actually denied');
reset role;
set local role service_role;
select extensions.is(public.claim_paypal_webhook('WH-SERVER','UNKNOWN.EVENT',null)->>'state','claimed','service_role RPC executes with minimum grants');
reset role;
select * from extensions.finish();
rollback;
