-- Retire the legacy profile-email identity path and enforce tenant-safe clinical payment relations.
-- SaaS billing and public.clinic_subscriptions are intentionally unchanged.

-- Abort before taking constraint locks if historical rows are inconsistent. Operators must reconcile explicitly.
do $$
begin
  if exists (select 1 from public.appointments a join public.patients p on p.id=a.patient_id where p.clinic_id<>a.clinic_id) then
    raise exception '0036 precheck failed: appointment_patient_cross_clinic';
  end if;
  if exists (select 1 from public.payments py join public.patients p on p.id=py.patient_id where p.clinic_id<>py.clinic_id) then
    raise exception '0036 precheck failed: payment_patient_cross_clinic';
  end if;
  if exists (select 1 from public.payments py join public.appointments a on a.id=py.appointment_id where a.clinic_id<>py.clinic_id) then
    raise exception '0036 precheck failed: payment_appointment_cross_clinic';
  end if;
  if exists (select 1 from public.payments py join public.appointments a on a.id=py.appointment_id where py.patient_id is null or py.patient_id<>a.patient_id) then
    raise exception '0036 precheck failed: payment_patient_appointment_mismatch';
  end if;
end;
$$;

-- 0019 already provides patients(clinic_id,id), and 0021 provides
-- appointments(clinic_id,id,patient_id), so no redundant unique indexes are needed.
alter table public.appointments
  drop constraint appointments_patient_id_fkey,
  add constraint appointments_clinic_patient_fkey
    foreign key (clinic_id,patient_id) references public.patients(clinic_id,id)
    on update restrict on delete cascade not valid;

alter table public.payments
  drop constraint payments_patient_id_fkey,
  drop constraint payments_appointment_id_fkey,
  add constraint payments_appointment_requires_patient_check check (appointment_id is null or patient_id is not null) not valid,
  add constraint payments_clinic_patient_fkey
    foreign key (clinic_id,patient_id) references public.patients(clinic_id,id)
    on update restrict on delete set null (patient_id) not valid,
  add constraint payments_clinic_appointment_patient_fkey
    foreign key (clinic_id,appointment_id,patient_id) references public.appointments(clinic_id,id,patient_id)
    on update restrict on delete set null (appointment_id) not valid;

-- VALIDATE scans existing rows with weaker locking than adding fully validated constraints directly.
alter table public.appointments validate constraint appointments_clinic_patient_fkey;
alter table public.payments validate constraint payments_appointment_requires_patient_check;
alter table public.payments validate constraint payments_clinic_patient_fkey;
alter table public.payments validate constraint payments_clinic_appointment_patient_fkey;

comment on constraint appointments_clinic_patient_fkey on public.appointments is
  'An appointment patient must belong to the appointment clinic. Deleting the patient preserves the historical CASCADE behavior.';
comment on constraint payments_clinic_patient_fkey on public.payments is
  'A clinical payment patient, when present, must belong to the payment clinic. Patient deletion clears only patient_id.';
comment on constraint payments_clinic_appointment_patient_fkey on public.payments is
  'A linked appointment must match both payment clinic and patient. Appointment deletion clears only appointment_id.';

-- Kept so old database-aware tooling receives a permission failure instead of a missing-function failure.
-- Modern invitation acceptance resolves identity from auth.users.email.
revoke all on function public.add_clinic_member_by_email_for_current_user(uuid,text,text)
  from public, anon, authenticated;
comment on function public.add_clinic_member_by_email_for_current_user(uuid,text,text) is
  'LEGACY DISABLED: resolves editable profiles.email and must not be executed. Use tokenized invitations; acceptance verifies auth.users.email.';

-- Preserve the modern invitation contract while removing profiles.email from identity decisions.
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
  if v_role not in ('admin','doctor','assistant') then raise exception 'Invalid invitation role.'; end if;
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
    v_doctors:=public.count_clinic_doctors_for_current_user(p_clinic_id);
    if v_plan_id='basic' and v_doctors>=1 then raise exception 'Doctor limit reached for the current plan.'; end if;
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
  v_has_member boolean:=false; v_plan_id text; v_doctors integer;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select lower(u.email),u.email_confirmed_at into v_email,v_email_confirmed_at from auth.users u where u.id=v_user_id;
  if v_email is null or v_email_confirmed_at is null then raise exception 'Invitation is unavailable.'; end if;
  select * into v_invitation from public.clinic_member_invitations i where i.token_hash=p_token_hash for update;
  if not found or v_invitation.status<>'pending' or v_invitation.expires_at<=now() or v_invitation.revoked_at is not null then raise exception 'Invitation is unavailable.'; end if;
  if v_email<>v_invitation.normalized_email then raise exception 'Invitation is unavailable.'; end if;
  if not public.clinic_subscription_allows_member_acceptance(v_invitation.clinic_id) then raise exception 'Invitation is unavailable.'; end if;
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

revoke all on function public.create_clinic_member_invitation_for_current_user(uuid,text,text),
  public.accept_clinic_member_invitation_for_current_user(text) from public,anon;
grant execute on function public.create_clinic_member_invitation_for_current_user(uuid,text,text),
  public.accept_clinic_member_invitation_for_current_user(text) to authenticated;
