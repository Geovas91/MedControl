-- Removes only the deterministic demo2 QA tenant managed by this directory.

begin;

delete from public.clinics
where id = '10000000-0000-4000-8000-000000000002'
and tenant_type = 'qa';

commit;
