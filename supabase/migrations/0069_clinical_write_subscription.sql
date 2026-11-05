-- Keep the write boundary at the row, including SECURITY DEFINER RPCs.
-- Reads and billing transitions retain their existing authorization.
create function public.enforce_clinical_write_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinic_ids uuid[];
  target_clinic uuid;
  subscription public.clinic_subscriptions%rowtype;
begin
  if tg_op = 'INSERT' then
    clinic_ids := array[new.clinic_id];
  elsif tg_op = 'DELETE' or old.clinic_id is not distinct from new.clinic_id then
    clinic_ids := array[old.clinic_id];
  else
    clinic_ids := array[old.clinic_id, new.clinic_id];
  end if;

  foreach target_clinic in array clinic_ids loop
    -- System templates are global. Their existing authorization still applies.
    if target_clinic is null and tg_table_name = 'medical_note_templates' then
      continue;
    end if;

    -- INSERT triggers can run before the RLS WITH CHECK expression.
    -- Do not let the trigger reveal subscription state to another clinic.
    if auth.uid() is not null and not exists (
      select 1 from public.clinic_members m
      where m.clinic_id = target_clinic and m.user_id = auth.uid() and m.status = 'active'
    ) then
      raise exception using errcode = '42501', message = 'clinical_workspace_read_only';
    end if;

    select s.* into subscription
    from public.clinic_subscriptions s
    where s.clinic_id = target_clinic
    for share;

    if not found or not (
      subscription.status = 'active'
      or (subscription.status = 'trialing' and subscription.current_period_end is not null
        and subscription.current_period_end > clock_timestamp())
    ) then
      raise exception using errcode = '42501', message = 'clinical_workspace_read_only';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_clinical_write_subscription() from public, anon, authenticated, service_role;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'patients', 'appointments', 'payments', 'medical_note_templates',
    'medical_notes', 'consents', 'consent_signatures',
    'clinical_records', 'initial_clinical_histories', 'clinical_history_identification',
    'clinical_alerts', 'family_medical_histories', 'pathological_histories',
    'non_pathological_histories', 'initial_clinical_assessments', 'vital_sign_measurements',
    'consent_signed_snapshots', 'consent_documents', 'appointment_invites',
    'review_invitations', 'doctor_reviews', 'patient_communication_preferences',
    'professional_availability_rules', 'professional_availability_exceptions',
    'patient_professional_assignments'
  ] loop
    -- Validate the trigger contract when applying the migration.
    execute format('select clinic_id from public.%I where false', relation_name);
    execute format(
      'create trigger enforce_clinical_write_subscription before insert or update or delete on public.%I
       for each row execute function public.enforce_clinical_write_subscription()', relation_name
    );
  end loop;
end;
$$;
