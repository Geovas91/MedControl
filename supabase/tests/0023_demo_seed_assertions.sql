-- Run after demo1.sql, demo1_account.sql and demo1_data.sql on a local database.
do $$
declare
  demo_clinic_id constant uuid := '10000000-0000-4000-8000-000000000001';
begin
  if (
    select count(*) from public.consents
    where clinic_id = demo_clinic_id
      and id::text like '26000000-%'
      and status = 'pending'
      and signed_at is null
  ) <> 4 then
    raise exception 'demo1 seed did not create exactly four mutable pending consents.';
  end if;

  if exists (
    select 1
    from public.consent_signatures as signature
    join public.consents as consent on consent.id = signature.consent_id
    where consent.clinic_id = demo_clinic_id
  ) then
    raise exception 'demo1 seed created artificial final signature evidence.';
  end if;

  if exists (
    select 1 from public.consents as consent
    where consent.clinic_id = demo_clinic_id
      and consent.status = 'signed'
      and (
        consent.signed_at is null
        or (select count(*) from public.consent_signatures as signature
            where signature.clinic_id = consent.clinic_id
              and signature.patient_id = consent.patient_id
              and signature.consent_id = consent.id) <> 1
        or exists (
          select 1 from public.consent_signatures as signature
          where signature.consent_id = consent.id
            and signature.signature_data is null
        )
      )
  ) then
    raise exception 'demo1 seed contains evidence that would fail the 0023 preflight.';
  end if;
end;
$$;
