-- Technical delivery state for invitation email. This migration is not applied by the application.

alter table public.clinic_member_invitations
  add column if not exists email_delivery_status text,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_last_attempted_at timestamptz,
  add column if not exists email_failure_code text;

alter table public.clinic_member_invitations
  drop constraint if exists clinic_member_invitations_email_delivery_status_check,
  add constraint clinic_member_invitations_email_delivery_status_check
    check (email_delivery_status is null or email_delivery_status in ('sent', 'failed', 'disabled')),
  drop constraint if exists clinic_member_invitations_provider_message_id_length_check,
  add constraint clinic_member_invitations_provider_message_id_length_check
    check (provider_message_id is null or char_length(provider_message_id) <= 256),
  drop constraint if exists clinic_member_invitations_email_failure_code_length_check,
  add constraint clinic_member_invitations_email_failure_code_length_check
    check (email_failure_code is null or char_length(email_failure_code) <= 64);

create or replace function public.record_clinic_member_invitation_email_result_for_current_user(
  p_invitation_id uuid,
  p_delivery_status text,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_invitation public.clinic_member_invitations%rowtype;
  v_status text := lower(trim(p_delivery_status));
  v_message_id text := nullif(trim(p_provider_message_id), '');
  v_error_code text := nullif(trim(p_error_code), '');
  v_audit_action text;
begin
  if v_actor_id is null then raise exception 'Authentication required.'; end if;
  if v_status not in ('sent', 'failed', 'disabled') then raise exception 'Invalid delivery status.'; end if;
  if v_message_id is not null and (char_length(v_message_id) > 256 or v_message_id !~ '^[A-Za-z0-9._:-]+$') then raise exception 'Invalid provider message id.'; end if;
  if v_error_code is not null and (char_length(v_error_code) > 64 or v_error_code !~ '^[a-z_]+$') then raise exception 'Invalid delivery error code.'; end if;
  if (v_status = 'sent' and (v_message_id is null or v_error_code is not null))
    or (v_status <> 'sent' and v_message_id is not null) then raise exception 'Invalid delivery result.'; end if;

  select * into v_invitation
  from public.clinic_member_invitations as i
  where i.id = p_invitation_id
  for update;

  if not found or not public.has_clinic_role(v_invitation.clinic_id, array['owner', 'admin']) then
    raise exception 'Invitation is unavailable.';
  end if;

  update public.clinic_member_invitations
  set email_delivery_status = v_status,
      email_last_attempted_at = now(),
      email_sent_at = case when v_status = 'sent' then now() else email_sent_at end,
      provider_message_id = case when v_status = 'sent' then v_message_id else null end,
      email_failure_code = case when v_status = 'failed' then v_error_code else null end
  where id = v_invitation.id;

  v_audit_action := case v_status
    when 'sent' then 'invitation_email_sent'
    when 'failed' then 'invitation_email_failed'
    else 'invitation_email_disabled'
  end;

  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_invitation.clinic_id,
    v_actor_id,
    'clinic_member_invitation',
    v_invitation.id,
    v_audit_action,
    jsonb_build_object('provider', 'resend', 'technical_status', v_status, 'role', v_invitation.role)
  );

  return true;
end;
$$;

revoke all on function public.record_clinic_member_invitation_email_result_for_current_user(uuid, text, text, text) from public, anon;
grant execute on function public.record_clinic_member_invitation_email_result_for_current_user(uuid, text, text, text) to authenticated;
