-- Removes only demo1 when its deterministic UUID and tenant type both match.
-- Existing foreign keys cascade its clinic membership and subscription records.

begin;

delete from public.clinics
where id = '10000000-0000-4000-8000-000000000001'
and tenant_type = 'demo';

commit;
