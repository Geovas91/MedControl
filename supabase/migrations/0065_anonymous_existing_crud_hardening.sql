-- A1 only: 88 existing anon CRUD grants removed; retain the two public SELECTs.
-- Readiness still reads clinics anonymously. Directory still reads published
-- doctor_public_profiles. RLS, RPCs, PUBLIC ACLs and defaults are not changed.
-- Accept only the exact audited baseline or the exact completed result.
begin;

do $hardening$
declare
  inventory constant text[] := array[
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
  ];
  granted_tables constant text[] := array[
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
  ];
  retained_selects constant text[] := array['clinics', 'doctor_public_profiles'];
  non_select_tables constant text[] := array['clinical_change_events', 'medical_note_templates'];
  baseline_matrix jsonb;
  hardened_matrix jsonb;
  actual_matrix jsonb;
  other_acl_before jsonb;
  immutable_before jsonb;
  other_acl_after jsonb;
  immutable_after jsonb;
  relation_name text;
begin
  if current_user <> 'postgres' then
    raise exception using errcode = '42501', message = '0065 requires effective role postgres.';
  end if;
  if current_setting('server_version_num')::integer < 170000 then
    raise exception using errcode = '55000', message = '0065 requires PostgreSQL 17 or newer.';
  end if;

  if (select coalesce(array_agg(c.relname::text order by c.relname::text collate "C"), array[]::text[])
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')) <> inventory
    or exists (
      select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any(inventory)
        and (c.relkind <> 'r' or c.relowner <> 'postgres'::regrole
          or not c.relrowsecurity or c.relforcerowsecurity)
    ) then
    raise exception using errcode = '55000', message = '0065 found unexpected public table inventory.';
  end if;

  if not has_schema_privilege('anon', 'public', 'USAGE')
    or has_schema_privilege('anon', 'public', 'CREATE')
    or exists (select 1 from pg_catalog.pg_roles
      where rolname = 'anon' and (rolsuper or rolbypassrls or rolcanlogin))
    or exists (select 1 from pg_catalog.pg_roles r
      where r.oid <> 'anon'::regrole
        and (pg_has_role('anon', r.oid, 'USAGE') or pg_has_role('anon', r.oid, 'SET'))) then
    raise exception using errcode = '55000', message = '0065 found unexpected anonymous role access.';
  end if;

  -- PUBLIC, inherited/SET ROLE paths and column grants must not defeat a table
  -- REVOKE. Reject them rather than modifying another role or PUBLIC.
  if exists (
    select 1 from pg_catalog.pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
      and a.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      and case when a.grantee = 0 then true
        when a.grantee = 'anon'::regrole then false
        else pg_has_role('anon', a.grantee, 'USAGE') or pg_has_role('anon', a.grantee, 'SET') end
  ) or exists (
    select 1 from pg_catalog.pg_attribute column_acl
    join pg_catalog.pg_class c on c.oid = column_acl.attrelid
    cross join lateral aclexplode(column_acl.attacl) a
    where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
      and a.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      and case when a.grantee in (0, 'anon'::regrole::oid) then true
        else pg_has_role('anon', a.grantee, 'USAGE') or pg_has_role('anon', a.grantee, 'SET') end
  ) or exists (
    select 1 from pg_catalog.pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
      and a.grantee = 'anon'::regrole
      and (a.privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        or a.is_grantable or a.grantor <> 'postgres'::regrole)
  ) then
    raise exception using errcode = '55000', message = '0065 found unexpected anonymous privilege paths.';
  end if;

  select jsonb_agg(jsonb_build_array(t.name, p.name) order by t.name collate "C", p.name collate "C")
    into baseline_matrix
  from unnest(granted_tables) t(name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(name)
  where p.name <> 'SELECT' or not (t.name = any(non_select_tables));
  select jsonb_agg(jsonb_build_array(t.name, 'SELECT') order by t.name collate "C")
    into hardened_matrix from unnest(retained_selects) t(name);
  select coalesce(jsonb_agg(jsonb_build_array(c.relname, a.privilege_type)
    order by c.relname::text collate "C", a.privilege_type collate "C"), '[]'::jsonb) into actual_matrix
  from pg_catalog.pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
    and a.grantee = 'anon'::regrole;

  if actual_matrix <> baseline_matrix and actual_matrix <> hardened_matrix then
    raise exception using errcode = '55000', message = '0065 found unexpected anonymous CRUD grant matrix.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_class c
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(name)
    where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
      and has_table_privilege('anon', c.oid, p.name) <> exists (
        select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        where a.grantee = 'anon'::regrole and a.privilege_type = p.name)
  ) then
    raise exception using errcode = '55000', message = '0065 found unexpected effective anonymous CRUD access.';
  end if;

  if actual_matrix = hardened_matrix then
    raise notice '0065 already matches the exact hardened grant matrix.';
    return;
  end if;
  if jsonb_array_length(baseline_matrix) - jsonb_array_length(hardened_matrix) <> 88 then
    raise exception using errcode = '55000', message = '0065 removal inventory is inconsistent.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(c.oid, a.grantor, a.grantee,
    a.privilege_type, a.is_grantable) order by c.oid, a.grantor, a.grantee, a.privilege_type),
    '[]'::jsonb) into other_acl_before
  from pg_catalog.pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
    and a.grantee <> 'anon'::regrole;
  select jsonb_build_object(
    'tables', (select jsonb_agg(jsonb_build_array(c.oid, c.relname, c.relowner,
      c.relrowsecurity, c.relforcerowsecurity) order by c.oid)
      from pg_catalog.pg_class c where c.relnamespace = 'public'::regnamespace),
    'columns', (select jsonb_agg(to_jsonb(a) order by a.attrelid, a.attnum)
      from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace),
    'policies', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_catalog.pg_policy p),
    'functions', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace),
    'triggers', (select jsonb_agg(to_jsonb(t) order by t.oid) from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace),
    'constraints', (select jsonb_agg(to_jsonb(k) order by k.oid) from pg_catalog.pg_constraint k
      where k.connamespace = 'public'::regnamespace),
    'defaults', (select jsonb_agg(to_jsonb(d) order by d.oid) from pg_catalog.pg_default_acl d),
    'memberships', (select jsonb_agg(to_jsonb(m) order by m.roleid, m.member) from pg_catalog.pg_auth_members m),
    'roles', (select jsonb_agg(to_jsonb(r) order by r.oid) from pg_catalog.pg_roles r),
    'schemas', (select jsonb_agg(to_jsonb(n) order by n.oid) from pg_catalog.pg_namespace n
      where n.nspname not like 'pg_temp_%' and n.nspname not like 'pg_toast_temp_%')
  ) into immutable_before;

  -- Both names and privilege lists come exclusively from this fixed manifest.
  foreach relation_name in array granted_tables loop
    execute format('revoke insert, update, delete on table public.%I from anon', relation_name);
    if not (relation_name = any(retained_selects)) and not (relation_name = any(non_select_tables)) then
      execute format('revoke select on table public.%I from anon', relation_name);
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_array(c.relname, a.privilege_type)
    order by c.relname::text collate "C", a.privilege_type collate "C"), '[]'::jsonb) into actual_matrix
  from pg_catalog.pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
    and a.grantee = 'anon'::regrole;
  if actual_matrix <> hardened_matrix or exists (
    select 1 from pg_catalog.pg_class c
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(name)
    where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
      and has_table_privilege('anon', c.oid, p.name) <>
        (p.name = 'SELECT' and c.relname = any(retained_selects))
  ) then
    raise exception using errcode = '55000', message = '0065 post-revocation privilege verification failed.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(c.oid, a.grantor, a.grantee,
    a.privilege_type, a.is_grantable) order by c.oid, a.grantor, a.grantee, a.privilege_type),
    '[]'::jsonb) into other_acl_after
  from pg_catalog.pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.relnamespace = 'public'::regnamespace and c.relname = any(inventory)
    and a.grantee <> 'anon'::regrole;
  select jsonb_build_object(
    'tables', (select jsonb_agg(jsonb_build_array(c.oid, c.relname, c.relowner,
      c.relrowsecurity, c.relforcerowsecurity) order by c.oid)
      from pg_catalog.pg_class c where c.relnamespace = 'public'::regnamespace),
    'columns', (select jsonb_agg(to_jsonb(a) order by a.attrelid, a.attnum)
      from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace),
    'policies', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_catalog.pg_policy p),
    'functions', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace),
    'triggers', (select jsonb_agg(to_jsonb(t) order by t.oid) from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace),
    'constraints', (select jsonb_agg(to_jsonb(k) order by k.oid) from pg_catalog.pg_constraint k
      where k.connamespace = 'public'::regnamespace),
    'defaults', (select jsonb_agg(to_jsonb(d) order by d.oid) from pg_catalog.pg_default_acl d),
    'memberships', (select jsonb_agg(to_jsonb(m) order by m.roleid, m.member) from pg_catalog.pg_auth_members m),
    'roles', (select jsonb_agg(to_jsonb(r) order by r.oid) from pg_catalog.pg_roles r),
    'schemas', (select jsonb_agg(to_jsonb(n) order by n.oid) from pg_catalog.pg_namespace n
      where n.nspname not like 'pg_temp_%' and n.nspname not like 'pg_toast_temp_%')
  ) into immutable_after;
  if other_acl_after is distinct from other_acl_before or immutable_after is distinct from immutable_before then
    raise exception using errcode = '55000', message = '0065 changed an object outside the approved anonymous CRUD scope.';
  end if;
end;
$hardening$;

commit;
