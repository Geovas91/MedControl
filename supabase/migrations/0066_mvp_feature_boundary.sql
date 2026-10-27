-- V1-05: release-specific optional-feature boundary. Prepare only; apply through
-- a separately authorized database deployment. No RLS or manual appointment RPC
-- changes, no data deletion, no environment/user-controlled enable switch.
begin;

-- Block direct PostgREST calls too, including proposals created before v1.0.
revoke all on function
  public.create_assistant_pending_action_for_current_user(uuid,text,jsonb,timestamptz),
  public.claim_assistant_pending_action_for_current_user(uuid),
  public.execute_claimed_assistant_pending_action_for_current_user(uuid),
  public.save_appointment_assistant_settings_for_current_user(uuid,boolean,boolean,integer,time,time,boolean)
from public, anon, authenticated, service_role;

-- Stop optional producers without rewriting canonical scheduling/lifecycle SQL.
-- Keep their definitions and all historical jobs/proposals for reviewed recovery.
alter table public.appointments disable trigger appointments_enqueue_automation_jobs;
alter table public.bot_settings disable trigger bot_settings_refresh_appointment_automation;
alter table public.clinics disable trigger clinics_refresh_appointment_automation_timezone;

revoke all on function
  public.rebuild_clinic_reminder_jobs(uuid),
  public.claim_due_appointment_automation_jobs(text,integer,integer),
  public.begin_appointment_automation_delivery(uuid,text,uuid),
  public.issue_review_invitation_for_automation(uuid,text,uuid)
from public, anon, authenticated, service_role;

-- Retain read/history and finish/cancel/cleanup operations. Re-enabling any of
-- the above requires a separately reviewed release and explicit grants/triggers.
commit;
