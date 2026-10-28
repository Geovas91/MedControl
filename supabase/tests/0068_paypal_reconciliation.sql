-- PREPARED ONLY. Requires an independently permitted disposable PostgreSQL lab with 0068.
-- No linked/remote execution. Synthetic fixtures and ROLLBACK only.
begin;
set local search_path=public,extensions;
select extensions.no_plan();
insert into auth.users(id,email) values ('68000000-0000-4000-8000-000000000001','v103-owner@example.test'),('68000000-0000-4000-8000-000000000002','v103-other@example.test');
insert into public.clinics(id,name) values ('68100000-0000-4000-8000-000000000001','V103 synthetic');
insert into public.clinic_members(clinic_id,user_id,role,status) values ('68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001','owner','active');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider,provider_subscription_id,provider_plan_id)
 values('68100000-0000-4000-8000-000000000001','basic','active','paypal','I-V103LOCAL1','P-BASIC')
 on conflict(clinic_id) do update set status='active',billing_provider='paypal',provider_subscription_id='I-V103LOCAL1',provider_plan_id='P-BASIC';
select extensions.ok(not has_table_privilege('service_role','public.paypal_reconciliations','INSERT'),'journal direct writes denied');
select extensions.ok(not has_table_privilege('service_role','public.paypal_reconciliation_fences','UPDATE'),'generation cannot be reset directly');
select extensions.ok(not has_function_privilege('authenticated','public.begin_paypal_reconciliation(text,text,uuid,uuid,uuid)','EXECUTE'),'clients cannot claim');
select extensions.ok(not has_function_privilege('anon','public.finish_paypal_reconciliation(uuid,bigint,text,text,text,text,timestamptz,timestamptz)','EXECUTE'),'anonymous cannot finalize');
select extensions.ok(not has_function_privilege('service_role','public.finish_paypal_webhook(text,uuid,text,text,timestamptz,timestamptz)','EXECUTE'),'legacy unfenced writer inaccessible');
select extensions.throws_ok($$select public.begin_paypal_reconciliation('I-V103LOCAL1',null,null,'68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000002')$$,'42501','owner_required','cross-tenant actor denied');
create temp table tickets(label text,t jsonb);
insert into tickets values('old',public.begin_paypal_reconciliation('I-V103LOCAL1',null,null,'68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001'));
insert into tickets values('new',public.begin_paypal_reconciliation('I-V103LOCAL1',null,null,'68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001'));
select extensions.is(public.finish_paypal_reconciliation((select (t->>'id')::uuid from tickets where label='new'),(select (t->>'generation')::bigint from tickets where label='new'),'I-V103LOCAL1','P-BASIC','CANCELLED',null,now(),now()),'processed','newer cancellation applied');
select extensions.is(public.finish_paypal_reconciliation((select (t->>'id')::uuid from tickets where label='old'),(select (t->>'generation')::bigint from tickets where label='old'),'I-V103LOCAL1','P-BASIC','ACTIVE',null,now(),now()),'stale','older generation rejected');
select extensions.is((select status from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'),'cancelled','no revival');
insert into tickets values('terminal',public.begin_paypal_reconciliation('I-V103LOCAL1',null,null,'68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001'));
select extensions.is(public.finish_paypal_reconciliation((select (t->>'id')::uuid from tickets where label='terminal'),(select (t->>'generation')::bigint from tickets where label='terminal'),'I-V103LOCAL1','P-BASIC','ACTIVE',null,now()+interval '1 second',now()),'requires_review','terminal conflict retained');
insert into tickets values('expired',public.begin_paypal_reconciliation('I-V103LOCAL1',null,null,'68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001'));
update public.paypal_reconciliation_fences set lease_until=now()-interval '1 second' where provider_subscription_id='I-V103LOCAL1';
select extensions.is(public.finish_paypal_reconciliation((select (t->>'id')::uuid from tickets where label='expired'),(select (t->>'generation')::bigint from tickets where label='expired'),'I-V103LOCAL1','P-BASIC','CANCELLED',null,now(),now()),'stale','expired lease rejected');
select * from extensions.finish();
rollback;