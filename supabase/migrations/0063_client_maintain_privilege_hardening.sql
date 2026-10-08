-- MAINTAIN permits database maintenance; application clients do not need it.
-- Revoke only MAINTAIN on the 25 audited public tables. Preserve CRUD,
-- column privileges, 0061/0062 restrictions, RLS, FKs, triggers and data.
-- Trusted service_role and owners retain their maintenance capabilities.
-- Future-table default privileges are intentionally out of scope.
begin;

revoke maintain on table
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
  public.medical_note_templates,
  public.non_pathological_histories,
  public.pathological_histories,
  public.patients,
  public.payments,
  public.platform_admins,
  public.professional_availability_exceptions,
  public.professional_availability_rules,
  public.profiles,
  public.specialty_module_fields,
  public.specialty_modules,
  public.vital_sign_measurements
from public, anon, authenticated;

commit;
