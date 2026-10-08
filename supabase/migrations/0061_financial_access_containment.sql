-- Temporary containment: payments have no stable professional attribution yet.
-- Keep owner/admin reads independent of subscription state; existing write
-- policies retain their entitlement checks. No payment data or FKs are changed.
begin;

-- Unexpected permissive policies must not silently defeat this restriction.
do $$
begin
  if exists (
    select 1 from pg_policy
    where polrelid = 'public.payments'::regclass
      and polcmd in ('r', '*')
      and polname <> 'Owners admins and doctors can read payments'
  ) then
    raise exception 'Unexpected payments read policy; financial containment requires review.';
  end if;
end;
$$;

drop policy "Owners admins and doctors can read payments" on public.payments;
create policy "Owners and admins can read payments" on public.payments
  for select to authenticated
  using (public.has_clinic_role(clinic_id, array['owner', 'admin']));

-- RLS cannot protect TRUNCATE. Preserve ordinary application privileges,
-- template policies, and trusted service_role/database-owner authority.
revoke truncate, trigger, references on table public.payments,
  public.medical_note_templates from public, anon, authenticated;

commit;
