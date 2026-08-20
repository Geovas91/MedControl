-- Run after repair_demo1_legacy_consent_fixtures.sql succeeds.
do $$
begin
  if (
    select count(*) from public.consents
    where clinic_id = '10000000-0000-4000-8000-000000000001'
      and id in (
        '26000000-0000-4000-8000-000000000001',
        '26000000-0000-4000-8000-000000000004'
      )
      and status = 'pending'
      and signed_at is null
      and signing_token_used_at is null
  ) <> 2 then
    raise exception 'Demo fixture repair did not restore both consents to pending.';
  end if;

  if exists (
    select 1 from public.consent_signatures
    where consent_id in (
      '26000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000004'
    )
  ) then
    raise exception 'Demo fixture repair left artificial signature rows.';
  end if;

  if not exists (
    select 1 from public.consents
    where id = '26000000-0000-4000-8000-000000000099'
      and clinic_id = '10000000-0000-4000-8000-000000000002'
      and patient_id = '21000000-0000-4000-8000-000000000099'
      and status = 'pending'
      and signed_at is null
  ) then
    raise exception 'Demo fixture repair changed the non-target tenant.';
  end if;

  if (
    select count(*) from pg_trigger
    where tgrelid in ('public.consents'::regclass, 'public.consent_signatures'::regclass)
      and tgname in ('consents_enforce_v1_lifecycle', 'consent_signatures_prevent_mutation')
      and tgenabled = 'O'
  ) <> 2 then
    raise exception 'Demo fixture repair left an immutability trigger disabled.';
  end if;

  if pg_get_functiondef('public.prevent_consent_signature_mutation()'::regprocedure)
       not like '%Final consent signatures are immutable.%'
    or pg_get_functiondef('public.enforce_consent_v1_lifecycle()'::regprocedure)
       not like '%Signed consent evidence is immutable.%' then
    raise exception 'Demo fixture repair did not restore immutable trigger functions.';
  end if;
end;
$$;
