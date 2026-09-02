-- Run after `npx supabase db reset --local`.
create extension if not exists pgtap with schema extensions;

begin;
select extensions.plan(39);

select extensions.has_table('public','support_article_categories','support article categories exist');
select extensions.has_table('public','support_articles','support articles exist');
select extensions.has_table('public','support_article_versions','support article versions exist');
select extensions.has_table('public','support_tickets','support tickets exist');
select extensions.has_table('public','support_ticket_messages','support ticket messages exist');
select extensions.has_table('public','support_ticket_events','support ticket events exist');
select extensions.has_table('public','support_interaction_metrics','support interaction metrics exist');

insert into auth.users(id,email) values
  ('34000000-0000-4000-8000-000000000001','owner-a@example.test'),
  ('34000000-0000-4000-8000-000000000002','admin-a@example.test'),
  ('34000000-0000-4000-8000-000000000003','doctor-a@example.test'),
  ('34000000-0000-4000-8000-000000000004','assistant-a@example.test'),
  ('34000000-0000-4000-8000-000000000005','doctor-b@example.test'),
  ('34000000-0000-4000-8000-000000000006','platform@example.test');
insert into public.clinics(id,name,timezone) values
  ('34100000-0000-4000-8000-000000000001','Support Clinic A','America/Mexico_City'),
  ('34100000-0000-4000-8000-000000000002','Support Clinic B','America/Mexico_City');
insert into public.clinic_members(clinic_id,user_id,role,status) values
  ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','owner','active'),
  ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002','admin','active'),
  ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','doctor','active'),
  ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000004','assistant','active'),
  ('34100000-0000-4000-8000-000000000002','34000000-0000-4000-8000-000000000005','doctor','active');
insert into public.platform_admins(user_id,email,role) values ('34000000-0000-4000-8000-000000000006','platform@example.test','support');

select extensions.ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.support_article_categories'::regclass,'public.support_articles'::regclass,'public.support_article_versions'::regclass,
    'public.support_tickets'::regclass,'public.support_ticket_messages'::regclass,'public.support_ticket_events'::regclass,
    'public.support_interaction_metrics'::regclass,'public.support_rate_limit_counters'::regclass
  )), 'RLS is enabled on every support table'
);
select extensions.ok(
  not has_table_privilege('authenticated','public.support_article_categories','insert')
  and not has_table_privilege('authenticated','public.support_articles','insert')
  and not has_table_privilege('authenticated','public.support_article_versions','insert'),
  'authenticated cannot write the canonical knowledge base'
);
select extensions.ok(
  not has_table_privilege('authenticated','public.support_tickets','insert')
  and not has_table_privilege('authenticated','public.support_ticket_messages','insert')
  and not has_table_privilege('authenticated','public.support_ticket_events','insert')
  and not has_table_privilege('authenticated','public.support_interaction_metrics','insert'),
  'authenticated cannot bypass support write RPCs'
);

insert into public.support_article_categories(id,slug,label) values ('34300000-0000-4000-8000-000000000001','citas','Citas');
insert into public.support_articles(id,slug,category_id) values ('34400000-0000-4000-8000-000000000001','crear-una-cita','34300000-0000-4000-8000-000000000001');
insert into public.support_article_versions(id,article_id,version,title,summary,body_markdown,status,content_hash) values
  ('34500000-0000-4000-8000-000000000001','34400000-0000-4000-8000-000000000001',1,'Draft','Draft summary','Draft body','draft',repeat('a',64));
insert into public.support_article_versions(id,article_id,version,title,summary,body_markdown,status,content_hash,reviewed_by,published_at) values
  ('34500000-0000-4000-8000-000000000002','34400000-0000-4000-8000-000000000001',2,'Published','Published summary','Published body','published',repeat('b',64),'34000000-0000-4000-8000-000000000006',now());
select extensions.throws_ok(
  $$update public.support_articles set current_published_version_id='34500000-0000-4000-8000-000000000001' where id='34400000-0000-4000-8000-000000000001'$$,
  '23514','Current support article version must be published and reviewed.','draft article version cannot become current'
);
select extensions.lives_ok(
  $$update public.support_articles set current_published_version_id='34500000-0000-4000-8000-000000000002' where id='34400000-0000-4000-8000-000000000001'$$,
  'reviewed published article version can become current'
);
select extensions.is(
  (select current_published_version_id from public.support_articles where id='34400000-0000-4000-8000-000000000001'),
  '34500000-0000-4000-8000-000000000002'::uuid,'article has exactly one current published version pointer'
);

insert into public.support_tickets(id,reference_code,clinic_id,created_by,category,severity,status,subject,summary) values
  ('34200000-0000-4000-8000-000000000001','AAAABBBBCCCC0001','34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','appointments','normal','open','Doctor A ticket','Operational support only'),
  ('34200000-0000-4000-8000-000000000002','AAAABBBBCCCC0002','34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000004','configuration','low','open','Assistant A ticket','Operational support only'),
  ('34200000-0000-4000-8000-000000000003','AAAABBBBCCCC0003','34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','billing','normal','open','Owner A ticket','Operational support only'),
  ('34200000-0000-4000-8000-000000000004','AAAABBBBCCCC0004','34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002','members','normal','open','Admin A ticket','Operational support only'),
  ('34200000-0000-4000-8000-000000000005','AAAABBBBCCCC0005','34100000-0000-4000-8000-000000000002','34000000-0000-4000-8000-000000000005','appointments','normal','open','Doctor B ticket','Operational support only');

set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000003',true);
select extensions.is((select count(*)::integer from public.support_tickets),1,'doctor reads only own ticket');
select extensions.is((select count(*)::integer from public.support_tickets where clinic_id='34100000-0000-4000-8000-000000000002'),0,'tenant A doctor cannot read tenant B');

select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000004',true);
select extensions.is((select count(*)::integer from public.support_tickets),1,'assistant reads only own ticket');

select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000001',true);
select extensions.is((select count(*)::integer from public.support_tickets),4,'owner reads all clinic tickets only');

select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000002',true);
select extensions.is((select count(*)::integer from public.support_tickets),4,'admin reads all clinic tickets only');

select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000003',true);
select public.add_support_ticket_message_for_current_user('34100000-0000-4000-8000-000000000001','34200000-0000-4000-8000-000000000001','Safe operational message');
reset role;
insert into public.support_ticket_messages(ticket_id,author_user_id,author_kind,visibility,body)
values ('34200000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000006','platform_admin','internal','Internal operational note');
set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000003',true);
select extensions.is((select count(*)::integer from public.support_ticket_messages where ticket_id='34200000-0000-4000-8000-000000000001'),1,'internal messages are never visible to tenant users');
reset role;

select extensions.ok((select bool_and(reference_code ~ '^[0-9A-F]{16}$') from public.support_tickets),'reference codes use non-sequential random shape');
select extensions.throws_ok(
  $$insert into public.support_tickets(reference_code,clinic_id,created_by,category,severity,subject,summary) values ('AAAABBBBCCCC0001','34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','other','normal','Duplicate ref','Safe summary')$$,
  '23505',null,'reference code is unique'
);
select extensions.throws_ok(
  $$insert into public.support_tickets(clinic_id,created_by,category,severity,status,subject,summary) values ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','other','critical','open','Invalid severity','Safe summary')$$,
  '23514',null,'critical and invalid severity are rejected'
);
select extensions.throws_ok(
  $$insert into public.support_tickets(clinic_id,created_by,category,severity,status,subject,summary,resolved_at) values ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','other','normal','unknown','Invalid status','Safe summary',now())$$,
  '23514',null,'invalid ticket states are rejected'
);
select extensions.throws_ok(
  $$insert into public.support_tickets(clinic_id,created_by,category,severity,subject,summary,diagnostic_codes) values ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','other','normal','Invalid code','Safe summary',array['raw error@example.test'])$$,
  '23514',null,'diagnostic codes are constrained'
);
select extensions.throws_ok(
  $$insert into public.support_tickets(clinic_id,created_by,category,severity,subject,summary) values ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000005','other','normal','Cross tenant','Safe summary')$$,
  '23503',null,'ticket creator membership cannot cross tenants'
);

select extensions.lives_ok(
  $$insert into public.support_ticket_events(ticket_id,actor_user_id,event_type,safe_metadata) values ('34200000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','support_diagnostic_executed','{"diagnostic_id":"session_status","diagnostic_code":"session_authenticated"}')$$,
  'allowlisted structured ticket event is accepted'
);
select extensions.throws_ok(
  $$insert into public.support_ticket_events(ticket_id,actor_user_id,event_type,safe_metadata) values ('34200000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','support_diagnostic_executed','{"question":"free text"}')$$,
  '23514',null,'arbitrary ticket event metadata is rejected'
);
select extensions.throws_ok(
  $$insert into public.support_ticket_events(ticket_id,actor_user_id,event_type,from_status,to_status) values ('34200000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','support_ticket_status_changed','open',null)$$,
  '23514',null,'ticket transition event requires complete state integrity'
);
select extensions.ok(
  not exists(select 1 from information_schema.columns where table_schema='public' and table_name='support_interaction_metrics' and column_name in ('question','answer','message','body','subject','summary')),
  'interaction metrics contain no free text conversation columns'
);
select extensions.ok(
  not has_table_privilege('authenticated','public.support_interaction_metrics','select')
  and not has_table_privilege('authenticated','public.support_rate_limit_counters','select'),
  'metrics and rate counters are private internal data'
);
select extensions.ok(
  not has_column_privilege('authenticated','public.support_tickets','assigned_to','select')
  and not has_column_privilege('authenticated','public.support_article_versions','reviewed_by','select')
  and not has_column_privilege('authenticated','public.support_ticket_messages','author_user_id','select')
  and not has_column_privilege('authenticated','public.support_ticket_messages','redacted_by','select')
  and not has_column_privilege('authenticated','public.support_ticket_events','actor_user_id','select'),
  'tenant column grants hide platform and actor identities'
);
select extensions.ok(
  not exists(select 1 from pg_policies where schemaname='public' and tablename in ('support_interaction_metrics','support_rate_limit_counters')),
  'internal metrics and counters fail closed under RLS'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000006',true);
select extensions.is((select count(*)::integer from public.support_tickets),0,'platform admin has no direct client ticket access');
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000004',true);
select extensions.is(
  (select count(*)::integer from generate_series(1,11) where public.consume_support_rate_limit('34100000-0000-4000-8000-000000000001','diagnostic')),
  10,'durable diagnostic rate limit stops after configured allowance'
);
select extensions.is(public.consume_support_rate_limit('34100000-0000-4000-8000-000000000001','arbitrary'),false,'arbitrary rate-limit operation fails closed');

select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000003',true);
select public.create_support_ticket_for_current_user('34100000-0000-4000-8000-000000000001','authentication','access_blocked','Cannot access an operational feature','No clinical information included',array['session_authenticated']);
select extensions.is((select severity from public.support_tickets where subject='Cannot access an operational feature'),'high','ticket severity is calculated server-side from impact');
select extensions.ok((select reference_code ~ '^[0-9A-F]{16}$' from public.support_tickets where subject='Cannot access an operational feature'),'RPC generates non-enumerable reference code');

reset role;
select extensions.throws_ok(
  $$insert into public.support_interaction_metrics(clinic_id,user_id,intent,outcome) values ('34100000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','arbitrary_prompt','resolved')$$,
  '23514',null,'interaction intent is allowlisted'
);
select extensions.throws_ok(
  $$insert into public.support_ticket_messages(ticket_id,author_user_id,author_kind,visibility,body) values ('34200000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','clinic_user','internal','Not allowed')$$,
  '42501','Invalid support ticket clinic actor.','clinic users cannot create internal messages'
);

select * from extensions.finish();
rollback;
