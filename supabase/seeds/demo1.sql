-- Base tenant only. Do not add real users or clinical information.

begin;

insert into public.clinics as existing_tenant (
  id,
  name,
  legal_name,
  email,
  timezone,
  tenant_type
)
values (
  '10000000-0000-4000-8000-000000000001',
  'CliniControl Demo 1',
  'CliniControl Demo 1',
  'demo1@clinicontrol.local',
  'America/Mexico_City',
  'demo'
)
on conflict (id) do update
set
  name = excluded.name,
  legal_name = excluded.legal_name,
  email = excluded.email,
  timezone = excluded.timezone,
  tenant_type = excluded.tenant_type
where existing_tenant.tenant_type = 'demo';

commit;
