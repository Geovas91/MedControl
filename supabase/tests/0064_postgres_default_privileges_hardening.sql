-- Disposable LOCAL database only; never run this fixture setup on staging.
-- The harness must set test.migration_0064_sql to the exact migration file
-- contents in this session before running this suite. The real body is replayed
-- inside subtransactions; only its outer BEGIN/COMMIT markers are removed.
-- Also apply the unmodified transactional migration separately in that database.
-- No role changes, membership grants, maintenance or destructive DDL probes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select extensions.no_plan();

do $setup$
begin
  if current_user <> 'postgres'
    or current_database() <> 'clinicontrol_0064_qa'
    or nullif(current_setting('test.migration_0064_sql', true), '') is null then
    raise exception '0064 tests require postgres, the disposable clinicontrol_0064_qa database and exact migration source.';
  end if;
end;
$setup$;

-- Reproduce the audited staging TABLE defaults only. Do not add CRUD grants
-- to existing application tables to disguise local baseline discrepancies.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete, truncate, trigger, references, maintain
  on tables to postgres, anon, authenticated, service_role;

create function public.qa_0064_apply() returns void
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $fn$
declare migration_sql text := current_setting('test.migration_0064_sql');
begin
  migration_sql := regexp_replace(migration_sql, '^begin;[[:space:]]*', '', 'n');
  migration_sql := regexp_replace(migration_sql, '^commit;[[:space:]]*$', '', 'n');
  execute migration_sql;
end;
$fn$;

create function public.qa_0064_global_probe(grantee_name text, privilege_name text) returns void
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $fn$
begin
  execute 'alter default privileges for role postgres grant ' || privilege_name || ' on tables to '
    || case when grantee_name = 'PUBLIC' then 'PUBLIC' else quote_ident(grantee_name) end;
  perform public.qa_0064_apply();
end;
$fn$;

create function public.qa_0064_snapshot() returns jsonb
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $fn$
declare counts jsonb := '{}'::jsonb; relation record; row_count bigint;
begin
  for relation in select c.oid, c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    order by c.relname loop
    execute format('select count(*) from public.%I', relation.relname) into row_count;
    counts := counts || jsonb_build_object(relation.relname, row_count);
  end loop;
  return jsonb_build_object(
    'tables', (select jsonb_agg(jsonb_build_array(c.oid, c.relname, c.relowner,
      c.relacl, c.relrowsecurity, c.relforcerowsecurity) order by c.oid)
      from pg_class c where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p')),
    'columns', (select jsonb_agg(to_jsonb(a) order by a.attrelid, a.attnum)
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace),
    'policies', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p
      join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace),
    'constraints', (select jsonb_agg(to_jsonb(k) order by k.oid) from pg_constraint k
      where k.connamespace = 'public'::regnamespace),
    'triggers', (select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t
      join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace),
    'functions', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p
      where p.pronamespace = 'public'::regnamespace),
    'schemas', (select jsonb_agg(jsonb_build_array(n.oid, n.nspowner, n.nspacl)
      order by n.oid) from pg_namespace n where n.nspname not like 'pg_temp_%'
        and n.nspname not like 'pg_toast_temp_%'),
    'roles', (select jsonb_agg(to_jsonb(r) order by r.oid) from pg_roles r),
    'memberships', (select jsonb_agg(to_jsonb(m) order by m.roleid, m.member)
      from pg_auth_members m),
    'counts', counts,
    'synthetic_data', (select jsonb_agg(to_jsonb(t) order by t.id)
      from public.qa_0064_existing_child t)
  );
end;
$fn$;

-- Synthetic existing objects exercise columns, RLS, FK, triggers and row
-- preservation without touching business rows or calling providers.
create table public.qa_0064_existing_parent(id integer primary key);
create table public.qa_0064_existing_child(
  id integer primary key references public.qa_0064_existing_parent(id),
  label text not null
);
alter table public.qa_0064_existing_child enable row level security;
create policy synthetic_read on public.qa_0064_existing_child
  for select to authenticated using (id > 0);
grant select(label) on public.qa_0064_existing_child to authenticated;
create function public.qa_0064_noop_trigger() returns trigger
language plpgsql as $fn$ begin return new; end; $fn$;
create trigger synthetic_trigger before insert on public.qa_0064_existing_child
  for each row execute function public.qa_0064_noop_trigger();
insert into public.qa_0064_existing_parent values (1);
insert into public.qa_0064_existing_child values (1, 'synthetic');
create table public.qa_0064_future_before(id integer);

select extensions.is(current_user::text, 'postgres', 'actual creator is postgres');
select extensions.ok(not (select rolsuper from pg_roles where rolname = 'postgres'),
  'positive execution uses non-superuser postgres, matching hosted authority');
select extensions.ok(current_setting('server_version_num')::integer >= 170000,
  'PostgreSQL supports MAINTAIN');
select extensions.is((select count(*)::integer from pg_default_acl
  where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'r'),
  0, 'baseline has no explicit global postgres table defaults');
select extensions.is((select relowner from pg_class
  where oid = 'public.qa_0064_future_before'::regclass), 'postgres'::regrole::oid,
  'before table was created as postgres, without ALTER OWNER');
select extensions.ok(has_table_privilege(r.name, 'public.qa_0064_future_before', p.name),
  format('before: %s receives %s from real defaults', r.name, p.name))
from (values ('anon'), ('authenticated')) r(name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(name);

create temp table defaults_before as select * from pg_default_acl;
create temp table existing_before as select public.qa_0064_snapshot() snapshot;

-- throws_ok rolls back each attempted global grant with the failing statement.
select extensions.throws_ok(format('select public.qa_0064_global_probe(%L, %L)', r.name, p.name),
  '55000', '0064 found conflicting global default table privileges.',
  format('global %s for %s fails closed', p.name, r.name))
from (values ('PUBLIC'), ('anon'), ('authenticated')) r(name)
cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(name);

set local role anon;
select extensions.throws_ok('select public.qa_0064_apply()', '42501',
  '0064 requires effective role postgres.', 'unexpected effective role fails before mutation');
reset role;

select extensions.is((select jsonb_agg(to_jsonb(d) order by d.oid) from pg_default_acl d),
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_before d),
  'all failed attempts leave default ACLs unchanged');

select public.qa_0064_apply();
create temp table defaults_after as select * from pg_default_acl;
create temp table existing_after as select public.qa_0064_snapshot() snapshot;

select extensions.is(a.snapshot -> k.name, b.snapshot -> k.name,
  format('existing %s unchanged by migration', k.name))
from existing_before b cross join existing_after a
cross join (values ('tables'), ('columns'), ('policies'), ('constraints'),
  ('triggers'), ('functions'), ('schemas'), ('roles'), ('memberships'),
  ('counts'), ('synthetic_data')) k(name);

create temp table removed_grants as
select d.defaclrole, d.defaclnamespace, d.defaclobjtype, a.*
from defaults_before d cross join lateral aclexplode(d.defaclacl) a
except
select d.defaclrole, d.defaclnamespace, d.defaclobjtype, a.*
from defaults_after d cross join lateral aclexplode(d.defaclacl) a;
select extensions.is((select count(*)::integer from removed_grants), 8,
  'exactly eight explicit elevated client default grants removed');
select extensions.ok(not exists (
  select 1 from removed_grants where defaclrole <> 'postgres'::regrole
    or defaclnamespace <> 'public'::regnamespace or defaclobjtype <> 'r'
    or grantee not in ('anon'::regrole::oid, 'authenticated'::regrole::oid)
    or privilege_type not in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')
    or grantor <> 'postgres'::regrole or is_grantable
), 'removed grants match the approved creator/schema/type/grantees/privileges');
select extensions.is((select count(*)::integer from (
  select d.defaclrole, d.defaclnamespace, d.defaclobjtype, a.*
  from defaults_after d cross join lateral aclexplode(d.defaclacl) a
  except
  select d.defaclrole, d.defaclnamespace, d.defaclobjtype, a.*
  from defaults_before d cross join lateral aclexplode(d.defaclacl) a
) added), 0, 'no default privilege or grant option added');

select extensions.is(
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_after d
    where not (defaclrole = 'postgres'::regrole
      and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r')),
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_before d
    where not (defaclrole = 'postgres'::regrole
      and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r')),
  'every other creator/schema/object-type default ACL is identical');
select extensions.is(
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_after d
    where defaclrole = 'supabase_admin'::regrole),
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_before d
    where defaclrole = 'supabase_admin'::regrole),
  'supabase_admin defaults remain unchanged and unresolved');
select extensions.is(
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_after d
    where defaclnamespace = n.oid),
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_before d
    where defaclnamespace = n.oid), format('%s defaults unchanged', n.nspname))
from pg_namespace n where n.nspname in
  ('auth', 'storage', 'realtime', 'graphql', 'graphql_public', 'extensions');
select extensions.is(
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_after d
    where defaclobjtype = t.kind),
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_before d
    where defaclobjtype = t.kind), format('object type %s defaults unchanged', t.kind))
from (values ('S'::"char"), ('f'::"char"), ('T'::"char"), ('n'::"char")) t(kind);

create table public.qa_0064_future_after(id integer);
select extensions.is((select relowner from pg_class
  where oid = 'public.qa_0064_future_after'::regclass), 'postgres'::regrole::oid,
  'after table was created as postgres, without ALTER OWNER');
select extensions.ok(has_table_privilege(r.name, 'public.qa_0064_future_after', p.name)
  = p.allowed, format('after: %s %s allowed=%s', r.name, p.name, p.allowed))
from (values ('anon'), ('authenticated')) r(name)
cross join (values ('SELECT', true), ('INSERT', true), ('UPDATE', true), ('DELETE', true),
  ('TRUNCATE', false), ('TRIGGER', false), ('REFERENCES', false), ('MAINTAIN', false)) p(name, allowed);
select extensions.ok(not exists (
  select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
  where c.oid = 'public.qa_0064_future_after'::regclass
    and a.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
    and a.privilege_type = p.name
), format('no direct client/PUBLIC %s grant', p.name))
from (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(name);
select extensions.ok(not exists (
  select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
  where c.oid = 'public.qa_0064_future_after'::regclass and a.grantee <> 0
    and a.grantee <> r.name::regrole::oid and a.privilege_type = p.name
    and (pg_has_role(r.name, a.grantee, 'USAGE') or pg_has_role(r.name, a.grantee, 'SET'))
), format('no inherited/SET ROLE %s for %s', p.name, r.name))
from (values ('anon'), ('authenticated')) r(name)
cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(name);
select extensions.ok(has_table_privilege(r.name, 'public.qa_0064_future_after', p.name),
  format('%s retains %s on the new table', r.name, p.name))
from (values ('postgres'), ('service_role')) r(name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(name);
select extensions.ok(has_table_privilege('anon', 'public.qa_0064_future_before', 'TRUNCATE'),
  'pre-existing table privileges are not retroactively changed');

select public.qa_0064_apply();
select extensions.is((select jsonb_agg(to_jsonb(d) order by d.oid) from pg_default_acl d),
  (select jsonb_agg(to_jsonb(d) order by d.oid) from defaults_after d),
  'replaying the real migration body is idempotent');
create table public.qa_0064_future_replay(id integer);
select extensions.ok(not has_table_privilege(r.name, 'public.qa_0064_future_replay', p.name),
  format('after replay: %s still denied %s', r.name, p.name))
from (values ('anon'), ('authenticated')) r(name)
cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(name);

select * from extensions.finish();
rollback;
