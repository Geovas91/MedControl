-- Run after `npx supabase db reset --local`.
create extension if not exists pgtap with schema extensions;

begin;
select extensions.plan(10);

select extensions.is(
  (select count(*)::integer
   from regexp_matches(
     pg_get_functiondef('public.record_appointment_automation_heartbeat(text,text,integer,integer,integer,integer)'::regprocedure),
     'where singleton = true', 'gi'
   )),
  2,
  'both heartbeat updates target the singleton row explicitly'
);
select extensions.ok(
  pg_get_functiondef('public.record_appointment_automation_heartbeat(text,text,integer,integer,integer,integer)'::regprocedure)
    not like '%UPDATE public.appointment_automation_scheduler_state SET last_started_at%updated_at = now();%',
  'heartbeat has no legacy unqualified start update'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.record_appointment_automation_heartbeat(text,text,integer,integer,integer,integer)', 'EXECUTE'),
  'service role retains heartbeat execute permission'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.record_appointment_automation_heartbeat(text,text,integer,integer,integer,integer)', 'EXECUTE'),
  'anon cannot execute heartbeat'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.record_appointment_automation_heartbeat(text,text,integer,integer,integer,integer)', 'EXECUTE'),
  'authenticated cannot execute heartbeat'
);

set local role service_role;
select extensions.is(
  public.record_appointment_automation_heartbeat('start'),
  true,
  'service role records heartbeat start through the production function'
);
reset role;
select extensions.is(
  (select last_status from public.appointment_automation_scheduler_state where singleton = true),
  'running',
  'start marks the singleton heartbeat running'
);

set local role service_role;
select extensions.is(
  public.record_appointment_automation_heartbeat('finish', 'ok', 4, 2, 1, 1),
  true,
  'service role records heartbeat finish through the production function'
);
reset role;
select extensions.is(
  (select concat_ws(':', last_status, last_claimed, last_succeeded, last_skipped, last_failed)
   from public.appointment_automation_scheduler_state where singleton = true),
  'ok:4:2:1:1',
  'finish persists status and sanitized counters on the singleton row'
);
select extensions.is(
  (select count(*)::integer from public.appointment_automation_scheduler_state where singleton = true),
  1,
  'scheduler state keeps exactly one singleton row'
);

select * from extensions.finish();
rollback;
