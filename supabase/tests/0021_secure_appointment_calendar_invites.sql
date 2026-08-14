-- Run after a local `supabase db reset`.
begin;

do $$
declare
  v_prepare regprocedure := 'public.prepare_appointment_email_invite(uuid,text,text,timestamp with time zone)'::regprocedure;
  v_record regprocedure := 'public.record_appointment_email_invite_result(uuid,integer,text,text,text,text)'::regprocedure;
begin
  if has_table_privilege('authenticated', 'public.appointment_invites', 'select')
    or has_table_privilege('authenticated', 'public.appointment_invites', 'insert')
    or has_table_privilege('authenticated', 'public.appointment_invites', 'update')
    or has_table_privilege('authenticated', 'public.appointment_invites', 'delete') then
    raise exception 'authenticated retains direct appointment_invites privileges';
  end if;

  if not has_function_privilege('authenticated', v_prepare, 'execute')
    or not has_function_privilege('authenticated', v_record, 'execute') then
    raise exception 'authenticated cannot execute the secured invitation RPCs';
  end if;
  if has_function_privilege('anon', v_prepare, 'execute')
    or has_function_privilege('anon', v_record, 'execute') then
    raise exception 'anon can execute an invitation RPC';
  end if;

  if to_regprocedure('public.prepare_appointment_email_invite(uuid,text,text)') is not null then
    raise exception 'legacy SECURITY INVOKER prepare RPC still exists';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid in (v_prepare::oid, v_record::oid)
      and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
  ) or (
    select count(*) from pg_proc
    where oid in (v_prepare::oid, v_record::oid)
      and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
  ) <> 2 then
    raise exception 'secured RPC properties are incomplete';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointment_invites'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like
        'FOREIGN KEY (clinic_id, appointment_id, patient_id) REFERENCES appointments(clinic_id, id, patient_id)%'
  ) then
    raise exception 'composite appointment invite FK is missing';
  end if;
end
$$;

rollback;

select '0021 secure appointment calendar invite catalog tests passed' as result;
