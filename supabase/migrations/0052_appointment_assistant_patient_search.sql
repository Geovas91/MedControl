-- Appointment Assistant: exact, read-only patient/professional eligibility at proposal time.
create function public.is_patient_eligible_for_scheduling(
  p_clinic_id uuid,
  p_professional_clinic_member_id uuid,
  p_patient_id uuid
)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_actor_role public.clinic_member_role;
begin
  if v_actor_id is null then
    raise exception 'Scheduling patient eligibility is not allowed.' using errcode = '42501';
  end if;
  select member.id, member.role into v_actor_member_id, v_actor_role
  from public.clinic_members member
  where member.clinic_id = p_clinic_id and member.user_id = v_actor_id and member.status = 'active';
  if v_actor_member_id is null or v_actor_role not in ('owner', 'admin', 'assistant', 'doctor') then
    raise exception 'Scheduling patient eligibility is not allowed.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_members professional
    where professional.id = p_professional_clinic_member_id
      and professional.clinic_id = p_clinic_id
      and professional.status = 'active'
      and professional.is_professional
  ) or (v_actor_role = 'doctor' and v_actor_member_id <> p_professional_clinic_member_id) then
    raise exception 'Scheduling patient eligibility is not allowed.' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.patients patient
    where patient.id = p_patient_id and patient.clinic_id = p_clinic_id
      and patient.status = 'active' and patient.archived_at is null
      and (
        exists (
          select 1 from public.patient_professional_assignments assignment
          where assignment.clinic_id = p_clinic_id
            and assignment.patient_id = patient.id
            and assignment.clinic_member_id = p_professional_clinic_member_id
            and assignment.is_active
        )
        or (v_actor_role in ('owner', 'admin', 'assistant') and not exists (
          select 1 from public.patient_professional_assignments assignment
          where assignment.clinic_id = p_clinic_id
            and assignment.patient_id = patient.id
            and assignment.is_active
        ))
      )
  );
end;
$$;

revoke all on function public.is_patient_eligible_for_scheduling(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_patient_eligible_for_scheduling(uuid, uuid, uuid) to authenticated;

-- Appointment Assistant: a clinic-scoped name search for one selected professional.
-- Assignment history remains private; only eligible patient references and names leave this RPC.
create function public.search_patient_names_for_scheduling(
  p_clinic_id uuid,
  p_professional_clinic_member_id uuid,
  p_query text,
  p_limit integer default 9
)
returns table(patient_id uuid, display_name text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_actor_role public.clinic_member_role;
  v_query text := regexp_replace(btrim(p_query), '[[:space:]]+', ' ', 'g');
begin
  if v_actor_id is null then
    raise exception 'Scheduling patient search is not allowed.' using errcode = '42501';
  end if;

  select member.id, member.role into v_actor_member_id, v_actor_role
  from public.clinic_members member
  where member.clinic_id = p_clinic_id and member.user_id = v_actor_id and member.status = 'active';
  if v_actor_member_id is null or v_actor_role not in ('owner', 'admin', 'assistant', 'doctor') then
    raise exception 'Scheduling patient search is not allowed.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_members professional
    where professional.id = p_professional_clinic_member_id
      and professional.clinic_id = p_clinic_id
      and professional.status = 'active'
      and professional.is_professional
  ) or (v_actor_role = 'doctor' and v_actor_member_id <> p_professional_clinic_member_id) then
    raise exception 'Scheduling patient search is not allowed.' using errcode = '42501';
  end if;
  if v_query is null or char_length(v_query) < 2 or char_length(v_query) > 80
    or v_query ~ '[[:cntrl:]]' or position('%' in v_query) > 0
    or position('_' in v_query) > 0 or position(chr(92) in v_query) > 0 then
    raise exception 'Scheduling patient search query is invalid.' using errcode = '22023';
  end if;

  return query
  select patient.id, patient.full_name
  from public.patients patient
  where patient.clinic_id = p_clinic_id and patient.status = 'active' and patient.archived_at is null
    and not exists (
      select 1 from unnest(string_to_array(v_query, ' ')) as term(value)
      where patient.full_name not ilike '%' || term.value || '%'
    )
    and (
      exists (
        select 1 from public.patient_professional_assignments assignment
        where assignment.clinic_id = p_clinic_id
          and assignment.patient_id = patient.id
          and assignment.clinic_member_id = p_professional_clinic_member_id
          and assignment.is_active
      )
      or (v_actor_role in ('owner', 'admin', 'assistant') and not exists (
        select 1 from public.patient_professional_assignments assignment
        where assignment.clinic_id = p_clinic_id
          and assignment.patient_id = patient.id
          and assignment.is_active
      ))
    )
  order by lower(patient.full_name), patient.id
  limit least(greatest(coalesce(p_limit, 9), 1), 9);
end;
$$;

revoke all on function public.search_patient_names_for_scheduling(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_patient_names_for_scheduling(uuid, uuid, text, integer) to authenticated;
