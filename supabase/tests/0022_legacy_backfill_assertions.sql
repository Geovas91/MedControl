-- Run after 0022_legacy_backfill_fixture.sql and `supabase migration up --local`.

do $$
declare
  expected_clinic constant uuid := '82000000-0000-4000-8000-000000000001';
  expected_record constant uuid := '82000000-0000-4000-8000-000000000003';
begin
  if exists (
    select 1
    from public.consents
    where id in (
      '82000000-0000-4000-8000-000000000010',
      '82000000-0000-4000-8000-000000000011',
      '82000000-0000-4000-8000-000000000012'
    )
      and clinical_record_id is distinct from expected_record
  ) then
    raise exception '0022 did not backfill the unique active clinical record';
  end if;

  if (select clinic_id from public.consent_signatures where id = '82000000-0000-4000-8000-000000000020')
    is distinct from expected_clinic then
    raise exception '0022 did not backfill consent_signatures.clinic_id';
  end if;

  if (select status::text from public.consents where id = '82000000-0000-4000-8000-000000000010') <> 'pending' then
    raise exception 'Unsigned legacy expired consent was not preserved as pending with an expired link';
  end if;

  if (select status::text from public.consents where id = '82000000-0000-4000-8000-000000000011') <> 'signed' then
    raise exception 'Signed legacy expired consent did not preserve its signature evidence';
  end if;

  if (select status::text from public.consents where id = '82000000-0000-4000-8000-000000000012') <> 'cancelled' then
    raise exception 'Unsigned legacy revoked consent was not migrated to cancelled';
  end if;

  if (select signing_token_revoked_at from public.consents where id = '82000000-0000-4000-8000-000000000010') is null then
    raise exception 'Expired legacy link was not invalidated';
  end if;
end;
$$;

select '0022 legacy backfill assertions passed' as result;
