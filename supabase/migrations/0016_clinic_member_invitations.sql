-- Secure clinic member invitations. This migration is intentionally not applied by the application.

create table public.clinic_member_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  invited_email text not null,
  normalized_email text not null,
  role public.clinic_member_role not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  provider_message_id text,
  constraint clinic_member_invitations_role_check check (role in ('admin', 'doctor', 'assistant')),
  constraint clinic_member_invitations_email_check check (normalized_email = lower(trim(invited_email))),
  constraint clinic_member_invitations_token_shape_check check (
    (status = 'pending' and token_hash is not null and accepted_at is null and revoked_at is null)
    or (status <> 'pending' and token_hash is null)
  )
);

create index clinic_member_invitations_clinic_id_idx on public.clinic_member_invitations(clinic_id);
create index clinic_member_invitations_normalized_email_idx on public.clinic_member_invitations(normalized_email);
create unique index clinic_member_invitations_token_hash_unique_idx on public.clinic_member_invitations(token_hash) where token_hash is not null;
create unique index clinic_member_invitations_pending_unique_idx on public.clinic_member_invitations(clinic_id, normalized_email) where status = 'pending';
create index clinic_member_invitations_expires_at_idx on public.clinic_member_invitations(expires_at) where status = 'pending';
create trigger clinic_member_invitations_set_updated_at before update on public.clinic_member_invitations for each row execute function public.set_updated_at();
alter table public.clinic_member_invitations enable row level security;

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

  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');
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
  if v_invitation.last_sent_at is not null and v_invitation.last_sent_at > now() - interval '60 seconds' then raise exception 'Please wait before resending.'; end if;
  if v_invitation.send_count >= 5 then raise exception 'Invitation resend limit reached.'; end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  update public.clinic_member_invitations set token_hash = encode(digest(v_token, 'sha256'), 'hex'), expires_at = now() + interval '7 days', last_sent_at = now(), send_count = send_count + 1 where id = v_invitation.id returning clinic_member_invitations.expires_at into expires_at;
  raw_token := v_token;
  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata) values (v_invitation.clinic_id, v_actor_id, 'clinic_member_invitation', v_invitation.id, 'invitation_rotated', '{}'::jsonb);
  return next;
end;
$$;

create or replace function public.revoke_clinic_member_invitation_for_current_user(p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor_id uuid := auth.uid(); v_invitation public.clinic_member_invitations%rowtype; begin
  if v_actor_id is null then raise exception 'Authentication required.'; end if;
  select * into v_invitation from public.clinic_member_invitations as i where i.id = p_invitation_id for update;
  if not found or not public.has_clinic_role(v_invitation.clinic_id, array['owner', 'admin']) then raise exception 'Invitation is unavailable.'; end if;
  if v_invitation.status = 'revoked' then return true; end if;
  if v_invitation.status <> 'pending' then raise exception 'Invitation cannot be revoked.'; end if;
  update public.clinic_member_invitations set status = 'revoked', revoked_at = now(), token_hash = null where id = v_invitation.id;
  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata) values (v_invitation.clinic_id, v_actor_id, 'clinic_member_invitation', v_invitation.id, 'invitation_revoked', '{}'::jsonb);
  return true;
end;
$$;

create or replace function public.list_clinic_member_invitations_for_current_user(p_clinic_id uuid)
returns table(id uuid, invited_email text, role text, status text, expires_at timestamptz, created_at timestamptz, last_sent_at timestamptz, send_count integer)
language sql security definer set search_path = public, pg_temp stable
as $$ select i.id, i.invited_email, i.role::text, i.status, i.expires_at, i.created_at, i.last_sent_at, i.send_count from public.clinic_member_invitations i where public.has_clinic_role(p_clinic_id, array['owner', 'admin']) and i.clinic_id = p_clinic_id order by i.created_at desc; $$;

create or replace function public.get_public_clinic_member_invitation(p_token_hash text)
returns table(is_valid boolean, clinic_name text, invited_role text, masked_email text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp stable
as $$ declare v_invitation public.clinic_member_invitations%rowtype; begin
  select i.* into v_invitation from public.clinic_member_invitations i where i.token_hash = p_token_hash and i.status = 'pending' and i.expires_at > now();
  if not found then return query select false, null::text, null::text, null::text, null::timestamptz; return; end if;
  return query select true, c.name, v_invitation.role::text, regexp_replace(v_invitation.invited_email, '^(.).+(@.*)$', '\\1***\\2'), v_invitation.expires_at from public.clinics c where c.id = v_invitation.clinic_id;
end; $$;

create or replace function public.accept_clinic_member_invitation_for_current_user(p_token_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := auth.uid(); v_email text; v_invitation public.clinic_member_invitations%rowtype; v_existing public.clinic_members%rowtype; v_has_member boolean := false; v_plan_id text; v_doctors integer; begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user_id;
  select * into v_invitation from public.clinic_member_invitations i where i.token_hash = p_token_hash for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now() or v_invitation.revoked_at is not null then raise exception 'Invitation is unavailable.'; end if;
  if v_email is null or v_email <> v_invitation.normalized_email then raise exception 'Invitation is unavailable.'; end if;
  if not public.clinic_has_write_entitlement(v_invitation.clinic_id) then raise exception 'Invitation is unavailable.'; end if;
  select * into v_existing from public.clinic_members cm where cm.clinic_id = v_invitation.clinic_id and cm.user_id = v_user_id for update;
  v_has_member := found;
  if found and v_existing.role = 'owner' then raise exception 'Invitation is unavailable.'; end if;
  if found and v_existing.status = 'active' and v_existing.role <> v_invitation.role then raise exception 'Invitation is unavailable.'; end if;
  if v_invitation.role = 'doctor' and (not v_has_member or v_existing.role <> 'doctor' or v_existing.status <> 'active') then
    select cs.plan_id into v_plan_id from public.clinic_subscriptions cs where cs.clinic_id = v_invitation.clinic_id;
    select count(*)::integer into v_doctors
    from public.clinic_members as cm
    where cm.clinic_id = v_invitation.clinic_id
      and cm.status = 'active'
      and cm.role in ('owner', 'doctor');
    if v_plan_id = 'basic' and v_doctors >= 1 then raise exception 'Invitation is unavailable.'; end if;
    if v_plan_id = 'plus' and v_doctors >= 5 then raise exception 'Invitation is unavailable.'; end if;
  end if;
  insert into public.profiles as p (id, email) values (v_user_id, v_email) on conflict (id) do update set email = coalesce(p.email, excluded.email);
  if not v_has_member then
    insert into public.clinic_members (clinic_id, user_id, role, status)
    values (v_invitation.clinic_id, v_user_id, v_invitation.role, 'active');
  elsif v_existing.status <> 'active' then
    update public.clinic_members
    set role = v_invitation.role, status = 'active'
    where id = v_existing.id;
  end if;
  update public.clinic_member_invitations set status = 'accepted', accepted_at = now(), accepted_user_id = v_user_id, token_hash = null where id = v_invitation.id;
  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata) values (v_invitation.clinic_id, v_user_id, 'clinic_member_invitation', v_invitation.id, 'invitation_accepted', jsonb_build_object('role', v_invitation.role));
  return true;
end; $$;

revoke all on table public.clinic_member_invitations from anon, authenticated;
revoke all on function public.create_clinic_member_invitation_for_current_user(uuid, text, text) from public, anon;
revoke all on function public.rotate_clinic_member_invitation_token_for_current_user(uuid) from public, anon;
revoke all on function public.revoke_clinic_member_invitation_for_current_user(uuid) from public, anon;
revoke all on function public.list_clinic_member_invitations_for_current_user(uuid) from public, anon;
revoke all on function public.accept_clinic_member_invitation_for_current_user(text) from public, anon;
revoke all on function public.get_public_clinic_member_invitation(text) from public;
grant execute on function public.create_clinic_member_invitation_for_current_user(uuid, text, text), public.rotate_clinic_member_invitation_token_for_current_user(uuid), public.revoke_clinic_member_invitation_for_current_user(uuid), public.list_clinic_member_invitations_for_current_user(uuid), public.accept_clinic_member_invitation_for_current_user(text) to authenticated;
grant execute on function public.get_public_clinic_member_invitation(text) to anon, authenticated;
