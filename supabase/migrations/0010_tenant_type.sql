-- Classifies clinics by operational tenant purpose without changing access control.

create type public.tenant_type as enum (
  'customer',
  'demo',
  'qa',
  'internal',
  'development'
);

alter table public.clinics
  add column tenant_type public.tenant_type default 'customer' not null;

create index clinics_tenant_type_idx on public.clinics(tenant_type);

comment on column public.clinics.tenant_type is
  'Operational tenant classification. This value is not an authorization boundary and does not replace RLS.';
