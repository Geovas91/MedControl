-- Run after reset_demo1_data.sql. Required psql variable: blocked=true|false
\if :{?blocked}
\else
  \echo 'Missing required psql variable: blocked'
  \quit 2
\endif

create temporary table reset_demo1_expectation (blocked boolean not null);
insert into reset_demo1_expectation values (:'blocked'::boolean);

do $$
declare
  v_dataset_rows bigint;
  v_enabled_triggers bigint;
  v_expected_blocked boolean;
begin
  select blocked into v_expected_blocked from reset_demo1_expectation;

  select
    (select count(*) from public.patients where id = '21000000-0000-4000-8000-000000000001')
    + (select count(*) from public.medical_notes where id = '25000000-0000-4000-8000-000000000001')
    + (select count(*) from public.consents where id = '26000000-0000-4000-8000-000000000001')
    + (select count(*) from public.consent_signatures where id = '27000000-0000-4000-8000-000000000001')
  into v_dataset_rows;

  if v_expected_blocked and v_dataset_rows = 0 then
    raise exception 'Blocked reset deleted its protected dataset';
  elsif not v_expected_blocked and v_dataset_rows <> 0 then
    raise exception 'Mutable reset left % managed row(s)', v_dataset_rows;
  end if;

  select count(*) into v_enabled_triggers
  from pg_trigger
  where tgrelid in ('public.consent_signatures'::regclass, 'public.medical_notes'::regclass)
    and tgname in ('consent_signatures_prevent_mutation', 'medical_notes_protect_finalization')
    and tgenabled = 'O';

  if v_enabled_triggers <> 2 then
    raise exception 'Expected both immutability triggers enabled; found %', v_enabled_triggers;
  end if;
end
$$;

drop table reset_demo1_expectation;
