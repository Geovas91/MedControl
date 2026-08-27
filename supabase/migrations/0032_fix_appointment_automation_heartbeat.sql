-- Safe-update compatible scheduler heartbeat persistence.

create or replace function public.record_appointment_automation_heartbeat(
  p_phase text, p_status text default null, p_claimed integer default 0,
  p_succeeded integer default 0, p_skipped integer default 0, p_failed integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_phase = 'start' then
    update public.appointment_automation_scheduler_state
    set last_started_at = now(), last_status = 'running', updated_at = now()
    where singleton = true;
  elsif p_phase = 'finish' and p_status in ('ok', 'error') then
    update public.appointment_automation_scheduler_state
    set last_completed_at = now(), last_status = p_status,
      last_claimed = greatest(p_claimed, 0), last_succeeded = greatest(p_succeeded, 0),
      last_skipped = greatest(p_skipped, 0), last_failed = greatest(p_failed, 0), updated_at = now()
    where singleton = true;
  else
    raise exception 'Invalid heartbeat.' using errcode = '22023';
  end if;
  return true;
end;
$$;

revoke all on function public.record_appointment_automation_heartbeat(text, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_appointment_automation_heartbeat(text, text, integer, integer, integer, integer)
  to service_role;
