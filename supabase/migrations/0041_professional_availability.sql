-- Recurring working intervals are scoped to the canonical clinic membership.
-- weekday follows ISO 8601: 1 = Monday through 7 = Sunday. Times are local to clinics.timezone.

create extension if not exists btree_gist with schema extensions;

-- A clinic member is globally identifiable by id, but this pair is required to
-- enforce that future clinic-scoped rows cannot point at a member of another clinic.
alter table public.clinic_members
  add constraint clinic_members_clinic_id_id_unique unique (clinic_id, id);

create table public.professional_availability_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  clinic_member_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time without time zone not null,
  end_time time without time zone not null,
  effective_from date not null,
  effective_until date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_availability_rules_clinic_member_fkey
    foreign key (clinic_id, clinic_member_id)
    references public.clinic_members(clinic_id, id)
    on delete cascade,
  constraint professional_availability_rules_time_range_check
    check (start_time < end_time),
  constraint professional_availability_rules_effective_range_check
    check (effective_until is null or effective_until >= effective_from)
);

comment on table public.professional_availability_rules is
  'Recurring professional working intervals. Weekday is ISO 8601 (1 Monday through 7 Sunday); time values are interpreted in clinics.timezone.';
comment on column public.professional_availability_rules.clinic_member_id is
  'Canonical clinic-scoped professional identity; never a standalone auth.users identifier.';
comment on column public.professional_availability_rules.effective_until is
  'Inclusive local date. A replacement rule may begin on the following local date without overlapping history.';

create index professional_availability_rules_effective_lookup_idx
  on public.professional_availability_rules (clinic_id, clinic_member_id, weekday, effective_from)
  where is_active;

alter table public.professional_availability_rules
  add constraint professional_availability_rules_no_active_overlap
  exclude using gist (
    clinic_id with =,
    clinic_member_id with =,
    weekday with =,
    daterange(
      effective_from,
      case when effective_until is null then null else effective_until + 1 end,
      '[)'
    ) with &&,
    int4range(
      (extract(epoch from start_time) / 60)::integer,
      (extract(epoch from end_time) / 60)::integer,
      '[)'
    ) with &&
  ) where (is_active);

create function public.validate_professional_availability_rule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.clinic_members member
    where member.id = new.clinic_member_id
      and member.clinic_id = new.clinic_id
      and member.status = 'active'
      and member.role in ('owner', 'doctor')
  ) then
    raise exception 'Professional is unavailable for this clinic.' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger professional_availability_rules_validate_professional
before insert or update of clinic_id, clinic_member_id on public.professional_availability_rules
for each row execute function public.validate_professional_availability_rule();

create trigger professional_availability_rules_set_updated_at
before update on public.professional_availability_rules
for each row execute function public.set_updated_at();

create function public.can_manage_professional_availability_rule(
  p_clinic_id uuid,
  p_clinic_member_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.has_clinic_role(p_clinic_id, array['owner', 'admin'])
    or exists (
      select 1
      from public.clinic_members member
      where member.id = p_clinic_member_id
        and member.clinic_id = p_clinic_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role = 'doctor'
    );
$$;

alter table public.professional_availability_rules enable row level security;

create policy "Clinic scheduling roles can read professional availability"
  on public.professional_availability_rules
  for select
  using (public.has_clinic_role(clinic_id, array['owner', 'admin', 'doctor', 'assistant']));

create policy "Owners admins and own doctors can insert professional availability"
  on public.professional_availability_rules
  for insert
  with check (public.can_manage_professional_availability_rule(clinic_id, clinic_member_id));

create policy "Owners admins and own doctors can update professional availability"
  on public.professional_availability_rules
  for update
  using (public.can_manage_professional_availability_rule(clinic_id, clinic_member_id))
  with check (public.can_manage_professional_availability_rule(clinic_id, clinic_member_id));

create policy "Owners admins and own doctors can delete professional availability"
  on public.professional_availability_rules
  for delete
  using (public.can_manage_professional_availability_rule(clinic_id, clinic_member_id));

revoke all on table public.professional_availability_rules from public, anon;
grant select, insert, update, delete on table public.professional_availability_rules to authenticated;
-- PostgreSQL evaluates policy expressions as the caller, so authenticated needs
-- EXECUTE on this boolean-only authorization predicate. It exposes no schedule data.
revoke all on function public.can_manage_professional_availability_rule(uuid, uuid) from public, anon;
grant execute on function public.can_manage_professional_availability_rule(uuid, uuid) to authenticated;
revoke all on function public.validate_professional_availability_rule() from public, anon, authenticated;

create function public.get_professional_availability_for_date(
  p_clinic_id uuid,
  p_clinic_member_id uuid,
  p_local_date date
)
returns table (start_time time without time zone, end_time time without time zone)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_local_date is null then
    raise exception 'A local date is required.' using errcode = '22023';
  end if;

  if not public.has_clinic_role(p_clinic_id, array['owner', 'admin', 'doctor', 'assistant']) then
    raise exception 'Availability is unavailable.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.clinic_members member
    where member.id = p_clinic_member_id
      and member.clinic_id = p_clinic_id
      and member.status = 'active'
      and member.role in ('owner', 'doctor')
  ) then
    raise exception 'Professional is unavailable for this clinic.' using errcode = '22023';
  end if;

  return query
  select rule.start_time, rule.end_time
  from public.professional_availability_rules rule
  where rule.clinic_id = p_clinic_id
    and rule.clinic_member_id = p_clinic_member_id
    and rule.weekday = extract(isodow from p_local_date)::smallint
    and rule.is_active
    and rule.effective_from <= p_local_date
    and (rule.effective_until is null or rule.effective_until >= p_local_date)
  order by rule.start_time, rule.id;
end;
$$;

revoke all on function public.get_professional_availability_for_date(uuid, uuid, date) from public, anon;
grant execute on function public.get_professional_availability_for_date(uuid, uuid, date) to authenticated;

comment on function public.get_professional_availability_for_date(uuid, uuid, date) is
  'Returns active recurring local working intervals for a clinic member and a clinic-local date. It does not subtract appointments, exceptions, blocks, or buffers.';
