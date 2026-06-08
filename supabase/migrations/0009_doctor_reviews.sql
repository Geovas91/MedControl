-- Verified star-only reviews for public doctor directory profiles.
-- No comments, patient names, clinical details, appointment reasons, or free text are stored.

create table public.doctor_reviews (
  id uuid primary key default gen_random_uuid(),
  doctor_public_profile_id uuid not null references public.doctor_public_profiles(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  rating integer not null,
  is_verified boolean not null default true,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_reviews_rating_check check (rating between 1 and 5),
  constraint doctor_reviews_appointment_id_unique unique (appointment_id)
);

create index doctor_reviews_profile_visible_idx
  on public.doctor_reviews(doctor_public_profile_id, is_visible, is_verified);

create index doctor_reviews_clinic_id_idx on public.doctor_reviews(clinic_id);
create index doctor_reviews_patient_id_idx on public.doctor_reviews(patient_id);

create trigger doctor_reviews_set_updated_at
  before update on public.doctor_reviews
  for each row
  execute function public.set_updated_at();

create or replace function public.prevent_doctor_review_rating_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.doctor_public_profile_id is distinct from new.doctor_public_profile_id
    or old.clinic_id is distinct from new.clinic_id
    or old.appointment_id is distinct from new.appointment_id
    or old.patient_id is distinct from new.patient_id
    or old.rating is distinct from new.rating
    or old.is_verified is distinct from new.is_verified
    or old.created_at is distinct from new.created_at then
    raise exception 'Solo se puede cambiar la visibilidad de una reseña.';
  end if;

  return new;
end;
$$;

create trigger doctor_reviews_prevent_rating_edits
  before update on public.doctor_reviews
  for each row
  execute function public.prevent_doctor_review_rating_edits();

alter table public.doctor_reviews enable row level security;

create policy "Clinic members can read own clinic star reviews"
  on public.doctor_reviews
  for select
  using (public.is_clinic_member(clinic_id) or public.is_platform_admin());

create policy "Clinic owners and admins can hide own clinic star reviews"
  on public.doctor_reviews
  for update
  using (
    public.has_clinic_role(clinic_id, array['owner', 'admin'])
    or public.is_platform_admin()
  )
  with check (
    public.has_clinic_role(clinic_id, array['owner', 'admin'])
    or public.is_platform_admin()
  );

create or replace function public.get_public_doctor_review_summary(target_doctor_public_profile_id uuid)
returns table (
  average_rating numeric,
  review_count integer,
  rating_1 integer,
  rating_2 integer,
  rating_3 integer,
  rating_4 integer,
  rating_5 integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    round(avg(doctor_reviews.rating)::numeric, 1) as average_rating,
    count(doctor_reviews.id)::integer as review_count,
    count(*) filter (where doctor_reviews.rating = 1)::integer as rating_1,
    count(*) filter (where doctor_reviews.rating = 2)::integer as rating_2,
    count(*) filter (where doctor_reviews.rating = 3)::integer as rating_3,
    count(*) filter (where doctor_reviews.rating = 4)::integer as rating_4,
    count(*) filter (where doctor_reviews.rating = 5)::integer as rating_5
  from public.doctor_public_profiles
  left join public.doctor_reviews
    on doctor_reviews.doctor_public_profile_id = doctor_public_profiles.id
    and doctor_reviews.is_verified = true
    and doctor_reviews.is_visible = true
  where doctor_public_profiles.id = target_doctor_public_profile_id
    and doctor_public_profiles.is_published = true;
$$;

-- Direct anonymous/client inserts are intentionally not allowed.
-- TODO: call this function only from a future signed, expiring patient review-token flow.
create or replace function public.can_create_doctor_review_for_completed_appointment(
  target_doctor_public_profile_id uuid,
  target_appointment_id uuid,
  target_patient_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  appointment_record public.appointments%rowtype;
  profile_record public.doctor_public_profiles%rowtype;
  existing_review_id uuid;
begin
  select *
    into appointment_record
  from public.appointments
  where appointments.id = target_appointment_id
    and appointments.patient_id = target_patient_id
    and appointments.status = 'completed'
  limit 1;

  if appointment_record.id is null then
    return false;
  end if;

  select *
    into profile_record
  from public.doctor_public_profiles
  where doctor_public_profiles.id = target_doctor_public_profile_id
  limit 1;

  if profile_record.id is null then
    return false;
  end if;

  if profile_record.clinic_id <> appointment_record.clinic_id then
    return false;
  end if;

  if profile_record.profile_id is not null and appointment_record.doctor_id is not null
    and profile_record.profile_id <> appointment_record.doctor_id then
    return false;
  end if;

  select doctor_reviews.id
    into existing_review_id
  from public.doctor_reviews
  where doctor_reviews.appointment_id = target_appointment_id
  limit 1;

  return existing_review_id is null;
end;
$$;

create or replace function public.create_verified_doctor_review_for_completed_appointment(
  target_doctor_public_profile_id uuid,
  target_appointment_id uuid,
  target_patient_id uuid,
  target_rating integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_record public.appointments%rowtype;
  profile_record public.doctor_public_profiles%rowtype;
  new_review_id uuid;
begin
  if target_rating < 1 or target_rating > 5 then
    raise exception 'La calificación debe estar entre 1 y 5 estrellas.';
  end if;

  select *
    into appointment_record
  from public.appointments
  where appointments.id = target_appointment_id
    and appointments.patient_id = target_patient_id
    and appointments.status = 'completed'
  limit 1;

  if appointment_record.id is null then
    raise exception 'Solo se puede calificar una cita completada del paciente verificado.';
  end if;

  select *
    into profile_record
  from public.doctor_public_profiles
  where doctor_public_profiles.id = target_doctor_public_profile_id
  limit 1;

  if profile_record.id is null then
    raise exception 'El perfil público del médico no existe.';
  end if;

  if profile_record.clinic_id <> appointment_record.clinic_id then
    raise exception 'La cita no pertenece a la clínica del perfil público.';
  end if;

  if profile_record.profile_id is not null and appointment_record.doctor_id is not null
    and profile_record.profile_id <> appointment_record.doctor_id then
    raise exception 'La cita no corresponde al médico del perfil público.';
  end if;

  insert into public.doctor_reviews (
    doctor_public_profile_id,
    clinic_id,
    appointment_id,
    patient_id,
    rating,
    is_verified,
    is_visible
  )
  values (
    target_doctor_public_profile_id,
    appointment_record.clinic_id,
    target_appointment_id,
    target_patient_id,
    target_rating,
    true,
    true
  )
  returning id into new_review_id;

  return new_review_id;
end;
$$;

comment on table public.doctor_reviews is
  'Verified star-only reviews for doctor public profiles. Does not store comments, patient names, appointment reasons, or clinical information.';
comment on function public.create_verified_doctor_review_for_completed_appointment(uuid, uuid, uuid, integer) is
  'Prepared for a future signed patient review-token flow. Validates completed appointment, patient, clinic, doctor profile, and one review per appointment.';
comment on function public.can_create_doctor_review_for_completed_appointment(uuid, uuid, uuid) is
  'Read-only eligibility check for the future signed patient review-token flow.';
comment on function public.get_public_doctor_review_summary(uuid) is
  'Returns aggregate-only visible verified star review data for a published public doctor profile.';

revoke execute on function public.create_verified_doctor_review_for_completed_appointment(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.can_create_doctor_review_for_completed_appointment(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_verified_doctor_review_for_completed_appointment(uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.can_create_doctor_review_for_completed_appointment(uuid, uuid, uuid)
  to service_role;
