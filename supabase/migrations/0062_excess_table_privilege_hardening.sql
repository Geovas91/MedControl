-- RLS does not protect TRUNCATE or authorize client-side DDL. These 23
-- audited tables need no client TRUNCATE, TRIGGER or REFERENCES privileges.
-- Revoking REFERENCES does not remove or alter existing foreign keys;
-- revoking TRIGGER does not disable existing triggers.
-- Preserve CRUD, policies, trusted service_role and database-owner grants.
-- Future-table default privileges are a separate audit/deployment concern.
begin;

revoke truncate, trigger, references on table
  public.appointment_invites,
  public.clinic_members,
  public.clinic_onboarding_acceptances,
  public.clinic_subscriptions,
  public.clinical_alerts,
  public.clinical_change_events,
  public.clinical_history_identification,
  public.clinical_records,
  public.clinics,
  public.doctor_public_profiles,
  public.family_medical_histories,
  public.initial_clinical_assessments,
  public.initial_clinical_histories,
  public.non_pathological_histories,
  public.pathological_histories,
  public.patients,
  public.platform_admins,
  public.professional_availability_exceptions,
  public.professional_availability_rules,
  public.profiles,
  public.specialty_module_fields,
  public.specialty_modules,
  public.vital_sign_measurements
from public, anon, authenticated;

commit;
