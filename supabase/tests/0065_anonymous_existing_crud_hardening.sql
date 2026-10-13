-- DESTRUCTIVE FIXTURES, DISPOSABLE LOCAL POSTGRESQL 17 ONLY.
-- Bootstrap an EMPTY database clinicontrol_0065_qa, session qa_0065_admin
-- (local superuser), and postgres/anon/authenticated/service_role plus
-- qa_0065_inherited roles. postgres must be non-superuser and own the database
-- and public schema. Preload the exact migration file into session setting
-- test.migration_0065_sql, then SET ROLE postgres and run this file.
-- This is an audited-ACL fixture suite, NOT the application's real RLS/JWT
-- regression suite. It must never be run against an application database.
begin;
do $local_only$
begin
  if current_database() <> 'clinicontrol_0065_qa'
    or session_user <> 'qa_0065_admin' or current_user <> 'postgres'
    or (select rolsuper from pg_roles where rolname = 'postgres')
    or nullif(current_setting('test.migration_0065_sql', true), '') is null
    or exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f')) then
    raise exception '0065 tests require an empty disposable local database, non-superuser postgres and exact migration source.';
  end if;
end;
$local_only$;
reset role;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema public, extensions to postgres, anon, authenticated, service_role;
grant execute on all functions in schema extensions to postgres, anon, authenticated, service_role;
grant qa_0065_inherited to postgres with admin true, inherit false, set false;
set local role postgres;
set local search_path = public, extensions, pg_temp;
select extensions.no_plan();

create temp table fixture_inventory(name text primary key, baseline_select boolean, baseline_write boolean);
insert into fixture_inventory(name, baseline_select, baseline_write)
select name,
  name = any(array[
    'appointment_invites',
    'clinic_members',
    'clinic_onboarding_acceptances',
    'clinic_subscriptions',
    'clinical_alerts',
    'clinical_history_identification',
    'clinical_records',
    'clinics',
    'doctor_public_profiles',
    'family_medical_histories',
    'initial_clinical_assessments',
    'initial_clinical_histories',
    'non_pathological_histories',
    'pathological_histories',
    'patients',
    'payments',
    'platform_admins',
    'profiles',
    'specialty_module_fields',
    'specialty_modules',
    'vital_sign_measurements'
  ]),
  name = any(array[
    'appointment_invites',
    'clinic_members',
    'clinic_onboarding_acceptances',
    'clinic_subscriptions',
    'clinical_alerts',
    'clinical_change_events',
    'clinical_history_identification',
    'clinical_records',
    'clinics',
    'doctor_public_profiles',
    'family_medical_histories',
    'initial_clinical_assessments',
    'initial_clinical_histories',
    'medical_note_templates',
    'non_pathological_histories',
    'pathological_histories',
    'patients',
    'payments',
    'platform_admins',
    'profiles',
    'specialty_module_fields',
    'specialty_modules',
    'vital_sign_measurements'
  ])
from unnest(array[
    'appointment_automation_jobs',
    'appointment_automation_scheduler_state',
    'appointment_events',
    'appointment_invites',
    'appointments',
    'assistant_pending_actions',
    'audit_logs',
    'bot_logs',
    'bot_settings',
    'calendar_integrations',
    'clinic_member_invitations',
    'clinic_members',
    'clinic_onboarding_acceptances',
    'clinic_subscriptions',
    'clinical_alerts',
    'clinical_change_events',
    'clinical_history_identification',
    'clinical_records',
    'clinics',
    'consent_documents',
    'consent_signatures',
    'consent_signed_snapshots',
    'consents',
    'doctor_public_profiles',
    'doctor_reviews',
    'family_medical_histories',
    'google_calendar_events',
    'google_calendar_oauth_states',
    'initial_clinical_assessments',
    'initial_clinical_histories',
    'medical_note_templates',
    'medical_notes',
    'non_pathological_histories',
    'pathological_histories',
    'patient_communication_preferences',
    'patient_professional_assignments',
    'patients',
    'payments',
    'paypal_billing_intents',
    'paypal_webhook_events',
    'platform_admins',
    'professional_availability_exceptions',
    'professional_availability_rules',
    'profiles',
    'review_invitations',
    'specialty_module_fields',
    'specialty_modules',
    'support_article_categories',
    'support_article_versions',
    'support_articles',
    'support_interaction_metrics',
    'support_rate_limit_counters',
    'support_ticket_events',
    'support_ticket_messages',
    'support_tickets',
    'vital_sign_measurements',
    'whatsapp_integrations',
    'whatsapp_message_deliveries',
    'whatsapp_provider_accounts',
    'whatsapp_templates'
]) names(name);

-- Reproduce the approved matrix only in brand-new synthetic tables, never
-- "prepare" hosted ACLs or grant privileges on existing application tables.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
do $fixture$
declare t record;
begin
  for t in select * from fixture_inventory order by name loop
    execute format('create table public.%I(id integer primary key, clinic_id integer, professional text, is_published boolean default false, label text)', t.name);
    execute format('alter table public.%I enable row level security', t.name);
    execute format('revoke select, insert, update, delete on public.%I from anon', t.name);
    if t.baseline_select then execute format('grant select on public.%I to anon', t.name); end if;
    if t.baseline_write then execute format('grant insert, update, delete on public.%I to anon', t.name); end if;
  end loop;
end;
$fixture$;
-- Vary authenticated ACLs deliberately; preservation must compare snapshots,
-- not assume universal authenticated CRUD.
revoke all privileges on public.appointment_invites, public.review_invitations from authenticated;
revoke insert, update, delete on public.appointments, public.assistant_pending_actions from authenticated;
grant select(id) on public.medical_note_templates to authenticated;
create policy fixture_patient_scope on public.patients for select to authenticated
  using (clinic_id = nullif(current_setting('test.clinic', true), '')::integer
    and (current_setting('test.role', true) in ('owner', 'admin', 'assistant')
      or professional = current_setting('test.professional', true)));
create policy fixture_published on public.doctor_public_profiles for select to anon
  using (is_published);
create policy fixture_readiness on public.clinics for select to anon using (false);
create policy fixture_financial on public.payments for select to authenticated
  using (clinic_id = nullif(current_setting('test.clinic', true), '')::integer
    and current_setting('test.role', true) in ('owner', 'admin'));
insert into public.patients values
  (1,1,'doctor1',false,'Synthetic A'), (2,1,'doctor2',false,'Synthetic B'), (3,2,'doctor1',false,'Synthetic C');
insert into public.doctor_public_profiles values
  (1,1,'doctor1',true,'Public synthetic'), (2,1,'doctor2',false,'Private synthetic');
insert into public.payments values (1,1,'doctor1',false,'Synthetic payment'), (2,2,'doctor1',false,'Synthetic payment');
insert into public.clinics values (1,1,null,false,'Synthetic clinic');
alter table public.clinical_records add constraint fixture_patient_fk foreign key(id) references public.patients(id);
create function public.qa_0065_noop() returns trigger language plpgsql as $fn$
begin return new; end;
$fn$;
create trigger fixture_noop before insert on public.clinical_records for each row execute function public.qa_0065_noop();

create function public.qa_0065_apply() returns void
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $fn$
declare source text := current_setting('test.migration_0065_sql');
begin
  source := regexp_replace(source, '^begin;[[:space:]]*', '', 'n');
  source := regexp_replace(source, '^commit;[[:space:]]*$', '', 'n');
  execute source;
end;
$fn$;
create function public.qa_0065_probe(kind text) returns void
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $fn$
begin
  case kind
    when 'missing' then revoke select on public.patients from anon;
    when 'additional' then grant select on public.appointments to anon;
    when 'public' then grant select on public.appointments to public;
    when 'column' then grant select(id) on public.appointments to anon;
    when 'grant_option' then grant select on public.patients to anon with grant option;
    when 'partial' then revoke insert on public.patients from anon;
    when 'inventory' then create table public.qa_unexpected(id integer);
    when 'rls' then alter table public.patients disable row level security;
    when 'membership' then grant qa_0065_inherited to anon;
    when 'retained_missing' then revoke select on public.clinics from anon;
    else raise exception 'Unknown local probe.';
  end case;
  perform public.qa_0065_apply();
end;
$fn$;
create function public.qa_0065_snapshot() returns jsonb
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $fn$
declare rows_by_table jsonb := '{}'::jsonb; relation record; rows_json jsonb;
begin
  for relation in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p') order by c.relname loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by id), ''[]''::jsonb) from public.%I t', relation.relname) into rows_json;
    rows_by_table := rows_by_table || jsonb_build_object(relation.relname, rows_json);
  end loop;
  return jsonb_build_object(
    'tables', (select jsonb_agg(jsonb_build_array(oid,relname,relowner,relrowsecurity,relforcerowsecurity) order by oid) from pg_class where relnamespace='public'::regnamespace),
    'columns', (select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace),
    'policies', (select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p),
    'functions', (select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where pronamespace='public'::regnamespace),
    'triggers', (select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace),
    'constraints', (select jsonb_agg(to_jsonb(k) order by oid) from pg_constraint k where connamespace='public'::regnamespace),
    'defaults', (select jsonb_agg(to_jsonb(d) order by oid) from pg_default_acl d),
    'roles', (select jsonb_agg(to_jsonb(r) order by oid) from pg_roles r),
    'memberships', (select jsonb_agg(to_jsonb(m) order by roleid,member) from pg_auth_members m),
    'schemas', (select jsonb_agg(to_jsonb(n) order by oid) from pg_namespace n
      where nspname not like 'pg_temp_%' and nspname not like 'pg_toast_temp_%'),
    'data', rows_by_table
  );
end;
$fn$;

-- Force a failure AFTER REVOKEs through a disposable event trigger. The
-- real migration must roll back both its ACL changes and this injected DDL.
reset role;
create function public.qa_0065_inject_failure() returns event_trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$
begin
  if current_setting('test.migration_0065_fault', true) = 'on' and tg_tag = 'REVOKE' then
    alter table public.patients disable row level security;
  end if;
end;
$fn$;
create event trigger qa_0065_late_failure on ddl_command_end
  when tag in ('REVOKE') execute function public.qa_0065_inject_failure();
set local role postgres;

create temp table acl_before as
select c.relname,a.* from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
where c.relnamespace='public'::regnamespace and c.relkind='r';
create temp table snapshot_before as select public.qa_0065_snapshot() value;
select extensions.is((select count(*)::integer from fixture_inventory),60,'complete approved inventory');
select extensions.is((select count(*)::integer from acl_before where grantee='anon'::regrole),90,'exact initial anon grants');
select extensions.ok(not (select rolsuper from pg_roles where rolname='postgres'),'effective postgres is not superuser');

select extensions.throws_ok(format('select public.qa_0065_probe(%L)',kind),code,message,
  'rejects ' || kind || ' drift')
from (values
  ('missing','55000','0065 found unexpected anonymous CRUD grant matrix.'),
  ('additional','55000','0065 found unexpected anonymous CRUD grant matrix.'),
  ('public','55000','0065 found unexpected anonymous privilege paths.'),
  ('column','55000','0065 found unexpected anonymous privilege paths.'),
  ('grant_option','55000','0065 found unexpected anonymous privilege paths.'),
  ('partial','55000','0065 found unexpected anonymous CRUD grant matrix.'),
  ('inventory','55000','0065 found unexpected public table inventory.'),
  ('rls','55000','0065 found unexpected public table inventory.'),
  ('membership','55000','0065 found unexpected anonymous role access.')
) probes(kind,code,message);

set local role anon;
select extensions.throws_ok('select public.qa_0065_apply()','42501','0065 requires effective role postgres.',
  'unauthorized effective role rejected before mutation');
reset role;
set local role postgres;
select extensions.is(public.qa_0065_snapshot(),(select value from snapshot_before),
  'rejected probes preserve every snapshot field');
select extensions.ok(not exists (
  (select c.relname,a.* from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.relnamespace='public'::regnamespace and c.relkind='r' except select * from acl_before)
  union all
  (select * from acl_before except select c.relname,a.* from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.relnamespace='public'::regnamespace and c.relkind='r')
),'rejected probes preserve complete table ACLs');

select set_config('test.migration_0065_fault','on',true);
select extensions.throws_ok('select public.qa_0065_apply()','55000',
  '0065 changed an object outside the approved anonymous CRUD scope.','late failure rejects the entire transaction body');
select set_config('test.migration_0065_fault','off',true);
select extensions.is(public.qa_0065_snapshot(),(select value from snapshot_before),'late failure rolls back injected DDL');
select extensions.is((select count(*)::integer from pg_class c cross join lateral aclexplode(c.relacl) a
  where c.relnamespace='public'::regnamespace and c.relkind='r' and a.grantee='anon'::regrole),90,
  'late failure restores all 90 initial grants');

select public.qa_0065_apply();
create temp table acl_after as
select c.relname,a.* from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
where c.relnamespace='public'::regnamespace and c.relkind='r';
create temp table removed as select * from acl_before except select * from acl_after;
select extensions.is((select count(*)::integer from removed),88,'exactly 88 grants removed');
select extensions.ok(not exists (select 1 from removed where grantee<>'anon'::regrole
  or privilege_type not in ('SELECT','INSERT','UPDATE','DELETE') or is_grantable),
  'only approved anonymous CRUD grants removed');
select extensions.is((select count(*)::integer from (select * from acl_after except select * from acl_before) added),0,'no additional grants');
select extensions.ok(not exists (
  (select * from acl_before where grantee<>'anon'::regrole except select * from acl_after where grantee<>'anon'::regrole)
  union all
  (select * from acl_after where grantee<>'anon'::regrole except select * from acl_before where grantee<>'anon'::regrole)
),'every other grantee including PUBLIC is preserved');
select extensions.is((select count(*)::integer from acl_after where grantee='anon'::regrole),2,'two direct grants remain');
select extensions.ok(has_table_privilege('anon','public.'||t.name,p.name) =
  (p.name='SELECT' and t.name in ('clinics','doctor_public_profiles')), t.name || ': ' || p.name)
from fixture_inventory t cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(name)
order by t.name,p.name;

select extensions.ok(not exists (
  (select * from acl_before where grantee=r.name::regrole except select * from acl_after where grantee=r.name::regrole)
  union all
  (select * from acl_after where grantee=r.name::regrole except select * from acl_before where grantee=r.name::regrole)
),'all ACLs for ' || r.name || ' preserved')
from (values('authenticated'),('service_role'),('postgres')) r(name);
select extensions.is(public.qa_0065_snapshot()->k.name,(select value->k.name from snapshot_before),
  k.name || ' unchanged')
from (values('tables'),('columns'),('policies'),('functions'),('triggers'),('constraints'),
  ('defaults'),('roles'),('memberships'),('schemas'),('data')) k(name);
select extensions.ok(not exists (
  select 1 from pg_roles r where r.oid<>'anon'::regrole
    and (pg_has_role('anon',r.oid,'USAGE') or pg_has_role('anon',r.oid,'SET'))
),'no anonymous inherited or SET ROLE path');
select extensions.ok(not exists (
  select 1 from removed join fixture_inventory t on t.name=removed.relname where not t.baseline_write
),'unrelated tables unchanged');

-- Runtime permission probes on synthetic fixtures only. These do not claim
-- coverage of production application policies, JWT validation or PostgREST.
set local role anon;
select extensions.throws_ok('select * from public.patients','42501',null::text,'anonymous patient SELECT denied');
select extensions.throws_ok('select * from public.clinical_records','42501',null::text,'anonymous clinical SELECT denied');
select extensions.throws_ok('select * from public.payments','42501',null::text,'anonymous payment SELECT denied');
select extensions.throws_ok('insert into public.patients(id) values(99)','42501',null::text,'anonymous INSERT denied');
select extensions.throws_ok('update public.patients set label=''synthetic''','42501',null::text,'anonymous UPDATE denied');
select extensions.throws_ok('delete from public.patients','42501',null::text,'anonymous DELETE denied');
select extensions.is((select count(*)::integer from public.doctor_public_profiles),1,'published directory accessible');
select extensions.is((select count(*)::integer from public.clinics),0,'readiness empty query remains authorized');
reset role;
set local role authenticated;
select set_config('test.clinic','1',true);
select set_config('test.professional','doctor1',true);
select set_config('test.role','owner',true);
select extensions.is((select count(*)::integer from public.patients),2,'synthetic owner tenant scope preserved');
select set_config('test.role','admin',true);
select extensions.is((select count(*)::integer from public.patients),2,'synthetic admin tenant scope preserved');
select set_config('test.role','doctor',true);
select extensions.is((select count(*)::integer from public.patients),1,'synthetic doctor professional scope preserved');
select set_config('test.role','assistant',true);
select extensions.is((select count(*)::integer from public.patients),2,'synthetic assistant tenant scope preserved');
select extensions.is((select count(*)::integer from public.patients where clinic_id=2),0,'synthetic cross-tenant rows invisible');
reset role;
set local role postgres;

create temp table snapshot_after as select public.qa_0065_snapshot() value;
select public.qa_0065_apply();
select extensions.is(public.qa_0065_snapshot(),(select value from snapshot_after),'exact completed replay is a no-op');
select extensions.ok(not exists (
  (select c.relname,a.* from pg_class c cross join lateral aclexplode(c.relacl) a where c.relnamespace='public'::regnamespace and c.relkind='r' except select * from acl_after)
  union all
  (select * from acl_after except select c.relname,a.* from pg_class c cross join lateral aclexplode(c.relacl) a where c.relnamespace='public'::regnamespace and c.relkind='r')
),'replay table ACLs unchanged');
select extensions.throws_ok('select public.qa_0065_probe(''retained_missing'')','55000',
  '0065 found unexpected anonymous CRUD grant matrix.','replay does not conceal missing required SELECT');
select extensions.throws_ok('select public.qa_0065_probe(''additional'')','55000',
  '0065 found unexpected anonymous CRUD grant matrix.','replay does not conceal reintroduced private grant');

select * from extensions.finish();
rollback;
