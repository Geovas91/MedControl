-- Catalog-only checks after 0063 on disposable local Supabase.
-- Never execute maintenance operations as security probes.
-- Policy fingerprints preserve the validated 0061/0062 authorization rules.
-- Incremental validation must also compare pre/post CRUD, column ACLs,
-- functions, triggers, constraints and data; this suite never grants CRUD.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select extensions.no_plan();

create temp table maintain_hardening_tables (
  table_name text primary key,
  policy_fingerprint text not null
);
insert into maintain_hardening_tables values
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
  ('medical_note_templates', 'e9d434b2c628c7713af4281d0debda91'),
  ('non_pathological_histories', '39cf0570dee3f70dc05b47ba73d9bf10'),
  ('pathological_histories', '3931fff3871f97a0412a05ba00d86c97'),
  ('patients', '3833ccf00d9e40ecebb0f2a4ad95b2f3'),
  ('payments', '1fdde83c8c434f1ec3e4c60a8a24ab5f'),
  ('platform_admins', 'be0ccf3bc6514f7c06faf269b79e6989'),
  ('professional_availability_exceptions', '7ebdb473bff7af3a5373fe50c991e1f4'),
  ('professional_availability_rules', '96729982bb2cf28b077d6b9ab742f47e'),
  ('profiles', '2bd572c7bb98b1726abaad5b4f466af4'),
  ('specialty_module_fields', 'e2f03df8b08263e220e18221856cf86a'),
  ('specialty_modules', '90b6471c57f97226244d3235a4f9c7f6'),
  ('vital_sign_measurements', '96cf1df83860734ce1e48e864790f06c');

select extensions.is(count(*)::integer, 25, 'exact approved inventory')
from maintain_hardening_tables;

select extensions.is(count(*)::integer, 25, 'all 25 approved public tables exist')
from maintain_hardening_tables t
join pg_class c on c.oid = to_regclass(format('public.%I', t.table_name))
  and c.relkind in ('r', 'p');

-- Missing relations fail regclass resolution instead of passing vacuously.
select extensions.ok(not has_table_privilege(r.role_name,
  format('public.%I', t.table_name), 'MAINTAIN'),
  format('%s has no effective MAINTAIN on public.%s', r.role_name, t.table_name))
from maintain_hardening_tables t
cross join (values ('anon'), ('authenticated')) r(role_name)
order by t.table_name, r.role_name;

select extensions.ok(not exists (
  select 1 from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = format('public.%I', t.table_name)::regclass
    and a.privilege_type = 'MAINTAIN'
    and a.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
), format('public.%s has no direct client or PUBLIC MAINTAIN ACL', t.table_name))
from maintain_hardening_tables t order by t.table_name;

select extensions.ok(not exists (
  select 1 from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = format('public.%I', t.table_name)::regclass
    and a.privilege_type = 'MAINTAIN'
    and a.grantee <> 0
    and a.grantee <> r.role_name::regrole::oid
    and pg_has_role(r.role_name, a.grantee, 'USAGE')
), format('%s has no inherited MAINTAIN on public.%s', r.role_name, t.table_name))
from maintain_hardening_tables t
cross join (values ('anon'), ('authenticated')) r(role_name)
order by t.table_name, r.role_name;

-- Catch effective maintenance access on any public table outside the inventory.
select extensions.is(count(*)::integer, 0,
  'no client effective MAINTAIN remains on any public table')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and (has_table_privilege('anon', c.oid, 'MAINTAIN')
    or has_table_privilege('authenticated', c.oid, 'MAINTAIN'));

select extensions.ok(has_table_privilege('service_role',
  format('public.%I', t.table_name), p.privilege),
  format('service_role retains %s on public.%s', p.privilege, t.table_name))
from maintain_hardening_tables t
-- CRUD varies with the local baseline; verify its preservation by pre/post
-- snapshots rather than granting privileges or assuming universal CRUD.
cross join (values ('MAINTAIN'), ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
order by t.table_name, p.privilege;

select extensions.ok(has_table_privilege(c.relowner, c.oid, p.privilege),
  format('table owner retains %s on public.%s', p.privilege, t.table_name))
from maintain_hardening_tables t
join pg_class c on c.oid = format('public.%I', t.table_name)::regclass
cross join (values ('MAINTAIN'), ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
order by t.table_name, p.privilege;

select extensions.ok(has_table_privilege(d.datdba, c.oid, 'MAINTAIN'),
  format('database owner retains MAINTAIN on public.%s', t.table_name))
from maintain_hardening_tables t
join pg_class c on c.oid = format('public.%I', t.table_name)::regclass
join pg_database d on d.datname = current_database()
order by t.table_name;

select extensions.ok((select rolbypassrls from pg_roles where rolname = 'service_role'),
  'trusted service_role retains existing BYPASSRLS');

-- 0061 covers payments/templates; 0062 covers the other 23 audited tables.
select extensions.ok(not has_table_privilege(r.role_name,
  format('public.%I', t.table_name), p.privilege),
  format('0061/0062 preserved: %s cannot %s public.%s',
    r.role_name, p.privilege, t.table_name))
from maintain_hardening_tables t
cross join (values ('anon'), ('authenticated')) r(role_name)
cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
order by t.table_name, r.role_name, p.privilege;

select extensions.ok(not exists (
  select 1 from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = format('public.%I', t.table_name)::regclass
    and a.grantee = 0 and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
), format('PUBLIC has no 0061/0062 elevated grants on public.%s', t.table_name))
from maintain_hardening_tables t order by t.table_name;

select extensions.ok(c.relrowsecurity and not c.relforcerowsecurity,
  format('public.%s retains enabled RLS and existing FORCE setting', t.table_name))
from maintain_hardening_tables t
join pg_class c on c.oid = format('public.%I', t.table_name)::regclass
order by t.table_name;

select extensions.is(md5(coalesce((
  select jsonb_agg(jsonb_build_object(
    'name', p.polname, 'cmd', p.polcmd, 'permissive', p.polpermissive,
    'roles', (select jsonb_agg(
      case when roleid = 0 then 'PUBLIC' else roleid::regrole::text end
      order by roleid::regrole::text) from unnest(p.polroles) roleid),
    'using', pg_get_expr(p.polqual, p.polrelid),
    'check', pg_get_expr(p.polwithcheck, p.polrelid)
  ) order by p.polname)::text
  from pg_policy p where p.polrelid = format('public.%I', t.table_name)::regclass
), '[]')), t.policy_fingerprint,
  format('public.%s retains exact 0061/0062 policies', t.table_name))
from maintain_hardening_tables t order by t.table_name;

select extensions.is(count(*)::integer, 1, '0061: one payments SELECT/ALL policy')
from pg_policy where polrelid = 'public.payments'::regclass and polcmd in ('r', '*');
select extensions.ok(exists (
  select 1 from pg_policy
  where polrelid = 'public.payments'::regclass
    and polname = 'Owners and admins can read payments'
    and polcmd = 'r' and polroles = array['authenticated'::regrole::oid]
), '0061: owner/admin-only payments SELECT policy preserved');
select extensions.is(count(*)::integer, 0, '0061: no physical DELETE policy on payments')
from pg_policy where polrelid = 'public.payments'::regclass and polcmd in ('d', '*');

select * from extensions.finish();
rollback;
