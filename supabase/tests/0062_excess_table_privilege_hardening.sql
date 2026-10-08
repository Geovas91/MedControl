-- Catalog-only security assertions: never execute TRUNCATE or client DDL.
-- Run on disposable local Supabase after 0062. All test objects roll back.
-- Policy fingerprints describe the validated 0001-0061 authorization rules,
-- independent of environment-specific CRUD grants. For incremental migration
-- validation also compare complete pre/post ACL, policy, FK and data snapshots.
begin;
create extension if not exists pgtap with schema extensions;
-- Keep pg_get_expr qualification independent of the executing role's defaults.
set local search_path = public, extensions, pg_temp;
select extensions.no_plan();

create temp table privilege_hardening_tables (
  table_name text primary key,
  policy_fingerprint text not null
);
insert into privilege_hardening_tables values
  ('appointment_invites', '0c068d67bcb59f1e9e9c56a826a50f38'),
  ('clinic_members', 'ef885bf78ea9d9c0835dc8b93ef1795e'),
  ('clinic_onboarding_acceptances', 'd751713988987e9331980363e24189ce'),
  ('clinic_subscriptions', '22eb43004350907be58ed457c3fdda70'),
  ('clinical_alerts', '84090928755962cb4f9305b0deb2623f'),
  ('clinical_change_events', 'd751713988987e9331980363e24189ce'),
  ('clinical_history_identification', 'c3bca74e0f37d3969986126353d294d5'),
  ('clinical_records', '4f6443caa20e1b42afd750c539ee1d64'),
  ('clinics', '81f7d0c33a10e34f2fd54c578648d33e'),
  ('doctor_public_profiles', '9c2ad0f3cf2aeba864b515051c56e88e'),
  ('family_medical_histories', '91f29da40c66cc554d80455f4be50521'),
  ('initial_clinical_assessments', '1096f1029bd69b0f5376c5e96f745f12'),
  ('initial_clinical_histories', 'e8bb43ab2e06a0c0d7143be289fc6601'),
  ('non_pathological_histories', '39cf0570dee3f70dc05b47ba73d9bf10'),
  ('pathological_histories', '3931fff3871f97a0412a05ba00d86c97'),
  ('patients', '3833ccf00d9e40ecebb0f2a4ad95b2f3'),
  ('platform_admins', 'be0ccf3bc6514f7c06faf269b79e6989'),
  ('professional_availability_exceptions', '7ebdb473bff7af3a5373fe50c991e1f4'),
  ('professional_availability_rules', '96729982bb2cf28b077d6b9ab742f47e'),
  ('profiles', '2bd572c7bb98b1726abaad5b4f466af4'),
  ('specialty_module_fields', 'e2f03df8b08263e220e18221856cf86a'),
  ('specialty_modules', '90b6471c57f97226244d3235a4f9c7f6'),
  ('vital_sign_measurements', '96cf1df83860734ce1e48e864790f06c');

select extensions.is(count(*)::integer, 23, 'exact approved table inventory')
from privilege_hardening_tables;

-- An absent table fails by regclass resolution, rather than passing vacuously.
select extensions.ok(
  not has_table_privilege(r.role_name, format('public.%I', t.table_name), p.privilege),
  format('%s cannot %s public.%s (direct, PUBLIC or inherited)',
    r.role_name, p.privilege, t.table_name)
)
from privilege_hardening_tables t
cross join (values ('anon'), ('authenticated')) r(role_name)
cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
order by t.table_name, r.role_name, p.privilege;

-- PUBLIC is a pseudo-role, not a role accepted by has_table_privilege().
-- Inspect its ACL explicitly; effective role checks above cover inheritance.
select extensions.ok(not exists (
  select 1
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = format('public.%I', t.table_name)::regclass
    and a.grantee = 0 and a.privilege_type = p.privilege
), format('PUBLIC has no %s on public.%s', p.privilege, t.table_name))
from privilege_hardening_tables t
cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
order by t.table_name, p.privilege;

select extensions.ok(c.relrowsecurity and not c.relforcerowsecurity,
  format('public.%s retains enabled RLS and its existing FORCE setting', t.table_name))
from privilege_hardening_tables t
join pg_class c on c.oid = format('public.%I', t.table_name)::regclass
order by t.table_name;

select extensions.is(md5(coalesce((
  select jsonb_agg(jsonb_build_object(
    'name', p.polname,
    'cmd', p.polcmd,
    'permissive', p.polpermissive,
    'roles', (select jsonb_agg(
      case when roleid = 0 then 'PUBLIC' else roleid::regrole::text end
      order by roleid::regrole::text) from unnest(p.polroles) roleid),
    'using', pg_get_expr(p.polqual, p.polrelid),
    'check', pg_get_expr(p.polwithcheck, p.polrelid)
  ) order by p.polname)::text
  from pg_policy p where p.polrelid = format('public.%I', t.table_name)::regclass
), '[]')), t.policy_fingerprint,
  format('public.%s retains exact 0061 policies, roles and predicates', t.table_name))
from privilege_hardening_tables t order by t.table_name;

select extensions.ok(has_table_privilege('service_role',
  format('public.%I', t.table_name), p.privilege),
  format('service_role retains %s on public.%s', p.privilege, t.table_name))
from privilege_hardening_tables t
cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
order by t.table_name, p.privilege;

select extensions.ok(has_table_privilege(c.relowner,
  c.oid, p.privilege),
  format('database owner retains %s on public.%s', p.privilege, t.table_name))
from privilege_hardening_tables t
join pg_class c on c.oid = format('public.%I', t.table_name)::regclass
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
order by t.table_name, p.privilege;

select extensions.ok((select rolbypassrls from pg_roles where rolname = 'service_role'),
  'trusted service_role retains its existing BYPASSRLS capability');

-- Environment-independent explicit application grants from historical migrations.
-- Do not grant missing CRUD privileges here to disguise a local reset discrepancy.
select extensions.ok(has_table_privilege('authenticated',
  format('public.%I', t.table_name), p.privilege),
  format('explicit authenticated %s on public.%s retained', p.privilege, t.table_name))
from (values ('clinical_alerts'), ('clinical_history_identification'),
  ('clinical_records'), ('family_medical_histories'),
  ('initial_clinical_assessments'), ('initial_clinical_histories'),
  ('non_pathological_histories'), ('pathological_histories'),
  ('vital_sign_measurements')) t(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE')) p(privilege)
order by t.table_name, p.privilege;

-- 0061 containment stays in force; 0062 does not touch these two tables.
select extensions.ok(not has_table_privilege(r.role_name,
  format('public.%I', t.table_name), p.privilege),
  format('0061 preserved: %s cannot %s public.%s',
    r.role_name, p.privilege, t.table_name))
from (values ('payments'), ('medical_note_templates')) t(table_name)
cross join (values ('anon'), ('authenticated')) r(role_name)
cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
order by t.table_name, r.role_name, p.privilege;

select * from extensions.finish();
rollback;
