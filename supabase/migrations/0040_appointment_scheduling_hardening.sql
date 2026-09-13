-- Make authenticated appointment creation atomic and tenant-safe without bypassing authorization.
-- Existing rows are unchanged; configured working hours do not exist in the current product model.

create or replace function public.create_appointment_for_current_user(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid,
  p_title text,
  p_appointment_type text,
  p_location text,
  p_meeting_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table(appointment_id uuid, appointment_updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_appointment public.appointments%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.has_clinic_role(p_clinic_id, array['owner', 'doctor', 'admin'])
    or not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'Appointment creation is not allowed.' using errcode = '42501';
  end if;

  if p_patient_id is null or not exists (
    select 1 from public.patients patient
    where patient.clinic_id = p_clinic_id and patient.id = p_patient_id
  ) then
    raise exception 'Patient is unavailable.' using errcode = '22023';
  end if;

  if p_doctor_id is null or not exists (
    select 1 from public.clinic_members member
    where member.clinic_id = p_clinic_id
      and member.user_id = p_doctor_id
      and member.status = 'active'
      and member.role in ('owner', 'doctor')
  ) then
    raise exception 'Doctor is unavailable.' using errcode = '22023';
  end if;

  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 120
    or char_length(coalesce(p_appointment_type, '')) > 80
    or char_length(coalesce(p_location, '')) > 200
    or char_length(coalesce(p_meeting_url, '')) > 500
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Appointment input is invalid.' using errcode = '22023';
  end if;

  -- Serialize the authoritative conflict check for one clinic/professional pair.
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text || ':' || p_doctor_id::text, 0));

  if exists (
    select 1 from public.appointments appointment
    where appointment.clinic_id = p_clinic_id
      and appointment.doctor_id = p_doctor_id
      and appointment.status <> 'cancelled'
      and appointment.starts_at < p_ends_at
      and appointment.ends_at > p_starts_at
  ) then
    raise exception 'Appointment time conflict.' using errcode = '23P01';
  end if;

  insert into public.appointments (
    clinic_id, patient_id, doctor_id, title, appointment_type, location,
    meeting_url, starts_at, ends_at, status
  ) values (
    p_clinic_id, p_patient_id, p_doctor_id, btrim(p_title), nullif(btrim(p_appointment_type), ''),
    nullif(btrim(p_location), ''), nullif(btrim(p_meeting_url), ''), p_starts_at, p_ends_at, 'scheduled'
  ) returning * into v_appointment;

  appointment_id := v_appointment.id;
  appointment_updated_at := v_appointment.updated_at;
  return next;
end;
$$;

revoke all on function public.create_appointment_for_current_user(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz)
  from public, anon;
grant execute on function public.create_appointment_for_current_user(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz)
  to authenticated;

-- Client appointment creation must pass through the guarded RPC. Reads and
-- updates keep their existing grants and RLS policies.
revoke insert on table public.appointments from authenticated;

comment on function public.create_appointment_for_current_user(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz) is
  'Creates one scheduled appointment after explicit actor, tenant, patient, doctor, entitlement and serialized conflict checks.';
