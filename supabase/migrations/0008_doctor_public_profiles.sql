-- Public doctor directory profiles.
-- Stores public-facing profile data only. No patient data, clinical notes, payments, or reviews are stored here.

create table public.doctor_public_profiles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  clinic_member_id uuid references public.clinic_members(id) on delete set null,
  slug text not null unique,
  display_name text not null,
  professional_title text,
  specialty text,
  subspecialty text,
  professional_license text,
  specialty_license text,
  bio text,
  years_experience integer,
  languages text[] not null default '{}',
  services text[] not null default '{}',
  consultation_mode text not null default 'presencial',
  address_line text,
  city text,
  state text,
  country text not null default 'México',
  phone text,
  whatsapp text,
  public_email text,
  website_url text,
  profile_image_url text,
  is_published boolean not null default false,
  accepts_new_patients boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_public_profiles_slug_not_empty_check check (length(trim(slug)) > 0),
  constraint doctor_public_profiles_display_name_not_empty_check check (length(trim(display_name)) > 0),
  constraint doctor_public_profiles_consultation_mode_check check (
    consultation_mode in ('presencial', 'online', 'hibrida')
  ),
  constraint doctor_public_profiles_years_experience_check check (
    years_experience is null or years_experience >= 0
  ),
  constraint doctor_public_profiles_publish_requirements_check check (
    is_published = false
    or (
      length(trim(display_name)) > 0
      and specialty is not null
      and length(trim(specialty)) > 0
    )
  )
);

create unique index doctor_public_profiles_clinic_member_id_idx
  on public.doctor_public_profiles(clinic_member_id)
  where clinic_member_id is not null;

create index doctor_public_profiles_published_idx
  on public.doctor_public_profiles(is_published)
  where is_published = true;

create index doctor_public_profiles_clinic_id_idx on public.doctor_public_profiles(clinic_id);
create index doctor_public_profiles_specialty_idx on public.doctor_public_profiles(specialty);
create index doctor_public_profiles_city_idx on public.doctor_public_profiles(city);

create trigger doctor_public_profiles_set_updated_at
  before update on public.doctor_public_profiles
  for each row
  execute function public.set_updated_at();

alter table public.doctor_public_profiles enable row level security;

create policy "Public can read published doctor profiles"
  on public.doctor_public_profiles
  for select
  using (is_published = true);

create policy "Clinic members can read own clinic public profiles"
  on public.doctor_public_profiles
  for select
  using (public.is_clinic_member(clinic_id) or public.is_platform_admin());

create policy "Clinic owners and admins can create doctor public profiles"
  on public.doctor_public_profiles
  for insert
  with check (
    public.has_clinic_role(clinic_id, array['owner', 'admin'])
    or exists (
      select 1
      from public.clinic_members
      where clinic_members.id = doctor_public_profiles.clinic_member_id
        and clinic_members.clinic_id = doctor_public_profiles.clinic_id
        and clinic_members.user_id = auth.uid()
        and clinic_members.role in ('owner', 'doctor')
        and clinic_members.status = 'active'
    )
    or public.is_platform_admin()
  );

create policy "Clinic owners and admins can update doctor public profiles"
  on public.doctor_public_profiles
  for update
  using (
    public.has_clinic_role(clinic_id, array['owner', 'admin'])
    or exists (
      select 1
      from public.clinic_members
      where clinic_members.id = doctor_public_profiles.clinic_member_id
        and clinic_members.clinic_id = doctor_public_profiles.clinic_id
        and clinic_members.user_id = auth.uid()
        and clinic_members.role in ('owner', 'doctor')
        and clinic_members.status = 'active'
    )
    or public.is_platform_admin()
  )
  with check (
    public.has_clinic_role(clinic_id, array['owner', 'admin'])
    or exists (
      select 1
      from public.clinic_members
      where clinic_members.id = doctor_public_profiles.clinic_member_id
        and clinic_members.clinic_id = doctor_public_profiles.clinic_id
        and clinic_members.user_id = auth.uid()
        and clinic_members.role in ('owner', 'doctor')
        and clinic_members.status = 'active'
    )
    or public.is_platform_admin()
  );

create policy "Clinic owners and admins can delete doctor public profiles"
  on public.doctor_public_profiles
  for delete
  using (
    public.has_clinic_role(clinic_id, array['owner', 'admin'])
    or public.is_platform_admin()
  );

comment on table public.doctor_public_profiles is
  'Public-facing doctor directory profiles. Does not store patient data, reviews, clinical notes, or sensitive financial information.';
comment on column public.doctor_public_profiles.professional_license is
  'Optional public professional license text shown only when the clinic chooses to publish it.';
