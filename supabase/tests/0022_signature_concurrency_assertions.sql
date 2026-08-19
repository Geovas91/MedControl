do $$
begin
  if (select status from public.consents where id = '51000000-0000-4000-8000-000000000001') <> 'signed' then
    raise exception 'Concurrent consent did not reach signed state';
  end if;
  if (select count(*) from public.consent_signatures where consent_id = '51000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Concurrent signing did not preserve exactly one final signature';
  end if;
  if (select count(*) from public.audit_logs where entity_id = '51000000-0000-4000-8000-000000000001' and action = 'consent_signed') <> 1 then
    raise exception 'Concurrent signing did not preserve exactly one signing audit event';
  end if;
end
$$;

select '0022 signature concurrency assertions passed' as result;
