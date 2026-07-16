-- Removes only the deterministic demo1 tenant managed by this directory.

begin;

delete from public.clinics
where id = '10000000-0000-4000-8000-000000000001'
and tenant_type = 'demo';

commit;
