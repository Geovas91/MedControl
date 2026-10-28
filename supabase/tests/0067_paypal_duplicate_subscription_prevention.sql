-- PREPARED, NOT EXECUTED. Local disposable DB with reviewed 0067 already applied.
begin;
select extensions.no_plan();
insert into auth.users(id,email) values
 ('67000000-0000-4000-8000-000000000001','v102-owner-a@example.test'),
 ('67000000-0000-4000-8000-000000000002','v102-owner-b@example.test');
insert into public.clinics(id,name) values
 ('67100000-0000-4000-8000-000000000001','V102 local A'),
 ('67100000-0000-4000-8000-000000000002','V102 local B');
insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('67100000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001','owner','active'),
 ('67100000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000002','owner','active');

select extensions.ok(not has_table_privilege('service_role','public.paypal_billing_intents','insert'),'server cannot bypass the RPC by inserting');
select extensions.ok(not has_table_privilege('service_role','public.paypal_billing_intents','update'),'server cannot reset a used permit directly');
select extensions.ok(not has_table_privilege('service_role','public.paypal_billing_intents','delete,truncate'),'server cannot remove an unresolved operation');
select extensions.ok(not has_function_privilege('authenticated','public.claim_paypal_billing_creation(uuid,uuid,uuid)','execute'),'client cannot claim a permit');
select extensions.ok(not has_function_privilege('anon','public.claim_paypal_billing_creation(uuid,uuid,uuid)','execute'),'anonymous cannot claim a permit');
select extensions.ok(has_function_privilege('service_role','public.claim_paypal_billing_creation(uuid,uuid,uuid)','execute'),'server can claim with authoritative owner checks');

create temporary table v102_intent as select * from public.begin_paypal_billing_intent(
 '67100000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001','basic','P-BASIC');
select extensions.is((public.begin_paypal_billing_intent('67100000-0000-4000-8000-000000000001',
 '67000000-0000-4000-8000-000000000001','basic','P-BASIC')).id,(select id from v102_intent),'repeat keeps same operation');
select extensions.throws_ok($$select public.begin_paypal_billing_intent('67100000-0000-4000-8000-000000000001',
 '67000000-0000-4000-8000-000000000001','pro','P-PRO')$$,'23505','billing_intent_in_progress','different plan cannot replace pending');
select extensions.throws_ok($$select public.claim_paypal_billing_creation((select id from v102_intent),
 '67100000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000002')$$,'42501','billing_owner_required','foreign owner cannot claim');
select extensions.ok(not public.claim_paypal_billing_creation((select id from v102_intent),
 '67100000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000002'),'foreign clinic cannot claim another intent');
select extensions.throws_ok($$select public.bind_paypal_billing_intent((select id from v102_intent),'I-V102LOCAL1')$$,'42501','invalid_billing_intent','unsent intent cannot be bound');

select extensions.ok(public.claim_paypal_billing_creation((select id from v102_intent),
 '67100000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001'),'first permit succeeds');
select extensions.ok(not public.claim_paypal_billing_creation((select id from v102_intent),
 '67100000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001'),'second permit fails');
select extensions.throws_ok($$select public.begin_paypal_billing_intent('67100000-0000-4000-8000-000000000001',
 '67000000-0000-4000-8000-000000000001','basic','P-BASIC')$$,'23505','billing_creation_unknown','lost provider result does not release operation');
update public.paypal_billing_intents set expires_at=now()-interval '1 day' where id=(select id from v102_intent);
select extensions.throws_ok($$select public.begin_paypal_billing_intent('67100000-0000-4000-8000-000000000001',
 '67000000-0000-4000-8000-000000000001','basic','P-BASIC')$$,'23505','billing_creation_unknown','expiry cannot authorize another creation');
select extensions.lives_ok($$select public.bind_paypal_billing_intent((select id from v102_intent),'I-V102LOCAL1')$$,'known late ID can still be persisted');
select extensions.lives_ok($$select public.bind_paypal_billing_intent((select id from v102_intent),'I-V102LOCAL1')$$,'late binding retry idempotent');
select extensions.throws_ok($$select public.bind_paypal_billing_intent((select id from v102_intent),'I-V102OTHER1')$$,'42501','invalid_billing_intent','binding cannot change identity');
select extensions.throws_ok($$select public.begin_paypal_billing_intent('67100000-0000-4000-8000-000000000001',
 '67000000-0000-4000-8000-000000000001','basic','P-BASIC')$$,'23505','billing_reconciliation_required','expired known result cannot start replacement');

-- Active internal subscriptions and all external references block new creation.
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider)
 values('67100000-0000-4000-8000-000000000002','basic','active','manual');
select extensions.throws_ok($$select public.begin_paypal_billing_intent('67100000-0000-4000-8000-000000000002',
 '67000000-0000-4000-8000-000000000002','basic','P-BASIC')$$,'23505','billing_subscription_exists','active clinic cannot create');
update public.clinic_subscriptions set status='cancelled',provider_subscription_id='I-V102OLD123'
 where clinic_id='67100000-0000-4000-8000-000000000002';
select extensions.throws_ok($$select public.begin_paypal_billing_intent('67100000-0000-4000-8000-000000000002',
 '67000000-0000-4000-8000-000000000002','basic','P-BASIC')$$,'23505','billing_subscription_exists','old external reference requires V1-03');

-- Even an old pending approval cannot replace an active subscription.
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider)
 values('67100000-0000-4000-8000-000000000001','pro','active','manual');
update public.paypal_billing_intents set expires_at=now()+interval '30 minutes' where id=(select id from v102_intent);
select extensions.throws_ok($$select public.complete_paypal_billing_intent((select id from v102_intent),
 '67100000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001','basic','I-V102LOCAL1','P-BASIC','active',null,null)$$,
 '23505','billing_subscription_exists','old approval cannot replace active plan');
select extensions.is((select count(*)::integer from public.paypal_billing_intents where clinic_id='67100000-0000-4000-8000-000000000001'),1,'no replacement operation created');
select * from extensions.finish();
rollback;
