-- CliniControl platform administration access.
-- This table is separate from clinic roles and is used only for internal CliniControl administrators.

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null default 'owner',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint platform_admins_user_id_unique unique (user_id),
  constraint platform_admins_role_check check (role in ('owner', 'admin', 'support'))
);

create index platform_admins_user_id_idx on public.platform_admins(user_id);
create index platform_admins_role_idx on public.platform_admins(role);

create trigger platform_admins_set_updated_at
  before update on public.platform_admins
  for each row
  execute function public.set_updated_at();

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_admins
    where platform_admins.user_id = auth.uid()
  );
$$;

create or replace function public.has_platform_admin_role(allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_admins
    where platform_admins.user_id = auth.uid()
      and platform_admins.role = any(allowed_roles)
  );
$$;

alter table public.platform_admins enable row level security;

create policy "Platform admins can read platform admins"
  on public.platform_admins
  for select
  using (public.is_platform_admin());

create policy "Platform owners and admins can insert platform admins"
  on public.platform_admins
  for insert
  with check (public.has_platform_admin_role(array['owner', 'admin']));

create policy "Platform owners and admins can update platform admins"
  on public.platform_admins
  for update
  using (public.has_platform_admin_role(array['owner', 'admin']))
  with check (public.has_platform_admin_role(array['owner', 'admin']));

create policy "Platform owners and admins can delete platform admins"
  on public.platform_admins
  for delete
  using (public.has_platform_admin_role(array['owner', 'admin']));

comment on table public.platform_admins is
  'Internal CliniControl platform administrators. This table is independent from clinic owner, doctor, assistant, and admin roles.';
