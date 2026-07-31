create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_clinic_member_invitation_for_current_user(
  p_clinic_id uuid,
  p_email text,
  p_role text
)
returns table(invitation_id uuid, raw_token text, expires_at timestamptz, invited_email text, invited_role text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_email text := lower(nullif(trim(p_email), ''));
  v_role text := lower(nullif(trim(p_role), ''));
  v_token text;
  v_hash text;
  v_existing public.clinic_member_invitations%rowtype;
  v_existing_member_role text;
  v_doctors integer;
  v_plan_id text;
begin
  if v_actor_id is null then raise exception 'Authentication required.'; end if;
  if not public.has_clinic_role(p_clinic_id, array['owner', 'admin']) then raise exception 'Not allowed to manage invitations.'; end if;
  if not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Subscription does not allow invitations.'; end if;
  if v_role not in ('admin', 'doctor', 'assistant') then raise exception 'Invalid invitation role.'; end if;
  if v_email is null or char_length(v_email) > 254 or position('@' in v_email) < 2 then raise exception 'Invalid invitation email.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text || ':' || v_email, 0));
  select cm.role::text into v_existing_member_role from public.clinic_members as cm join public.profiles as p on p.id = cm.user_id where cm.clinic_id = p_clinic_id and lower(p.email) = v_email and cm.status = 'active' limit 1;
  if v_existing_member_role = 'owner' then raise exception 'Owner memberships cannot be invited or changed.'; end if;
  if v_existing_member_role is not null then raise exception 'This email already belongs to an active clinic member.'; end if;

  select * into v_existing from public.clinic_member_invitations as i where i.clinic_id = p_clinic_id and i.normalized_email = v_email and i.status = 'pending' for update;
  if found and v_existing.expires_at > now() then raise exception 'A pending invitation already exists for this email.'; end if;
  if found then update public.clinic_member_invitations set status = 'expired', token_hash = null where id = v_existing.id; end if;
  if (select count(*) from public.clinic_member_invitations where clinic_id = p_clinic_id and status = 'pending') >= 25 then raise exception 'Too many pending invitations.'; end if;

  if v_role = 'doctor' then
    select cs.plan_id into v_plan_id from public.clinic_subscriptions as cs where cs.clinic_id = p_clinic_id;
    v_doctors := public.count_clinic_doctors_for_current_user(p_clinic_id);
    if v_plan_id = 'basic' and v_doctors >= 1 then raise exception 'Doctor limit reached for the current plan.'; end if;
    if v_plan_id = 'plus' and v_doctors >= 5 then raise exception 'Doctor limit reached for the current plan.'; end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  insert into public.clinic_member_invitations as i (clinic_id, invited_email, normalized_email, role, token_hash, expires_at, created_by)
  values (p_clinic_id, v_email, v_email, v_role::public.clinic_member_role, v_hash, now() + interval '7 days', v_actor_id)
  returning i.id, i.expires_at, i.invited_email, i.role::text into invitation_id, expires_at, invited_email, invited_role;
  raw_token := v_token;
  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (p_clinic_id, v_actor_id, 'clinic_member_invitation', invitation_id, 'invitation_created', jsonb_build_object('role', v_role));
  return next;
end;
$$;

create or replace function public.rotate_clinic_member_invitation_token_for_current_user(p_invitation_id uuid)
returns table(raw_token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor_id uuid := auth.uid(); v_invitation public.clinic_member_invitations%rowtype; v_token text; begin
  if v_actor_id is null then raise exception 'Authentication required.'; end if;
  select * into v_invitation from public.clinic_member_invitations as i where i.id = p_invitation_id for update;
  if not found or not public.has_clinic_role(v_invitation.clinic_id, array['owner', 'admin']) then raise exception 'Invitation is unavailable.'; end if;
  if not public.clinic_has_write_entitlement(v_invitation.clinic_id) then raise exception 'Subscription does not allow invitations.'; end if;
  if v_invitation.status <> 'pending' then raise exception 'Invitation cannot be rotated.'; end if;
  if v_invitation.expires_at <= now() then raise exception 'Expired invitations must be recreated.'; end if;
  if v_invitation.last_rotated_at is not null and v_invitation.last_rotated_at > now() - interval '60 seconds' then raise exception 'Please wait before rotating.'; end if;
  if v_invitation.rotation_count >= 5 then raise exception 'Invitation rotation limit reached.'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.clinic_member_invitations set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), expires_at = now() + interval '7 days', last_rotated_at = now(), rotation_count = rotation_count + 1 where id = v_invitation.id returning clinic_member_invitations.expires_at into expires_at;
  raw_token := v_token;
  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata) values (v_invitation.clinic_id, v_actor_id, 'clinic_member_invitation', v_invitation.id, 'invitation_rotated', '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.create_clinic_member_invitation_for_current_user(uuid, text, text) from public, anon;
revoke all on function public.rotate_clinic_member_invitation_token_for_current_user(uuid) from public, anon;
grant execute on function public.create_clinic_member_invitation_for_current_user(uuid, text, text), public.rotate_clinic_member_invitation_token_for_current_user(uuid) to authenticated;
