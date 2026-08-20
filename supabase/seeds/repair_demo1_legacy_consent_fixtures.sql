-- One-time staging/demo maintenance. Run only before migration 0023 and never in production.
-- Repairs the two deterministic fictional signatures historically created by demo1_data.sql.
-- The transaction keeps every trigger enabled and restores both trigger functions before commit.

begin;

select pg_advisory_xact_lock(hashtext('clinicontrol:repair-demo1-legacy-consent-fixtures'));

do $$
declare
  demo_clinic_id constant uuid := '10000000-0000-4000-8000-000000000001';
  first_consent_id constant uuid := '26000000-0000-4000-8000-000000000001';
  second_consent_id constant uuid := '26000000-0000-4000-8000-000000000004';
  first_signature_id constant uuid := '27000000-0000-4000-8000-000000000001';
  second_signature_id constant uuid := '27000000-0000-4000-8000-000000000002';
  v_lifecycle_definition text;
  v_signature_definition text;
  v_count bigint;
begin
  if to_regclass('public.consent_signed_snapshots') is not null then
    raise exception 'Demo fixture repair must run before migration 0023.';
  end if;

  if not exists (
    select 1 from public.clinics
    where id = demo_clinic_id and tenant_type = 'demo'
  ) then
    raise exception 'Demo fixture repair blocked: expected clinic UUID is not tenant_type demo.';
  end if;

  if (
    select count(*) from public.consents
    where id in (first_consent_id, second_consent_id)
      and clinic_id = demo_clinic_id
      and status = 'signed'
      and signed_at is not null
      and consent_version = 'demo-v1'
  ) <> 2 then
    raise exception 'Demo fixture repair blocked: deterministic consent rows do not match.';
  end if;

  if exists (
    select 1 from public.consents
    where id in (first_consent_id, second_consent_id)
      and (
        clinic_id <> demo_clinic_id
        or patient_id <> case id
          when first_consent_id then '21000000-0000-4000-8000-000000000001'::uuid
          else '21000000-0000-4000-8000-000000000003'::uuid
        end
      )
  ) then
    raise exception 'Demo fixture repair blocked: consent UUID ownership does not match.';
  end if;

  if (
    select count(*)
    from public.consent_signatures as signature
    join public.consents as consent on consent.id = signature.consent_id
    where signature.id in (first_signature_id, second_signature_id)
      and consent.clinic_id = demo_clinic_id
      and signature.clinic_id = demo_clinic_id
      and signature.signature_data is null
      and signature.user_agent = 'CliniControl fictional seed'
      and trim(signature.signer_full_name) <> ''
      and signature.signed_at is not null
      and (
        (signature.id = first_signature_id and signature.consent_id = first_consent_id)
        or (signature.id = second_signature_id and signature.consent_id = second_consent_id)
      )
  ) <> 2 then
    raise exception 'Demo fixture repair blocked: deterministic signature rows or seed marker do not match.';
  end if;

  if (
    select count(*) from public.consent_signatures
    where consent_id in (first_consent_id, second_consent_id)
  ) <> 2 then
    raise exception 'Demo fixture repair blocked: unexpected signature rows reference target consents.';
  end if;

  select pg_get_functiondef('public.enforce_consent_v1_lifecycle()'::regprocedure)
    into v_lifecycle_definition;
  select pg_get_functiondef('public.prevent_consent_signature_mutation()'::regprocedure)
    into v_signature_definition;

  execute $function$
    create or replace function public.enforce_consent_v1_lifecycle()
    returns trigger
    language plpgsql
    set search_path = public, pg_temp
    as $body$
    begin
      if old.clinic_id = '10000000-0000-4000-8000-000000000001'::uuid
        and old.id in (
          '26000000-0000-4000-8000-000000000001'::uuid,
          '26000000-0000-4000-8000-000000000004'::uuid
        )
        and old.status = 'signed'
        and new.status = 'pending'
        and new.signed_at is null
        and new.signing_token_used_at is null
        and new.clinic_id = old.clinic_id
        and new.patient_id = old.patient_id
        and new.clinical_record_id = old.clinical_record_id
        and new.consent_type = old.consent_type
        and new.consent_version = old.consent_version
        and new.consent_text = old.consent_text
        and new.template_id is not distinct from old.template_id
        and exists (
          select 1 from public.consent_signatures as signature
          where signature.consent_id = old.id
            and signature.clinic_id = old.clinic_id
            and signature.signature_data is null
            and signature.user_agent = 'CliniControl fictional seed'
        ) then
        return new;
      end if;
      raise exception 'Consent mutation blocked during scoped demo fixture repair.' using errcode = '23514';
    end;
    $body$
  $function$;

  update public.consents
  set status = 'pending',
      signed_at = null,
      signing_token_used_at = null,
      updated_by = null
  where clinic_id = demo_clinic_id
    and id in (first_consent_id, second_consent_id);
  get diagnostics v_count = row_count;
  if v_count <> 2 then
    raise exception 'Demo fixture repair updated % consent rows; expected 2.', v_count;
  end if;

  execute $function$
    create or replace function public.prevent_consent_signature_mutation()
    returns trigger
    language plpgsql
    set search_path = public, pg_temp
    as $body$
    begin
      if tg_op = 'DELETE'
        and old.clinic_id = '10000000-0000-4000-8000-000000000001'::uuid
        and old.id in (
          '27000000-0000-4000-8000-000000000001'::uuid,
          '27000000-0000-4000-8000-000000000002'::uuid
        )
        and old.signature_data is null
        and old.user_agent = 'CliniControl fictional seed' then
        return old;
      end if;
      raise exception 'Final consent signatures are immutable.' using errcode = '23514';
    end;
    $body$
  $function$;

  delete from public.consent_signatures
  where clinic_id = demo_clinic_id
    and id in (first_signature_id, second_signature_id)
    and signature_data is null
    and user_agent = 'CliniControl fictional seed';
  get diagnostics v_count = row_count;
  if v_count <> 2 then
    raise exception 'Demo fixture repair deleted % signature rows; expected 2.', v_count;
  end if;

  execute v_lifecycle_definition;
  execute v_signature_definition;

  if exists (
    select 1 from public.consents
    where id in (first_consent_id, second_consent_id)
      and (clinic_id <> demo_clinic_id or status <> 'pending' or signed_at is not null)
  ) or exists (
    select 1 from public.consent_signatures
    where consent_id in (first_consent_id, second_consent_id)
  ) then
    raise exception 'Demo fixture repair postcondition failed.';
  end if;

  if (
    select count(*) from pg_trigger
    where tgrelid in ('public.consents'::regclass, 'public.consent_signatures'::regclass)
      and tgname in ('consents_enforce_v1_lifecycle', 'consent_signatures_prevent_mutation')
      and tgenabled = 'O'
  ) <> 2 then
    raise exception 'Demo fixture repair left an immutability trigger disabled.';
  end if;
end;
$$;

commit;
