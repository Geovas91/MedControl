-- Atomic doctor-seat enforcement and server-only atomic support mutations.

create or replace function public.accept_clinic_member_invitation_for_current_user(p_token_hash text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user_id uuid:=auth.uid(); v_email text; v_email_confirmed_at timestamptz;
  v_invitation public.clinic_member_invitations%rowtype; v_existing public.clinic_members%rowtype;
  v_has_member boolean:=false; v_plan_id text; v_doctors integer;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select lower(u.email),u.email_confirmed_at into v_email,v_email_confirmed_at from auth.users u where u.id=v_user_id;
  if v_email is null or v_email_confirmed_at is null then raise exception 'Invitation is unavailable.'; end if;
  select * into v_invitation from public.clinic_member_invitations i where i.token_hash=p_token_hash for update;
  if not found or v_invitation.status<>'pending' or v_invitation.expires_at<=now() or v_invitation.revoked_at is not null then raise exception 'Invitation is unavailable.'; end if;
  if v_email<>v_invitation.normalized_email then raise exception 'Invitation is unavailable.'; end if;
  if not public.clinic_subscription_allows_member_acceptance(v_invitation.clinic_id) then raise exception 'Invitation is unavailable.'; end if;

  -- Every doctor activation in the client-accessible membership path shares this
  -- transaction lock, including two different invitations for the same clinic.
  if v_invitation.role='doctor' then
    perform pg_advisory_xact_lock(hashtextextended('clinic_doctor_limit:'||v_invitation.clinic_id::text,0));
  end if;

  select * into v_existing from public.clinic_members cm where cm.clinic_id=v_invitation.clinic_id and cm.user_id=v_user_id for update;
  v_has_member:=found;
  if found and v_existing.role='owner' then raise exception 'Invitation is unavailable.'; end if;
  if found and v_existing.status='active' and v_existing.role<>v_invitation.role then raise exception 'Invitation is unavailable.'; end if;
  if v_invitation.role='doctor' and (not v_has_member or v_existing.role<>'doctor' or v_existing.status<>'active') then
    select cs.plan_id into v_plan_id from public.clinic_subscriptions cs where cs.clinic_id=v_invitation.clinic_id;
    select count(*)::integer into v_doctors from public.clinic_members cm
      where cm.clinic_id=v_invitation.clinic_id and cm.status='active' and cm.role in ('owner','doctor');
    if v_plan_id='basic' and v_doctors>=1 then raise exception 'Invitation is unavailable.'; end if;
    if v_plan_id='plus' and v_doctors>=5 then raise exception 'Invitation is unavailable.'; end if;
  end if;
  insert into public.profiles as p(id,email) values(v_user_id,v_email) on conflict(id) do update set email=excluded.email;
  if not v_has_member then
    insert into public.clinic_members(clinic_id,user_id,role,status) values(v_invitation.clinic_id,v_user_id,v_invitation.role,'active');
  elsif v_existing.status<>'active' then
    update public.clinic_members set role=v_invitation.role,status='active' where id=v_existing.id;
  end if;
  update public.clinic_member_invitations set status='accepted',accepted_at=now(),accepted_user_id=v_user_id,token_hash=null where id=v_invitation.id;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(v_invitation.clinic_id,v_user_id,'clinic_member_invitation',v_invitation.id,'invitation_accepted',jsonb_build_object('role',v_invitation.role));
  return v_invitation.clinic_id;
end $$;

revoke all on function public.accept_clinic_member_invitation_for_current_user(text) from public,anon;
grant execute on function public.accept_clinic_member_invitation_for_current_user(text) to authenticated;

create function public.transition_admin_support_ticket(
  p_ticket_id uuid, p_expected_status text, p_to_status text, p_actor_user_id uuid
)
returns table(ticket_id uuid,reference_code text,created_by uuid,status text,event_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ticket public.support_tickets; v_event_id uuid;
begin
  if not exists(select 1 from public.platform_admins where user_id=p_actor_user_id) then
    raise exception 'Support ticket not found.' using errcode='42501';
  end if;
  if not ((p_expected_status='open' and p_to_status='triaged')
    or (p_expected_status='triaged' and p_to_status='in_progress')
    or (p_expected_status='in_progress' and p_to_status in ('waiting_user','resolved'))
    or (p_expected_status='waiting_user' and p_to_status='in_progress')
    or (p_expected_status='resolved' and p_to_status='closed')) then
    raise exception 'Invalid support ticket transition.' using errcode='22023';
  end if;
  update public.support_tickets as ticket set
    status=p_to_status,last_activity_at=now(),
    resolved_at=case when p_to_status='resolved' then now() else ticket.resolved_at end,
    closed_at=case when p_to_status='closed' then now() else null end
  where ticket.id=p_ticket_id and ticket.status=p_expected_status returning ticket.* into v_ticket;
  if not found then return; end if;
  insert into public.support_ticket_events(ticket_id,actor_user_id,event_type,from_status,to_status)
    values(v_ticket.id,p_actor_user_id,'support_ticket_status_changed',p_expected_status,p_to_status) returning id into v_event_id;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(v_ticket.clinic_id,p_actor_user_id,'support_ticket',v_ticket.id,
      case when p_to_status='triaged' then 'support_ticket_triaged' else 'support_ticket_status_changed' end,
      jsonb_build_object('ticket_id',v_ticket.id,'from_status',p_expected_status,'to_status',p_to_status));
  return query select v_ticket.id,v_ticket.reference_code,v_ticket.created_by,v_ticket.status,v_event_id;
end $$;

create function public.add_admin_support_message(
  p_ticket_id uuid, p_body text, p_visibility text, p_actor_user_id uuid
)
returns table(message_id uuid,event_id uuid,reference_code text,created_by uuid,status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ticket public.support_tickets; v_message_id uuid; v_event_id uuid;
begin
  if not exists(select 1 from public.platform_admins where user_id=p_actor_user_id) then
    raise exception 'Support ticket not found.' using errcode='42501';
  end if;
  if p_visibility not in ('requester','internal') or char_length(trim(coalesce(p_body,''))) not between 1 and 4000 then
    raise exception 'Invalid support message.' using errcode='22023';
  end if;
  select * into v_ticket from public.support_tickets where id=p_ticket_id for update;
  if not found or v_ticket.status='closed' then raise exception 'Support ticket not found.' using errcode='P0002'; end if;
  insert into public.support_ticket_messages(ticket_id,author_user_id,author_kind,visibility,body)
    values(v_ticket.id,p_actor_user_id,'platform_admin',p_visibility,trim(p_body)) returning id into v_message_id;
  update public.support_tickets set last_activity_at=now() where id=v_ticket.id;
  insert into public.support_ticket_events(ticket_id,actor_user_id,event_type,safe_metadata)
    values(v_ticket.id,p_actor_user_id,'support_ticket_message_added',jsonb_build_object('visibility',p_visibility)) returning id into v_event_id;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(v_ticket.clinic_id,p_actor_user_id,'support_ticket',v_ticket.id,
      case when p_visibility='internal' then 'support_ticket_internal_note_added' else 'support_ticket_admin_reply_added' end,
      jsonb_build_object('ticket_id',v_ticket.id));
  return query select v_message_id,v_event_id,v_ticket.reference_code,v_ticket.created_by,v_ticket.status;
end $$;

revoke all on function public.transition_admin_support_ticket(uuid,text,text,uuid),
  public.add_admin_support_message(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.transition_admin_support_ticket(uuid,text,text,uuid),
  public.add_admin_support_message(uuid,text,text,uuid) to service_role;

create function public.record_google_calendar_event_result(
  p_mapping_id uuid, p_integration_id uuid, p_clinic_id uuid, p_appointment_version timestamptz,
  p_status text, p_google_event_id text, p_error_code text
)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_now timestamptz:=now(); v_mapping_count integer; v_integration_count integer;
begin
  if p_status not in ('synced','deleted','failed') then return false; end if;
  update public.google_calendar_events set
    appointment_version=p_appointment_version,sync_status=p_status,google_event_id=p_google_event_id,
    last_error_code=p_error_code,last_synced_at=case when p_status='failed' then null else v_now end
  where id=p_mapping_id and integration_id=p_integration_id and clinic_id=p_clinic_id;
  get diagnostics v_mapping_count=row_count;
  if v_mapping_count<>1 then return false; end if;
  update public.calendar_integrations set
    last_sync_at=case when p_status='failed' then last_sync_at else v_now end,
    last_error_code=case when p_status='failed' then p_error_code else null end
  where id=p_integration_id and clinic_id=p_clinic_id;
  get diagnostics v_integration_count=row_count;
  if v_integration_count<>1 then raise exception 'Calendar result persistence failed.' using errcode='P0002'; end if;
  return true;
end $$;

revoke all on function public.record_google_calendar_event_result(uuid,uuid,uuid,timestamptz,text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_google_calendar_event_result(uuid,uuid,uuid,timestamptz,text,text,text)
  to service_role;

comment on function public.transition_admin_support_ticket(uuid,text,text,uuid) is
  'Server-only CAS transition that writes the ticket, event and audit row atomically.';
comment on function public.add_admin_support_message(uuid,text,text,uuid) is
  'Server-only support reply/internal-note transaction returning stable message and event identifiers.';
