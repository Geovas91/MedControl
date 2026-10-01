-- Single clinical membership authority. No automatic reconciliation of historical data.
-- Explicit transaction: the local migration runner executes statements individually.
begin;
lock table public.clinic_members in share row exclusive mode;
do $$
begin
  if exists (
    select user_id from public.clinic_members
    where status='active' group by user_id having count(*) > 1
  ) then
    raise exception 'Active membership integrity check failed.' using errcode='23514';
  end if;
end $$;

create unique index clinic_members_one_active_per_user_idx
  on public.clinic_members(user_id)
  where status='active'::public.clinic_member_status;
comment on index public.clinic_members_one_active_per_user_idx is
  'At most one active clinical membership per user, including platform administrators. Inactive memberships remain historical.';

create or replace function public.accept_clinic_member_invitation_for_current_user(p_token_hash text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user_id uuid:=auth.uid(); v_email text; v_email_confirmed_at timestamptz;
  v_invitation public.clinic_member_invitations%rowtype; v_existing public.clinic_members%rowtype;
  v_has_member boolean:=false; v_plan_id text; v_doctors integer;
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
  if p_plan_id not in ('basic', 'plus', 'pro') then
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

  insert into public.clinic_members as cm (clinic_id, user_id, role, status)
  values (v_clinic_id, v_user_id, 'owner', 'active');

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


revoke all on function public.create_personal_clinic_for_current_user(text,text,text)
  from public,anon,authenticated;
revoke all on function public.add_clinic_member_by_email_for_current_user(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.accept_clinic_member_invitation_for_current_user(text)
  from public,anon;
grant execute on function public.accept_clinic_member_invitation_for_current_user(text) to authenticated;
comment on function public.create_personal_clinic_for_current_user(text,text,text) is
  'LEGACY DISABLED: use modern onboarding with the shared user lock and single-active membership authority.';
comment on function public.accept_clinic_member_invitation_for_current_user(text) is
  'Accepts a verified invitation only when auth.uid() has no active membership; serializes with onboarding without exposing other tenant data.';
commit;
