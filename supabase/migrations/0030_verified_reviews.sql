-- Verified Reviews v1: expiring one-time invitations bound to completed appointments.
-- Review links expire after 14 days. Plaintext tokens are returned once and never persisted.

alter table public.doctor_public_profiles
  add constraint doctor_public_profiles_clinic_id_id_profile_id_unique
  unique (clinic_id, id, profile_id);

alter table public.appointments
  add constraint appointments_clinic_id_id_patient_id_doctor_id_unique
  unique (clinic_id, id, patient_id, doctor_id);

create table public.review_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  appointment_id uuid not null,
  doctor_user_id uuid not null references auth.users(id) on delete restrict,
  doctor_public_profile_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  delivery_status text not null default 'pending',
  email_sent_at timestamptz,
  generation integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_invitations_appointment_unique unique (appointment_id),
  constraint review_invitations_clinic_appointment_patient_doctor_fk
    foreign key (clinic_id, appointment_id, patient_id, doctor_user_id)
    references public.appointments(clinic_id, id, patient_id, doctor_id) on delete cascade,
  constraint review_invitations_clinic_patient_fk
    foreign key (clinic_id, patient_id)
    references public.patients(clinic_id, id) on delete restrict,
  constraint review_invitations_clinic_profile_doctor_fk
    foreign key (clinic_id, doctor_public_profile_id, doctor_user_id)
    references public.doctor_public_profiles(clinic_id, id, profile_id) on delete restrict,
  constraint review_invitations_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint review_invitations_expiry_check check (expires_at > created_at),
  constraint review_invitations_lifecycle_check check (used_at is null or revoked_at is null),
  constraint review_invitations_delivery_status_check check (delivery_status in ('pending', 'sent', 'failed')),
  constraint review_invitations_generation_check check (generation > 0)
);

create index review_invitations_clinic_appointment_idx
  on public.review_invitations(clinic_id, appointment_id);
create index review_invitations_active_expiry_idx
  on public.review_invitations(expires_at)
  where used_at is null and revoked_at is null;

create trigger review_invitations_set_updated_at
  before update on public.review_invitations
  for each row execute function public.set_updated_at();

alter table public.review_invitations enable row level security;
revoke all privileges on table public.review_invitations from public, anon, authenticated;

alter table public.doctor_reviews
  add column invitation_id uuid references public.review_invitations(id) on delete restrict,
  add column doctor_user_id uuid references auth.users(id) on delete restrict,
  add column comment text,
  add constraint doctor_reviews_invitation_id_unique unique (invitation_id),
  add constraint doctor_reviews_comment_length_check check (comment is null or char_length(comment) <= 1000),
  add constraint doctor_reviews_comment_not_blank_check check (comment is null or char_length(btrim(comment)) > 0),
  add constraint doctor_reviews_invitation_evidence_check check (
    invitation_id is null or doctor_user_id is not null
  );

update public.doctor_reviews as reviews
set doctor_user_id = appointments.doctor_id
from public.appointments
where appointments.id = reviews.appointment_id
  and appointments.clinic_id = reviews.clinic_id
  and appointments.patient_id = reviews.patient_id
  and reviews.doctor_user_id is null;

create index doctor_reviews_profile_public_idx
  on public.doctor_reviews(doctor_public_profile_id, created_at desc, id desc)
  where is_verified = true and is_visible = true;

create or replace function public.prevent_doctor_review_rating_edits()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.doctor_public_profile_id is distinct from new.doctor_public_profile_id
    or old.clinic_id is distinct from new.clinic_id
    or old.appointment_id is distinct from new.appointment_id
    or old.patient_id is distinct from new.patient_id
    or old.invitation_id is distinct from new.invitation_id
    or old.doctor_user_id is distinct from new.doctor_user_id
    or old.rating is distinct from new.rating
    or old.comment is distinct from new.comment
    or old.is_verified is distinct from new.is_verified
    or old.created_at is distinct from new.created_at then
    raise exception 'Review evidence and patient content are immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all privileges on table public.doctor_reviews from public, anon, authenticated;
grant select on table public.doctor_reviews to authenticated;
grant update (is_visible) on table public.doctor_reviews to authenticated;

create or replace function public.issue_review_invitation_for_current_user(p_clinic_id uuid, p_appointment_id uuid)
returns table (invitation_id uuid, raw_token text, expires_at timestamptz, invitation_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_role public.clinic_member_role;
  v_profile public.doctor_public_profiles%rowtype;
  v_invitation public.review_invitations%rowtype;
  v_token text;
  v_expires_at timestamptz := now() + interval '14 days';
  v_generation integer := 1;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;

  select * into v_appointment from public.appointments
  where id = p_appointment_id and clinic_id = p_clinic_id for update;
  if not found then raise exception 'Appointment is unavailable.' using errcode = 'P0002'; end if;

  select role into v_role from public.clinic_members
  where clinic_id = v_appointment.clinic_id and user_id = v_actor and status = 'active';
  if v_role is null or v_role = 'assistant'
    or (v_role = 'doctor' and v_appointment.doctor_id is distinct from v_actor)
    or v_role not in ('owner', 'admin', 'doctor') then
    raise exception 'Review invitation is unavailable.' using errcode = '42501';
  end if;
  if not public.clinic_has_write_entitlement(v_appointment.clinic_id) then
    raise exception 'Subscription does not allow review invitations.' using errcode = '42501';
  end if;
  if v_appointment.status <> 'completed' then
    raise exception 'Only completed appointments can request a review.' using errcode = '22023';
  end if;
  if v_appointment.doctor_id is null then
    raise exception 'Appointment has no assigned professional.' using errcode = '22023';
  end if;

  select dpp.* into v_profile
  from public.doctor_public_profiles as dpp
  join public.clinic_members as doctor_member
    on doctor_member.id = dpp.clinic_member_id
   and doctor_member.clinic_id = dpp.clinic_id
   and doctor_member.user_id = dpp.profile_id
   and doctor_member.status = 'active'
   and doctor_member.role in ('owner', 'doctor')
  where dpp.clinic_id = v_appointment.clinic_id
    and dpp.profile_id = v_appointment.doctor_id
    and dpp.is_published = true
  order by dpp.created_at, dpp.id
  limit 1;
  if not found then raise exception 'Assigned professional has no valid public profile.' using errcode = '22023'; end if;

  if exists (select 1 from public.doctor_reviews where appointment_id = v_appointment.id) then
    raise exception 'Appointment already has a review.' using errcode = '23505';
  end if;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

  select * into v_invitation from public.review_invitations
  where appointment_id = v_appointment.id for update;

  if found then
    if v_invitation.used_at is not null then
      raise exception 'Review invitation was already used.' using errcode = '23505';
    end if;
    v_generation := v_invitation.generation + 1;
    update public.review_invitations
    set token_hash = encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
        expires_at = v_expires_at,
        used_at = null,
        revoked_at = null,
        delivery_status = 'pending',
        email_sent_at = null,
        generation = v_generation,
        created_by = v_actor
    where id = v_invitation.id
    returning * into v_invitation;
  else
    insert into public.review_invitations (
      clinic_id, patient_id, appointment_id, doctor_user_id,
      doctor_public_profile_id, token_hash, expires_at, created_by
    ) values (
      v_appointment.clinic_id, v_appointment.patient_id, v_appointment.id,
      v_appointment.doctor_id, v_profile.id,
      encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
      v_expires_at, v_actor
    ) returning * into v_invitation;
  end if;

  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_invitation.clinic_id, v_actor, 'review_invitation', v_invitation.id,
    'review_invitation_created',
    jsonb_build_object('appointment_id', v_invitation.appointment_id, 'generation', v_invitation.generation)
  );

  return query select v_invitation.id, v_token, v_invitation.expires_at, 'pending'::text;
end;
$$;

create or replace function public.revoke_review_invitation_for_current_user(p_clinic_id uuid, p_appointment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.review_invitations%rowtype;
  v_role public.clinic_member_role;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select invitation.* into v_invitation
  from public.review_invitations as invitation
  where invitation.appointment_id = p_appointment_id and invitation.clinic_id = p_clinic_id for update;
  if not found then return false; end if;

  select role into v_role from public.clinic_members
  where clinic_id = v_invitation.clinic_id and user_id = v_actor and status = 'active';
  if v_role is null or v_role = 'assistant'
    or (v_role = 'doctor' and v_invitation.doctor_user_id is distinct from v_actor)
    or v_role not in ('owner', 'admin', 'doctor') then
    raise exception 'Review invitation is unavailable.' using errcode = '42501';
  end if;
  if not public.clinic_has_write_entitlement(v_invitation.clinic_id) then
    raise exception 'Subscription does not allow review invitations.' using errcode = '42501';
  end if;
  if v_invitation.used_at is not null then return false; end if;

  update public.review_invitations
  set revoked_at = coalesce(revoked_at, now()), delivery_status = 'pending'
  where id = v_invitation.id;

  if v_invitation.revoked_at is null then
    insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (v_invitation.clinic_id, v_actor, 'review_invitation', v_invitation.id,
      'review_invitation_revoked', jsonb_build_object('appointment_id', v_invitation.appointment_id));
  end if;
  return true;
end;
$$;

create or replace function public.get_review_invitation_status_for_current_user(p_clinic_id uuid, p_appointment_id uuid)
returns table (invitation_id uuid, invitation_status text, expires_at timestamptz, email_sent_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.review_invitations%rowtype;
  v_role public.clinic_member_role;
begin
  if v_actor is null then return; end if;
  select invitation.* into v_invitation from public.review_invitations as invitation
  where invitation.appointment_id = p_appointment_id and invitation.clinic_id = p_clinic_id;
  if not found then return; end if;
  select role into v_role from public.clinic_members
  where clinic_id = v_invitation.clinic_id and user_id = v_actor and status = 'active';
  if v_role not in ('owner', 'admin', 'doctor')
    or (v_role = 'doctor' and v_invitation.doctor_user_id is distinct from v_actor) then return; end if;
  return query select v_invitation.id,
    case when v_invitation.used_at is not null then 'completed'
         when v_invitation.revoked_at is not null then 'revoked'
         when v_invitation.expires_at <= now() then 'expired'
         when v_invitation.delivery_status = 'sent' then 'sent'
         else 'pending' end,
    v_invitation.expires_at, v_invitation.email_sent_at;
end;
$$;

create or replace function public.get_review_email_context_for_current_user(p_clinic_id uuid, p_appointment_id uuid, p_token text)
returns table (invitation_id uuid, patient_email text, clinic_name text, doctor_display_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.review_invitations%rowtype;
  v_role public.clinic_member_role;
begin
  if v_actor is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return; end if;
  select invitation.* into v_invitation from public.review_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and invitation.clinic_id = p_clinic_id
    and invitation.appointment_id = p_appointment_id
    and invitation.used_at is null and invitation.revoked_at is null and invitation.expires_at > now();
  if not found then return; end if;
  select role into v_role from public.clinic_members
  where clinic_id = v_invitation.clinic_id and user_id = v_actor and status = 'active';
  if v_role not in ('owner', 'admin', 'doctor')
    or (v_role = 'doctor' and v_invitation.doctor_user_id is distinct from v_actor)
    or not public.clinic_has_write_entitlement(v_invitation.clinic_id) then return; end if;
  return query
    select v_invitation.id, patient.email, clinic.name, profile.display_name, v_invitation.expires_at
    from public.patients as patient
    join public.clinics as clinic on clinic.id = v_invitation.clinic_id
    join public.doctor_public_profiles as profile on profile.id = v_invitation.doctor_public_profile_id
    where patient.id = v_invitation.patient_id and patient.clinic_id = v_invitation.clinic_id;
end;
$$;

create or replace function public.record_review_email_result_for_current_user(
  p_clinic_id uuid, p_appointment_id uuid, p_token text, p_sent boolean, p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.review_invitations%rowtype;
  v_role public.clinic_member_role;
  v_error_code text := nullif(left(btrim(coalesce(p_error_code, '')), 64), '');
begin
  if v_actor is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
  select invitation.* into v_invitation from public.review_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and invitation.clinic_id = p_clinic_id
    and invitation.appointment_id = p_appointment_id
    and invitation.used_at is null and invitation.revoked_at is null and invitation.expires_at > now()
  for update;
  if not found then return false; end if;
  select role into v_role from public.clinic_members
  where clinic_id = v_invitation.clinic_id and user_id = v_actor and status = 'active';
  if v_role not in ('owner', 'admin', 'doctor')
    or (v_role = 'doctor' and v_invitation.doctor_user_id is distinct from v_actor)
    or not public.clinic_has_write_entitlement(v_invitation.clinic_id) then return false; end if;

  update public.review_invitations
  set delivery_status = case when p_sent then 'sent' else 'failed' end,
      email_sent_at = case when p_sent then now() else email_sent_at end
  where id = v_invitation.id;
  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_invitation.clinic_id, v_actor, 'review_invitation', v_invitation.id,
    case when p_sent then 'review_email_sent' else 'review_email_failed' end,
    jsonb_strip_nulls(jsonb_build_object('provider', 'resend', 'error_code', case when p_sent then null else coalesce(v_error_code, 'delivery_failed') end))
  );
  return true;
end;
$$;

create or replace function public.get_public_review_invitation(p_token text)
returns table (invitation_status text, doctor_display_name text, clinic_name text)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare v_invitation public.review_invitations%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return query select 'unavailable'::text, null::text, null::text; return;
  end if;
  select invitation.* into v_invitation from public.review_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
  if not found then return query select 'unavailable'::text, null::text, null::text; return; end if;
  if v_invitation.used_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= now() then
    return query select 'unavailable'::text, null::text, null::text; return;
  end if;
  return query select 'valid'::text, profile.display_name, clinic.name
    from public.doctor_public_profiles as profile
    join public.clinics as clinic on clinic.id = v_invitation.clinic_id
    where profile.id = v_invitation.doctor_public_profile_id and profile.clinic_id = v_invitation.clinic_id;
end;
$$;

create or replace function public.submit_verified_review(p_token text, p_rating integer, p_comment text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.review_invitations%rowtype;
  v_appointment public.appointments%rowtype;
  v_review_id uuid;
  v_comment text := case when p_comment is null or btrim(p_comment) = '' then null else p_comment end;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Review link is unavailable.' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.' using errcode = '22023';
  end if;
  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'Review comment is too long.' using errcode = '22023';
  end if;

  select invitation.* into v_invitation from public.review_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
  for update;
  if not found then raise exception 'Review link is unavailable.' using errcode = '22023'; end if;
  if v_invitation.used_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= now() then
    raise exception 'Review link is unavailable.' using errcode = '22023';
  end if;

  select appointment.* into v_appointment from public.appointments as appointment
  where appointment.id = v_invitation.appointment_id
    and appointment.clinic_id = v_invitation.clinic_id
    and appointment.patient_id = v_invitation.patient_id
    and appointment.doctor_id = v_invitation.doctor_user_id
  for share;
  if not found or v_appointment.status <> 'completed' then
    raise exception 'Review link is unavailable.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.doctor_public_profiles as profile
    where profile.id = v_invitation.doctor_public_profile_id
      and profile.clinic_id = v_invitation.clinic_id
      and profile.profile_id = v_invitation.doctor_user_id
  ) then raise exception 'Review link is unavailable.' using errcode = '22023'; end if;

  insert into public.doctor_reviews (
    invitation_id, doctor_public_profile_id, doctor_user_id, clinic_id,
    appointment_id, patient_id, rating, comment, is_verified, is_visible
  ) values (
    v_invitation.id, v_invitation.doctor_public_profile_id, v_invitation.doctor_user_id,
    v_invitation.clinic_id, v_invitation.appointment_id, v_invitation.patient_id,
    p_rating, v_comment, true, true
  ) returning id into v_review_id;

  update public.review_invitations set used_at = now() where id = v_invitation.id;
  insert into public.audit_logs (clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_invitation.clinic_id, null, 'doctor_review', v_review_id,
    'verified_review_submitted', jsonb_build_object('invitation_id', v_invitation.id));
  return true;
end;
$$;

create or replace function public.list_public_doctor_reviews(
  p_doctor_public_profile_id uuid, p_limit integer default 10
)
returns table (rating integer, comment text, created_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select reviews.rating, reviews.comment, reviews.created_at
  from public.doctor_reviews as reviews
  join public.doctor_public_profiles as profile
    on profile.id = reviews.doctor_public_profile_id
  where reviews.doctor_public_profile_id = p_doctor_public_profile_id
    and profile.is_published = true
    and reviews.is_verified = true
    and reviews.is_visible = true
  order by reviews.created_at desc, reviews.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
$$;

-- Preserve historical signatures for compatibility, but keep every client role revoked.
revoke execute on function public.can_create_doctor_review_for_completed_appointment(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.create_verified_doctor_review_for_completed_appointment(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.can_create_doctor_review_for_completed_appointment(uuid, uuid, uuid) from service_role;
revoke execute on function public.create_verified_doctor_review_for_completed_appointment(uuid, uuid, uuid, integer) from service_role;

revoke all on function public.issue_review_invitation_for_current_user(uuid, uuid) from public, anon;
grant execute on function public.issue_review_invitation_for_current_user(uuid, uuid) to authenticated;
revoke all on function public.revoke_review_invitation_for_current_user(uuid, uuid) from public, anon;
grant execute on function public.revoke_review_invitation_for_current_user(uuid, uuid) to authenticated;
revoke all on function public.get_review_invitation_status_for_current_user(uuid, uuid) from public, anon;
grant execute on function public.get_review_invitation_status_for_current_user(uuid, uuid) to authenticated;
revoke all on function public.get_review_email_context_for_current_user(uuid, uuid, text) from public, anon;
grant execute on function public.get_review_email_context_for_current_user(uuid, uuid, text) to authenticated;
revoke all on function public.record_review_email_result_for_current_user(uuid, uuid, text, boolean, text) from public, anon;
grant execute on function public.record_review_email_result_for_current_user(uuid, uuid, text, boolean, text) to authenticated;

revoke all on function public.get_public_review_invitation(text) from public;
grant execute on function public.get_public_review_invitation(text) to anon, authenticated;
revoke all on function public.submit_verified_review(text, integer, text) from public;
grant execute on function public.submit_verified_review(text, integer, text) to anon, authenticated;
revoke all on function public.list_public_doctor_reviews(uuid, integer) from public;
grant execute on function public.list_public_doctor_reviews(uuid, integer) to anon, authenticated;

-- Make the pre-existing aggregate projection explicit and keep it aggregate-only.
alter function public.get_public_doctor_review_summary(uuid) set search_path = public, pg_temp;
revoke all on function public.get_public_doctor_review_summary(uuid) from public;
grant execute on function public.get_public_doctor_review_summary(uuid) to anon, authenticated;

comment on table public.review_invitations is
  'Internal one-time review invitation evidence. Stores SHA-256 token hashes only; links expire after 14 days.';
comment on column public.doctor_reviews.invitation_id is
  'Nullable only for reviews created before Verified Reviews v1; no retroactive invitation is fabricated.';
comment on column public.doctor_reviews.comment is
  'Optional immutable patient review text, limited to 1000 characters.';
