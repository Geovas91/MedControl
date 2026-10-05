-- Canonical plan capacity. No historical membership repair or owner backfill.
begin;

-- Invoked inside authorized DEFINER RPCs; not a public tenant-information API.
create or replace function public.count_active_clinic_professionals_internal(p_clinic_id uuid)
returns integer language sql security invoker set search_path=public,pg_temp as $$
  select count(*)::integer from public.clinic_members member
  where member.clinic_id=p_clinic_id and member.status='active' and member.is_professional=true;
$$;
revoke all on function public.count_active_clinic_professionals_internal(uuid) from public,anon,authenticated;

create or replace function public.count_clinic_doctors_for_current_user(target_clinic_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp stable as $$
begin
  if auth.uid() is null then raise exception 'Authentication required to inspect clinic plan limits.'; end if;
  if not public.is_clinic_member(target_clinic_id) and not public.is_platform_admin() then
    raise exception 'You do not have access to this clinic.';
  end if;
  return public.count_active_clinic_professionals_internal(target_clinic_id);
end $$;
revoke all on function public.count_clinic_doctors_for_current_user(uuid) from public,anon;
grant execute on function public.count_clinic_doctors_for_current_user(uuid) to authenticated;
comment on function public.count_clinic_doctors_for_current_user(uuid) is
  'Legacy RPC name: counts active professional seats by is_professional, independently of role; target-clinic members or Platform Admin only.';

create or replace function public.enforce_clinic_member_professional_capability()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.role='doctor' then
    new.is_professional:=true;
  elsif new.role='assistant' then
    new.is_professional:=false;
  elsif tg_op='UPDATE' and new.is_professional is distinct from old.is_professional
    and new.user_id=auth.uid() then
    -- Client UPDATE is still denied by RLS. The guarded RPC owns capacity and
    -- entitlement enforcement; no caller-controlled flag bypasses this trigger.
    if old.role<>'owner' or new.role<>'owner' or old.status<>'active'
      or new.status<>'active' or new.clinic_id<>old.clinic_id then
      raise exception 'A member cannot change their own professional capability.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;

create or replace function public.create_clinic_member_invitation_for_current_user(p_clinic_id uuid,p_email text,p_role text)
returns table(invitation_id uuid,raw_token text,expires_at timestamptz,invited_email text,invited_role text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor_id uuid:=auth.uid(); v_email text:=lower(nullif(trim(p_email),'')); v_role text:=lower(nullif(trim(p_role),''));
  v_token text; v_hash text; v_existing public.clinic_member_invitations%rowtype; v_existing_member_role text;
  v_doctors integer; v_plan_id text;
begin
  if v_actor_id is null then raise exception 'Authentication required.'; end if;
  if not public.has_clinic_role(p_clinic_id,array['owner','admin']) then raise exception 'Not allowed to manage invitations.'; end if;
  if not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'Subscription does not allow invitations.'; end if;
  if v_role is null or v_role not in ('admin','doctor','assistant') then raise exception 'Invalid invitation role.'; end if;
  if v_role in ('admin','assistant') and not public.clinic_plan_includes_commercial_feature_internal(p_clinic_id,'additional_staff') then
    raise exception 'Additional staff is unavailable for the current plan.' using errcode = '42501';
  end if;
  if v_email is null or char_length(v_email)>254 or position('@' in v_email)<2 then raise exception 'Invalid invitation email.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text||':'||v_email,0));
  select cm.role::text into v_existing_member_role from public.clinic_members cm join auth.users u on u.id=cm.user_id
    where cm.clinic_id=p_clinic_id and lower(u.email)=v_email and cm.status='active' limit 1;
  if v_existing_member_role='owner' then raise exception 'Owner memberships cannot be invited or changed.'; end if;
  if v_existing_member_role is not null then raise exception 'This email already belongs to an active clinic member.'; end if;
  select * into v_existing from public.clinic_member_invitations i
    where i.clinic_id=p_clinic_id and i.normalized_email=v_email and i.status='pending' for update;
  if found and v_existing.expires_at>now() then raise exception 'A pending invitation already exists for this email.'; end if;
  if found then update public.clinic_member_invitations set status='expired',token_hash=null where id=v_existing.id; end if;
  if (select count(*) from public.clinic_member_invitations where clinic_id=p_clinic_id and status='pending')>=25 then raise exception 'Too many pending invitations.'; end if;
  if v_role='doctor' then
    select cs.plan_id into v_plan_id from public.clinic_subscriptions cs where cs.clinic_id=p_clinic_id;
    v_doctors:=public.count_active_clinic_professionals_internal(p_clinic_id);
    if v_plan_id='basic' and v_doctors>=1 then raise exception 'Professional limit reached for the current plan.'; end if;
    if v_plan_id='plus' and v_doctors>=5 then raise exception 'Doctor limit reached for the current plan.'; end if;
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  insert into public.clinic_member_invitations as i(clinic_id,invited_email,normalized_email,role,token_hash,expires_at,created_by)
    values(p_clinic_id,v_email,v_email,v_role::public.clinic_member_role,v_hash,now()+interval '7 days',v_actor_id)
    returning i.id,i.expires_at,i.invited_email,i.role::text into invitation_id,expires_at,invited_email,invited_role;
  raw_token:=v_token;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(p_clinic_id,v_actor_id,'clinic_member_invitation',invitation_id,'invitation_created',jsonb_build_object('role',v_role));
  return next;
end $$;

create or replace function public.accept_clinic_member_invitation_for_current_user(p_token_hash text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user_id uuid:=auth.uid(); v_email text; v_email_confirmed_at timestamptz;
  v_invitation public.clinic_member_invitations%rowtype; v_existing public.clinic_members%rowtype;
  v_has_member boolean:=false; v_plan_id text; v_doctors integer; v_resulting_professional boolean;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  -- Shared with modern onboarding; acquired before invitation/clinic/member locks.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  if exists (select 1 from public.clinic_members where user_id=v_user_id and status='active') then
    raise exception 'Invitation is unavailable.';
  end if;
  select lower(u.email),u.email_confirmed_at into v_email,v_email_confirmed_at from auth.users u where u.id=v_user_id;
  if v_email is null or v_email_confirmed_at is null then raise exception 'Invitation is unavailable.'; end if;
  select * into v_invitation from public.clinic_member_invitations i where i.token_hash=p_token_hash for update;
  if not found or v_invitation.status<>'pending' or v_invitation.expires_at<=now() or v_invitation.revoked_at is not null then raise exception 'Invitation is unavailable.'; end if;
  if v_email<>v_invitation.normalized_email then raise exception 'Invitation is unavailable.'; end if;
  if not public.clinic_subscription_allows_member_acceptance(v_invitation.clinic_id) then raise exception 'Invitation is unavailable.'; end if;
  if v_invitation.role in ('admin','assistant') and not public.clinic_plan_includes_commercial_feature_internal(v_invitation.clinic_id,'additional_staff') then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;

  -- Lock order: user -> invitation -> clinic capacity -> professional pair -> member row.
  -- Includes professional-admin reactivation, not only doctor invitations.
  perform pg_advisory_xact_lock(hashtextextended('clinic_doctor_limit:'||v_invitation.clinic_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_invitation.clinic_id::text||':'||v_user_id::text,0));

  select * into v_existing from public.clinic_members cm where cm.clinic_id=v_invitation.clinic_id and cm.user_id=v_user_id for update;
  v_has_member:=found;
  if found and v_existing.role='owner' then raise exception 'Invitation is unavailable.'; end if;
  if found and v_existing.status='active' and v_existing.role<>v_invitation.role then raise exception 'Invitation is unavailable.'; end if;
  v_resulting_professional := case v_invitation.role
    when 'doctor' then true
    when 'assistant' then false
    else coalesce(v_existing.is_professional,false)
  end;
  if v_resulting_professional and (not v_has_member or v_existing.status<>'active' or not v_existing.is_professional) then
    select cs.plan_id into v_plan_id from public.clinic_subscriptions cs where cs.clinic_id=v_invitation.clinic_id;
    if v_plan_id is null or v_plan_id not in ('basic','plus','pro') then raise exception 'Invitation is unavailable.'; end if;
    v_doctors:=public.count_active_clinic_professionals_internal(v_invitation.clinic_id);
    if v_plan_id='basic' and v_doctors>=1 then raise exception 'Invitation is unavailable.'; end if;
    if v_plan_id='plus' and v_doctors>=5 then raise exception 'Invitation is unavailable.'; end if;
  end if;
  insert into public.profiles as p(id,email) values(v_user_id,v_email) on conflict(id) do update set email=excluded.email;
  if not v_has_member then
    insert into public.clinic_members(clinic_id,user_id,role,status,is_professional) values(v_invitation.clinic_id,v_user_id,v_invitation.role,'active',v_resulting_professional);
  elsif v_existing.status<>'active' then
    update public.clinic_members set role=v_invitation.role,status='active',is_professional=v_resulting_professional where id=v_existing.id;
  end if;
  update public.clinic_member_invitations set status='accepted',accepted_at=now(),accepted_user_id=v_user_id,token_hash=null where id=v_invitation.id;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(v_invitation.clinic_id,v_user_id,'clinic_member_invitation',v_invitation.id,'invitation_accepted',jsonb_build_object('role',v_invitation.role));
  return v_invitation.clinic_id;
end $$;


create or replace function public.set_clinic_member_professional_capability_for_current_user(
  p_clinic_id uuid,
  p_clinic_member_id uuid,
  p_is_professional boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.clinic_member_role;
  v_target public.clinic_members%rowtype;
  v_plan_id text;
  v_professional_count integer;
  v_unpublished_profile_count integer := 0;
begin
  if v_actor_id is null or p_is_professional is null then
    raise exception 'Professional capability is unavailable.' using errcode = '42501';
  end if;
  select role into v_actor_role from public.clinic_members
    where clinic_id = p_clinic_id and user_id = v_actor_id and status = 'active';
  if not found or v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'Professional capability is unavailable.' using errcode = '42501';
  end if;
  -- Same capacity lock as acceptance; acquired BEFORE any target row lock.
  -- Capacity -> professional pair -> member row. Removals use this order too.
  perform pg_advisory_xact_lock(hashtextextended('clinic_doctor_limit:'||p_clinic_id::text,0));
  select * into v_target from public.clinic_members
    where id = p_clinic_member_id and clinic_id = p_clinic_id and status = 'active';
  if not found then raise exception 'Clinic member is unavailable.' using errcode = '22023'; end if;
  -- Serialize capability removal with appointment creation and rescheduling for
  -- this clinic/professional pair. Both paths use this same advisory lock.
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text || ':' || v_target.user_id::text, 0));
  select * into v_target from public.clinic_members
    where id = p_clinic_member_id and clinic_id = p_clinic_id and status = 'active' for update;
  if not found then raise exception 'Clinic member is unavailable.' using errcode = '22023'; end if;
  -- Revalidate authorization and target invariants after waiting for locks.
  select role into v_actor_role from public.clinic_members
    where clinic_id=p_clinic_id and user_id=v_actor_id and status='active';
  if not found or v_actor_role is null or v_actor_role not in ('owner','admin') then
    raise exception 'Professional capability is unavailable.' using errcode='42501';
  end if;
  if v_target.user_id = v_actor_id and v_actor_role <> 'owner' then
    raise exception 'A member cannot change their own professional capability.' using errcode = '42501';
  end if;
  if v_target.role = 'doctor' and not p_is_professional then
    raise exception 'Doctors must remain professional.' using errcode = '22023';
  end if;
  if v_target.role = 'assistant' and p_is_professional then
    raise exception 'Assistants cannot become professionals.' using errcode = '22023';
  end if;
  if not p_is_professional and v_target.is_professional and exists (
    select 1
    from public.appointments appointment
    where appointment.clinic_id = p_clinic_id
      and appointment.doctor_id = v_target.user_id
      and appointment.starts_at > now()
      and appointment.status in ('scheduled', 'confirmed', 'waiting')
  ) then
    raise exception 'professional_has_future_appointments' using errcode = 'P0001';
  end if;
  if p_is_professional and not v_target.is_professional then
    if not public.clinic_has_write_entitlement(p_clinic_id) then
      raise exception 'Professional capability is unavailable.' using errcode = '42501';
    end if;
    select plan_id into v_plan_id from public.clinic_subscriptions where clinic_id = p_clinic_id;
    if v_plan_id is null or v_plan_id not in ('basic','plus','pro') then
      raise exception 'Professional capability is unavailable.' using errcode = '42501';
    end if;
    v_professional_count := public.count_active_clinic_professionals_internal(p_clinic_id);
    if v_plan_id = 'basic' and v_professional_count >= 1 then raise exception 'Professional limit reached for the current plan.' using errcode = '42501'; end if;
    if v_plan_id = 'plus' and v_professional_count >= 5 then raise exception 'Professional limit reached for the current plan.' using errcode = '42501'; end if;
  end if;
  update public.clinic_members set is_professional = p_is_professional where id = v_target.id;
  if not p_is_professional and v_target.is_professional then
    update public.doctor_public_profiles
      set is_published = false
      where clinic_id = p_clinic_id
        and (clinic_member_id = v_target.id or profile_id = v_target.user_id)
        and is_published;
    get diagnostics v_unpublished_profile_count = row_count;
  end if;
  insert into public.audit_logs(clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      p_clinic_id,
      v_actor_id,
      'clinic_member',
      v_target.id,
      'professional_capability_changed',
      jsonb_build_object(
        'enabled', p_is_professional,
        'public_profiles_unpublished', v_unpublished_profile_count
      )
    );
  return true;
end;
$$;
revoke all on function public.set_clinic_member_professional_capability_for_current_user(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_clinic_member_professional_capability_for_current_user(uuid, uuid, boolean) to authenticated;

create or replace function public.complete_clinic_onboarding_for_current_user(
  p_clinic_name text,
  p_legal_name text,
  p_phone text,
  p_clinic_email text,
  p_timezone text,
  p_country text,
  p_region text,
  p_address text,
  p_owner_full_name text,
  p_plan_id text,
  p_accepted_terms boolean,
  p_accepted_privacy boolean,
  p_accepted_clinical_responsibility boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_clinic_id uuid;
  v_clinic_id uuid;
  v_clinic_name text := nullif(trim(p_clinic_name), '');
  v_owner_full_name text := nullif(trim(p_owner_full_name), '');
  v_timezone text := nullif(trim(p_timezone), '');
  v_auth_email text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if v_clinic_name is null or char_length(v_clinic_name) > 160 then
    raise exception 'Invalid clinic name.';
  end if;
  if v_owner_full_name is null or char_length(v_owner_full_name) > 160 then
    raise exception 'Invalid owner name.';
  end if;
  if v_timezone is null or char_length(v_timezone) > 80 then
    raise exception 'Invalid timezone.';
  end if;
  if p_plan_id is null or p_plan_id not in ('basic', 'plus', 'pro') then
    raise exception 'Invalid plan.';
  end if;
  if not coalesce(p_accepted_terms, false)
    or not coalesce(p_accepted_privacy, false)
    or not coalesce(p_accepted_clinical_responsibility, false) then
    raise exception 'Required acknowledgements are missing.';
  end if;
  if char_length(coalesce(p_legal_name, '')) > 200
    or char_length(coalesce(p_phone, '')) > 40
    or char_length(coalesce(p_clinic_email, '')) > 254
    or char_length(coalesce(p_country, '')) > 80
    or char_length(coalesce(p_region, '')) > 120
    or char_length(coalesce(p_address, '')) > 500 then
    raise exception 'One or more fields are too long.';
  end if;

  -- Serializes all onboarding attempts for this authenticated account, including retries and parallel tabs.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  begin
    select cm.clinic_id into strict v_existing_clinic_id
    from public.clinic_members as cm
    where cm.user_id = v_user_id and cm.status = 'active';
  exception
    when no_data_found then v_existing_clinic_id := null;
    when too_many_rows then
      raise exception 'Membership integrity check failed.' using errcode = '23514';
  end;

  if v_existing_clinic_id is not null then
    return v_existing_clinic_id;
  end if;

  select u.email into v_auth_email
  from auth.users as u
  where u.id = v_user_id;

  if v_auth_email is null then
    raise exception 'Authenticated account is unavailable.';
  end if;

  insert into public.profiles as p (id, full_name, email)
  values (v_user_id, v_owner_full_name, v_auth_email)
  on conflict (id) do update
  set full_name = coalesce(p.full_name, excluded.full_name),
      email = coalesce(p.email, excluded.email);

  insert into public.clinics as c (
    name, legal_name, phone, email, timezone, country, region, address
  ) values (
    v_clinic_name,
    nullif(trim(p_legal_name), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_clinic_email), ''),
    v_timezone,
    nullif(trim(p_country), ''),
    nullif(trim(p_region), ''),
    nullif(trim(p_address), '')
  ) returning c.id into v_clinic_id;

  insert into public.clinic_members as cm (clinic_id, user_id, role, status, is_professional)
  values (v_clinic_id, v_user_id, 'owner', 'active', p_plan_id = 'basic');

  -- A beta trial is not a payment or paid entitlement; a trusted billing flow changes it later.
  insert into public.clinic_subscriptions as cs (
    clinic_id, plan_id, status, billing_provider, provider_subscription_id, provider_plan_id, current_period_start, current_period_end
  ) values (
    v_clinic_id, p_plan_id, 'trialing', 'manual', null, null, now(), now() + interval '30 days'
  );

  insert into public.clinic_onboarding_acceptances as coa (
    clinic_id, user_id, terms_version, privacy_version, clinical_responsibility_version
  ) values (v_clinic_id, v_user_id, 'pending-legal-v1', 'pending-privacy-v1', 'onboarding-responsibility-v1');

  return v_clinic_id;
end;
$$;

revoke all on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) to authenticated;

comment on function public.complete_clinic_onboarding_for_current_user(text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean) is
  'Serializes onboarding for auth.uid(), uses auth.users email only for profiles, stores clinic contact separately, records versioned acknowledgements, and creates a 30-day manual trial without clinical payments.';



revoke all on function public.create_clinic_member_invitation_for_current_user(uuid,text,text) from public,anon;
grant execute on function public.create_clinic_member_invitation_for_current_user(uuid,text,text) to authenticated;
revoke all on function public.accept_clinic_member_invitation_for_current_user(text) from public,anon;
grant execute on function public.accept_clinic_member_invitation_for_current_user(text) to authenticated;
commit;
