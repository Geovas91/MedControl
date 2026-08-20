create or replace function public.list_patient_audit_timeline_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_limit integer default 50
)
returns table (
  event_id uuid,
  event_source text,
  action text,
  resource_type text,
  related_consent_id uuid,
  actor_name text,
  occurred_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with authorized_patient as (
    select patient.id
    from public.patients as patient
    where patient.clinic_id = p_clinic_id
      and patient.id = p_patient_id
      and public.has_clinic_role(p_clinic_id, array['owner', 'admin'])
  ),
  patient_resources as (
    select 'patients'::text as resource_type, patient.id as resource_id
    from authorized_patient as patient
    union all
    select 'clinical_records', record.id
    from public.clinical_records as record
    join authorized_patient as patient on patient.id = record.patient_id
    where record.clinic_id = p_clinic_id
    union all
    select 'initial_clinical_histories', history.id
    from public.initial_clinical_histories as history
    join authorized_patient as patient on patient.id = history.patient_id
    where history.clinic_id = p_clinic_id
    union all
    select 'clinical_history_identification', identification.id
    from public.clinical_history_identification as identification
    join public.initial_clinical_histories as history
      on history.clinic_id = identification.clinic_id and history.id = identification.history_id
    join authorized_patient as patient on patient.id = history.patient_id
    where identification.clinic_id = p_clinic_id
    union all
    select 'family_medical_histories', family.id
    from public.family_medical_histories as family
    join public.initial_clinical_histories as history
      on history.clinic_id = family.clinic_id and history.id = family.history_id
    join authorized_patient as patient on patient.id = history.patient_id
    where family.clinic_id = p_clinic_id
    union all
    select 'pathological_histories', pathological.id
    from public.pathological_histories as pathological
    join public.initial_clinical_histories as history
      on history.clinic_id = pathological.clinic_id and history.id = pathological.history_id
    join authorized_patient as patient on patient.id = history.patient_id
    where pathological.clinic_id = p_clinic_id
    union all
    select 'non_pathological_histories', non_pathological.id
    from public.non_pathological_histories as non_pathological
    join public.initial_clinical_histories as history
      on history.clinic_id = non_pathological.clinic_id and history.id = non_pathological.history_id
    join authorized_patient as patient on patient.id = history.patient_id
    where non_pathological.clinic_id = p_clinic_id
    union all
    select 'initial_clinical_assessments', assessment.id
    from public.initial_clinical_assessments as assessment
    join public.initial_clinical_histories as history
      on history.clinic_id = assessment.clinic_id and history.id = assessment.history_id
    join authorized_patient as patient on patient.id = history.patient_id
    where assessment.clinic_id = p_clinic_id
    union all
    select 'clinical_alerts', alert.id
    from public.clinical_alerts as alert
    join authorized_patient as patient on patient.id = alert.patient_id
    where alert.clinic_id = p_clinic_id
    union all
    select 'vital_sign_measurements', vital.id
    from public.vital_sign_measurements as vital
    join authorized_patient as patient on patient.id = vital.patient_id
    where vital.clinic_id = p_clinic_id
  ),
  safe_events as (
    select
      log.id as event_id,
      'audit_log'::text as event_source,
      log.action,
      log.entity_type as resource_type,
      log.entity_id as resource_id,
      case
        when log.entity_type = 'consent' then log.entity_id
        when log.entity_type = 'consent_document' then document.consent_id
        else null
      end as related_consent_id,
      log.actor_user_id,
      log.created_at as occurred_at
    from public.audit_logs as log
    join authorized_patient as patient on true
    left join public.consent_documents as document
      on log.entity_type = 'consent_document'
      and document.clinic_id = p_clinic_id
      and document.patient_id = patient.id
      and document.id = log.entity_id
    where log.clinic_id = p_clinic_id
      and (
        (log.entity_type = 'patient' and log.entity_id = patient.id)
        or (
          log.entity_type = 'consent'
          and exists (
            select 1 from public.consents as consent
            where consent.clinic_id = p_clinic_id
              and consent.patient_id = patient.id
              and consent.id = log.entity_id
          )
        )
        or (log.entity_type = 'consent_document' and document.id is not null)
      )
    union all
    select
      change.id,
      'clinical_change'::text,
      change.action,
      change.entity_type,
      change.entity_id,
      null::uuid,
      change.actor_user_id,
      change.created_at
    from public.clinical_change_events as change
    join patient_resources as resource
      on resource.resource_type = change.entity_type
      and resource.resource_id = change.entity_id
    where change.clinic_id = p_clinic_id
  )
  select
    event.event_id,
    event.event_source,
    event.action,
    event.resource_type,
    event.related_consent_id,
    (
      select profile.full_name
      from public.clinic_members as member
      join public.profiles as profile on profile.id = member.user_id
      where member.clinic_id = p_clinic_id
        and member.user_id = event.actor_user_id
      order by (member.status = 'active') desc, member.created_at desc
      limit 1
    ) as actor_name,
    event.occurred_at
  from safe_events as event
  order by event.occurred_at desc, event.event_id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.list_patient_audit_timeline_for_current_user(uuid, uuid, integer)
  from public, anon;
grant execute on function public.list_patient_audit_timeline_for_current_user(uuid, uuid, integer)
  to authenticated;

comment on function public.list_patient_audit_timeline_for_current_user(uuid, uuid, integer) is
  'Owner/admin-only patient audit projection. It returns presentation-safe fields and never exposes audit metadata or clinical before/after payloads.';
