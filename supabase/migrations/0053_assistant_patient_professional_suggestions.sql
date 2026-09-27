-- Read-only, patient-scoped professional suggestions for Appointment Assistant.
-- The exact pair is still revalidated by 0052 before Proposal and Confirm.
create function public.list_patient_eligible_professionals_for_scheduling(
  p_clinic_id uuid,
  p_patient_id uuid
)
returns table(professional_clinic_member_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_actor_role public.clinic_member_role;
begin
  if v_actor_id is null then
    raise exception 'Scheduling professional lookup is not allowed.' using errcode = '42501';
  end if;

  select member.id, member.role into v_actor_member_id, v_actor_role
  from public.clinic_members member
  where member.clinic_id = p_clinic_id and member.user_id = v_actor_id and member.status = 'active';
  if v_actor_member_id is null or v_actor_role not in ('owner', 'admin', 'assistant', 'doctor') then
    raise exception 'Scheduling professional lookup is not allowed.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients patient
    where patient.id = p_patient_id and patient.clinic_id = p_clinic_id
      and patient.status = 'active' and patient.archived_at is null
  ) then
    return;
  end if;

  return query
  select professional.id
  from public.clinic_members professional
  where professional.clinic_id = p_clinic_id
    and professional.status = 'active' and professional.is_professional
    and (
      (v_actor_role = 'doctor' and professional.id = v_actor_member_id and exists (
        select 1 from public.patient_professional_assignments assignment
        where assignment.clinic_id = p_clinic_id and assignment.patient_id = p_patient_id
          and assignment.clinic_member_id = professional.id and assignment.is_active
      ))
      or (v_actor_role in ('owner', 'admin', 'assistant') and (
        exists (
          select 1 from public.patient_professional_assignments assignment
          where assignment.clinic_id = p_clinic_id and assignment.patient_id = p_patient_id
            and assignment.clinic_member_id = professional.id and assignment.is_active
        )
        or not exists (
          select 1 from public.patient_professional_assignments assignment
          where assignment.clinic_id = p_clinic_id and assignment.patient_id = p_patient_id
            and assignment.is_active
        )
      ))
    )
  order by professional.id;
end;
$$;

revoke all on function public.list_patient_eligible_professionals_for_scheduling(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_patient_eligible_professionals_for_scheduling(uuid, uuid) to authenticated;
