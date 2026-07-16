-- Removes only the two deterministic demo tenants managed by this directory.

begin;

delete from public.clinics
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
)
and tenant_type = 'demo';

commit;
