-- PREPARED, NOT EXECUTED. Independently authorized disposable local DB only.
-- Apply baseline through 0067 and reviewed 0068 first. All fixtures roll back.
begin;
set local search_path=public,extensions;
set local timezone='UTC';
select extensions.no_plan();
insert into auth.users(id,email) values
 ('68000000-0000-4000-8000-000000000001','v103-owner@example.test'),
 ('68000000-0000-4000-8000-000000000002','v103-other-owner@example.test');
insert into public.clinics(id,name) values
 ('68100000-0000-4000-8000-000000000001','V103 synthetic'),
 ('68100000-0000-4000-8000-000000000002','V103 other tenant');
insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001','owner','active'),
 ('68100000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000002','owner','active');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider,provider_subscription_id,provider_plan_id)
 values('68100000-0000-4000-8000-000000000001','basic','active','paypal','I-V103LOCAL1','P-BASIC')
 on conflict(clinic_id) do update set plan_id='basic',status='active',billing_provider='paypal',provider_subscription_id='I-V103LOCAL1',provider_plan_id='P-BASIC';
insert into public.paypal_billing_intents(id,clinic_id,user_id,plan_id,provider_plan_id,provider_subscription_id,status,completed_at,creation_dispatched_at)
 values('68200000-0000-4000-8000-000000000001','68100000-0000-4000-8000-000000000001',
 '68000000-0000-4000-8000-000000000001','basic','P-BASIC','I-V103LOCAL1','completed',now(),now());
create temp table tickets(label text primary key,t jsonb);
create function pg_temp.claim(p_label text,p_webhook boolean default false) returns jsonb language plpgsql as $$
declare t jsonb; c jsonb;
begin
 if p_webhook then
  c:=public.claim_paypal_webhook('WH-'||p_label,'BILLING.SUBSCRIPTION.ACTIVATED','I-V103LOCAL1');
  t:=public.begin_paypal_reconciliation('I-V103LOCAL1','WH-'||p_label,(c->>'token')::uuid);
 else
  t:=public.begin_paypal_reconciliation('I-V103LOCAL1',null,null,'68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001');
 end if;
 insert into tickets values(p_label,t); return t;
end $$;
create function pg_temp.finish(p_label text,p_status text default 'ACTIVE',p_start timestamptz default null,p_end timestamptz default null,
 p_custom text default '68200000-0000-4000-8000-000000000001',p_updated timestamptz default clock_timestamp())
 returns text language sql as $$
 select public.finish_paypal_reconciliation((t->>'id')::uuid,(t->>'generation')::bigint,'I-V103LOCAL1','P-BASIC',p_status,p_custom,p_updated,clock_timestamp(),p_start,p_end)
 from tickets where label=p_label;
$$;
select extensions.ok(not has_table_privilege('service_role','public.paypal_reconciliations','INSERT'),'journal direct insert denied');
select extensions.ok(not has_table_privilege('service_role','public.paypal_reconciliations','UPDATE'),'journal direct update denied');
select extensions.ok(not has_table_privilege('service_role','public.paypal_reconciliation_fences','UPDATE'),'generation direct update denied');
select extensions.ok(not has_function_privilege('authenticated','public.begin_paypal_reconciliation(text,text,uuid,uuid,uuid)','EXECUTE'),'authenticated cannot claim');
select extensions.ok(not has_function_privilege('anon','public.finish_paypal_reconciliation(uuid,bigint,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz)','EXECUTE'),'anon cannot finalize');
select extensions.ok(has_function_privilege('service_role','public.finish_paypal_reconciliation(uuid,bigint,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz)','EXECUTE'),'service can finalize corrected signature');
select extensions.ok(not has_function_privilege('service_role','public.finish_paypal_webhook(text,uuid,text,text,timestamptz,timestamptz)','EXECUTE'),'legacy unfenced writer inaccessible');
select extensions.ok(not exists(select 1 from (values('anon'),('authenticated')) r(role_name)
 cross join (values('public.begin_paypal_reconciliation(text,text,uuid,uuid,uuid)'),
 ('public.finish_paypal_reconciliation(uuid,bigint,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz)'),
 ('public.fail_paypal_reconciliation(uuid,bigint,text)'),('public.ignore_paypal_webhook(text,uuid)')) f(signature)
 where has_function_privilege(r.role_name,f.signature,'EXECUTE')),'all reconciliation RPCs deny both client roles');
select extensions.ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.paypal_reconciliations'::regclass,'public.paypal_reconciliation_fences'::regclass)),'both journals have RLS');
select extensions.ok((select bool_and(prosecdef and proowner=(select proowner from pg_proc where oid='public.complete_paypal_billing_intent(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz)'::regprocedure)
 and 'search_path=public, pg_temp'=any(proconfig)) from pg_proc where oid in
 ('public.begin_paypal_reconciliation(text,text,uuid,uuid,uuid)'::regprocedure,
 'public.finish_paypal_reconciliation(uuid,bigint,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz)'::regprocedure)),'definer owner matches V1-02 and search_path restricted');
select extensions.throws_ok($$select public.begin_paypal_reconciliation('I-V103LOCAL1',null,null,'68100000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000002')$$,'42501','owner_required','real owner of another clinic denied');
select extensions.throws_ok($$select public.begin_paypal_reconciliation('I-V103LOCAL1',null,null,'68100000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000002')$$,'42501','subscription_denied','cannot import another clinic subscription');

-- Period persistence, both production finalization paths and every optional combination.
select pg_temp.claim('ind-both');
select extensions.is(pg_temp.finish('ind-both','ACTIVE','2020-01-01T00:00:00Z','2030-01-01T00:00:00Z'),'processed','independent both timestamps applied');
select extensions.ok((select current_period_start='2020-01-01T00:00:00Z'::timestamptz and current_period_end='2030-01-01T00:00:00Z'::timestamptz from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'),'independent dates persisted');
select pg_temp.claim('ind-start');
select extensions.is(pg_temp.finish('ind-start','ACTIVE','2020-02-01T00:00:00Z',null),'processed','start only applied');
select extensions.ok((select current_period_start='2020-02-01T00:00:00Z'::timestamptz and current_period_end='2030-01-01T00:00:00Z'::timestamptz from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'),'absent end preserved');
select pg_temp.claim('ind-end');
select extensions.is(pg_temp.finish('ind-end','ACTIVE',null,'2030-02-01T00:00:00Z'),'processed','end only applied');
select pg_temp.claim('ind-neither');
select extensions.is(pg_temp.finish('ind-neither'),'processed','neither provided accepted');
select extensions.ok((select current_period_start='2020-02-01T00:00:00Z'::timestamptz and current_period_end='2030-02-01T00:00:00Z'::timestamptz from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'),'both stored dates preserved');
select pg_temp.claim('web-both',true);
select extensions.is(pg_temp.finish('web-both','ACTIVE','2020-03-01T00:00:00Z','2030-03-01T00:00:00Z'),'processed','webhook dates apply through legacy internal finalizer');
select extensions.ok((select current_period_start='2020-03-01T00:00:00Z'::timestamptz and current_period_end='2030-03-01T00:00:00Z'::timestamptz from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'),'webhook dates persisted');
select pg_temp.claim('web-start',true);
select extensions.is(pg_temp.finish('web-start','ACTIVE','2020-04-01T00:00:00Z',null),'processed','webhook start only');
select pg_temp.claim('web-end',true);
select extensions.is(pg_temp.finish('web-end','ACTIVE',null,'2030-04-01T00:00:00Z'),'processed','webhook end only');
select pg_temp.claim('web-neither',true);
select extensions.is(pg_temp.finish('web-neither'),'processed','webhook neither');
select extensions.ok((select current_period_start='2020-04-01T00:00:00Z'::timestamptz and current_period_end='2030-04-01T00:00:00Z'::timestamptz from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'),'webhook absent values preserve dates');
select extensions.is((select processing_status from public.paypal_webhook_events where event_id='WH-web-both'),'processed','event journal committed with dates');
-- A transport error after SQL commit must not turn applied/processed into failed.
select public.fail_paypal_webhook('WH-web-both',(select event_token from public.paypal_reconciliations where id=(select (t->>'id')::uuid from tickets where label='web-both')));
select public.fail_paypal_reconciliation((select (t->>'id')::uuid from tickets where label='web-both'),(select (t->>'generation')::bigint from tickets where label='web-both'));
select extensions.is((select processing_status from public.paypal_webhook_events where event_id='WH-web-both'),'processed','late failure marker preserves processed event');
select extensions.is((select state from public.paypal_reconciliations where id=(select (t->>'id')::uuid from tickets where label='web-both')),'applied','late failure marker preserves applied attempt');
select extensions.is(public.claim_paypal_webhook('WH-web-both','BILLING.SUBSCRIPTION.ACTIVATED','I-V103LOCAL1')->>'state','processed','redelivery after committed finalization does not reclaim');
select pg_temp.claim('equal-version');
select extensions.is(pg_temp.finish('equal-version','ACTIVE',null,'2030-05-01T00:00:00Z',null,
 (select provider_updated_at from public.paypal_reconciliation_fences where provider_subscription_id='I-V103LOCAL1')),'processed','equal status version can advance billing schedule');
select pg_temp.claim('equal-conflict');
select extensions.is(pg_temp.finish('equal-conflict','SUSPENDED',null,null,null,
 (select provider_updated_at from public.paypal_reconciliation_fences where provider_subscription_id='I-V103LOCAL1')),'requires_review','equal status version cannot change commercial state');

select pg_temp.claim('bad-time');
select extensions.throws_ok($$select pg_temp.finish('bad-time','ACTIVE','invalid',null)$$,'22007',null,'malformed timestamp rejected by PostgreSQL type');
select extensions.is(pg_temp.finish('bad-time','ACTIVE','infinity',null),'requires_review','non-finite timestamp review');
select pg_temp.claim('bad-combination');
select extensions.is(pg_temp.finish('bad-combination','ACTIVE','2031-01-01T00:00:00Z',null),'requires_review','partial date inconsistent with stored end review');
select pg_temp.claim('bad-custom');
select extensions.is(pg_temp.finish('bad-custom','ACTIVE',null,null,'other'),'requires_review','present conflicting custom rejected');
select pg_temp.claim('no-custom');
select extensions.is(pg_temp.finish('no-custom','ACTIVE',null,null,null),'processed','missing custom accepted only with completed binding');
update public.paypal_billing_intents set status='pending',completed_at=null where id='68200000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.claim('unresolved')->>'state','requires_review','unresolved historical intent not a trusted binding');
select extensions.is((select reason from public.paypal_reconciliations where id=(select (t->>'id')::uuid from tickets where label='unresolved')),'identity_unverified','insufficient identity retained in audit');
update public.paypal_billing_intents set status='completed',completed_at=now() where id='68200000-0000-4000-8000-000000000001';

select pg_temp.claim('old'); select pg_temp.claim('new');
select extensions.is(pg_temp.finish('new','ACTIVE',null,'2030-05-01T00:00:00Z'),'processed','newer schedule applied');
select extensions.is(pg_temp.finish('old','ACTIVE',null,'2030-04-01T00:00:00Z'),'stale','older generation cannot overwrite dates');
select pg_temp.claim('backward');
select extensions.is(pg_temp.finish('backward','ACTIVE',null,'2030-04-01T00:00:00Z'),'requires_review','new generation cannot regress schedule');
select pg_temp.claim('old-provider');
select extensions.is(pg_temp.finish('old-provider','ACTIVE',null,'2030-06-01T00:00:00Z',null,'2000-01-01T00:00:00Z'),'requires_review','older status observation cannot advance dates');
select extensions.is((select current_period_end from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'),'2030-05-01T00:00:00Z'::timestamptz,'all stale/conflict dates left unchanged');
select pg_temp.claim('expired');
update public.paypal_reconciliation_fences set lease_until=clock_timestamp()-interval '1 second' where provider_subscription_id='I-V103LOCAL1';
select extensions.is(pg_temp.finish('expired'),'stale','expired lease rejected');
select pg_temp.claim('cancel');
select extensions.is(pg_temp.finish('cancel','CANCELLED'),'processed','current cancellation applied');
select pg_temp.claim('terminal');
select extensions.is(pg_temp.finish('terminal','ACTIVE'),'requires_review','cancelled cannot revive');
select extensions.is((select status from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'),'cancelled','terminal state preserved');
select extensions.ok((select indisunique and indisvalid and indisready from pg_index where indexrelid='public.paypal_billing_intents_one_pending_per_clinic'::regclass),'V1-02 unique pending index retained');
-- Strict effective intervals: exercise both transaction paths with stored dates.
-- Snapshot the entire subscription, so status, dates and updated_at must survive.
create temp table period_before as select to_jsonb(s) row_value from public.clinic_subscriptions s where provider_subscription_id='I-V103LOCAL1';
create function pg_temp.strict_period_tests() returns setof text language plpgsql as $$
declare web boolean; scenario text; v_label text; v_start timestamptz; v_end timestamptz; result text;
begin
 foreach web in array array[false,true] loop
  foreach scenario in array array['equal','offset-equal','earlier','start-only-equal','end-only-equal'] loop
   v_label:='strict-'||web::text||'-'||scenario;
   v_start:='2025-01-01T00:00:00Z'; v_end:=v_start;
   if scenario='offset-equal' then v_end:='2024-12-31T18:00:00-06:00'; end if;
   if scenario='earlier' then v_end:='2024-12-31T00:00:00Z'; end if;
   if scenario='start-only-equal' then
    select current_period_end into v_start from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'; v_end:=null;
   elsif scenario='end-only-equal' then
    select current_period_start into v_end from public.clinic_subscriptions where provider_subscription_id='I-V103LOCAL1'; v_start:=null;
   end if;
   perform pg_temp.claim(v_label,web);
   result:=pg_temp.finish(v_label,'ACTIVE',v_start,v_end);
   return next extensions.is(result,'requires_review',v_label||' rejected before update');
   return next extensions.ok((select state='requires_review' and reason='provider_mismatch' from public.paypal_reconciliations where id=(select (t->>'id')::uuid from tickets where tickets.label=v_label)),v_label||' audit preserves provider mismatch');
   return next extensions.is((select to_jsonb(s) from public.clinic_subscriptions s where provider_subscription_id='I-V103LOCAL1'),(select row_value from period_before),v_label||' entire subscription unchanged');
  end loop;
 end loop;
end $$;
select * from pg_temp.strict_period_tests();
select * from extensions.finish();
rollback;
