-- Future public relations created by postgres only. Existing objects, CRUD,
-- service_role and all other creators/schemas/object types remain unchanged.
-- supabase_admin defaults require a separate platform-authorized operation.
begin;

do $guard$
begin
  -- A temporary CLI session_user or a superuser is not the intended creator.
  -- The caller must already have legitimately selected effective role postgres.
  if current_user <> 'postgres' then
    raise exception using errcode = '42501',
      message = '0064 requires effective role postgres.';
  end if;

  if current_setting('server_version_num')::integer < 170000 then
    raise exception using errcode = '55000',
      message = '0064 requires PostgreSQL 17 or newer.';
  end if;

  -- Per-schema REVOKE cannot cancel global grants. Include the built-in owner
  -- ACL when no global entry exists, and detect inherited/SET ROLE access too.
  if exists (
    select 1
    from aclexplode(coalesce((
      select d.defaclacl from pg_default_acl d
      where d.defaclrole = 'postgres'::regrole
        and d.defaclnamespace = 0 and d.defaclobjtype = 'r'
    ), acldefault('r', 'postgres'::regrole))) a
    where a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')
      and case when a.grantee = 0 then true else
        pg_has_role('anon', a.grantee, 'USAGE')
        or pg_has_role('authenticated', a.grantee, 'USAGE')
        or pg_has_role('anon', a.grantee, 'SET')
        or pg_has_role('authenticated', a.grantee, 'SET') end
  ) then
    raise exception using errcode = '55000',
      message = '0064 found conflicting global default table privileges.';
  end if;

  -- Revoking from the three approved grantees cannot remove grants to another
  -- role reachable by a client. Do not silently leave such a path in place.
  if exists (
    select 1 from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
      and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')
      and a.grantee not in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
      and (pg_has_role('anon', a.grantee, 'USAGE')
        or pg_has_role('authenticated', a.grantee, 'USAGE')
        or pg_has_role('anon', a.grantee, 'SET')
        or pg_has_role('authenticated', a.grantee, 'SET'))
  ) then
    raise exception using errcode = '55000',
      message = '0064 found inherited public default table privileges.';
  end if;
end;
$guard$;

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references, maintain
  on tables from public, anon, authenticated;

commit;
