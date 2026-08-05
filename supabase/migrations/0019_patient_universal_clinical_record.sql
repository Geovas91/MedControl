-- Phase 1: patient administrative registry and universal clinical record.
-- Patient payments remain in public.payments; this migration does not alter SaaS billing.

create type public.clinical_history_status as enum ('draft', 'pending', 'completed');
create type public.clinical_alert_type as enum ('allergy', 'active_condition', 'current_medication');
create type public.information_reliability as enum ('reliable', 'partially_reliable', 'unreliable', 'unknown');

alter table public.patients
  add column first_names text,
  add column paternal_surname text,
  add column maternal_surname text,
  add column gender_identity text,
  add column marital_status text,
  add column occupation text,
  add column education_level text,
  add column internal_identifier text,
  add column emergency_contact_relationship text,
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id),
  add column archived_at timestamptz;

update public.patients
set first_names = full_name,
    internal_identifier = 'PAC-' || upper(substr(md5(id::text), 1, 10))
where first_names is null or internal_identifier is null;

alter table public.patients
  alter column first_names set not null,
  alter column internal_identifier set not null,
  add constraint patients_internal_identifier_format check (internal_identifier ~ '^PAC-[A-Z0-9]{8,16}$'),
  add constraint patients_names_length check (
    char_length(first_names) between 1 and 120
    and (paternal_surname is null or char_length(paternal_surname) between 1 and 80)
    and (maternal_surname is null or char_length(maternal_surname) between 1 and 80)
  ),
  add constraint patients_clinic_id_id_unique unique (clinic_id, id),
  add constraint patients_clinic_internal_identifier_unique unique (clinic_id, internal_identifier);

create index patients_clinic_status_name_idx on public.patients(clinic_id, status, full_name, id)
  where archived_at is null;
create index patients_clinic_phone_idx on public.patients(clinic_id, phone) where phone is not null;
create index patients_clinic_email_lower_idx on public.patients(clinic_id, lower(email)) where email is not null;

create table public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  opened_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint clinical_records_clinic_patient_fk foreign key (clinic_id, patient_id)
    references public.patients(clinic_id, id) on delete restrict,
  constraint clinical_records_clinic_id_id_patient_id_unique unique (clinic_id, id, patient_id)
);

create unique index clinical_records_one_active_per_patient_idx
  on public.clinical_records(clinic_id, patient_id)
  where archived_at is null and status = 'active';

create table public.initial_clinical_histories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  clinical_record_id uuid not null,
  patient_id uuid not null,
  status public.clinical_history_status not null default 'draft',
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint initial_histories_record_patient_fk foreign key (clinic_id, clinical_record_id, patient_id)
    references public.clinical_records(clinic_id, id, patient_id) on delete restrict,
  constraint initial_histories_completion_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint initial_histories_clinic_id_id_unique unique (clinic_id, id)
);

create unique index initial_histories_one_active_per_record_idx
  on public.initial_clinical_histories(clinic_id, clinical_record_id)
  where archived_at is null;

create table public.clinical_history_identification (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  history_id uuid not null,
  information_provider_name text,
  information_provider_relationship text,
  information_reliability public.information_reliability not null default 'unknown',
  blood_type text,
  responsible_professional_id uuid references auth.users(id),
  opening_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint clinical_history_identification_history_fk foreign key (clinic_id, history_id)
    references public.initial_clinical_histories(clinic_id, id) on delete restrict,
  constraint clinical_history_identification_history_unique unique (history_id)
);

create table public.clinical_alerts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  clinical_record_id uuid not null,
  patient_id uuid not null,
  alert_type public.clinical_alert_type not null,
  name text not null check (char_length(trim(name)) between 1 and 240),
  details text,
  severity text,
  is_active boolean not null default true,
  recorded_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint clinical_alerts_record_patient_fk foreign key (clinic_id, clinical_record_id, patient_id)
    references public.clinical_records(clinic_id, id, patient_id) on delete restrict
);

create index clinical_alerts_active_record_idx
  on public.clinical_alerts(clinic_id, clinical_record_id, alert_type)
  where archived_at is null and is_active;

create table public.family_medical_histories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  history_id uuid not null,
  diabetes boolean,
  hypertension boolean,
  cardiovascular_disease boolean,
  cancer boolean,
  neurological_disease boolean,
  psychiatric_disorders boolean,
  hereditary_diseases boolean,
  details text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), archived_at timestamptz,
  foreign key (clinic_id, history_id) references public.initial_clinical_histories(clinic_id, id) on delete restrict,
  unique (history_id)
);

create table public.pathological_histories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  history_id uuid not null,
  chronic_diseases text,
  surgeries text,
  hospitalizations text,
  injuries text,
  transfusions text,
  relevant_infections text,
  disability text,
  mental_health_history text,
  other_history text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), archived_at timestamptz,
  foreign key (clinic_id, history_id) references public.initial_clinical_histories(clinic_id, id) on delete restrict,
  unique (history_id)
);

create table public.non_pathological_histories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  history_id uuid not null,
  diet text,
  physical_activity text,
  tobacco_use text,
  alcohol_use text,
  substance_use text,
  sleep text,
  hygiene text,
  housing text,
  vaccination text,
  other_history text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), archived_at timestamptz,
  foreign key (clinic_id, history_id) references public.initial_clinical_histories(clinic_id, id) on delete restrict,
  unique (history_id)
);

create table public.initial_clinical_assessments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  history_id uuid not null,
  chief_complaint text,
  present_illness text,
  clinical_observations text,
  initial_impression text,
  initial_plan text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), archived_at timestamptz,
  foreign key (clinic_id, history_id) references public.initial_clinical_histories(clinic_id, id) on delete restrict,
  unique (history_id)
);

create table public.vital_sign_measurements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  clinical_record_id uuid not null,
  patient_id uuid not null,
  measured_at timestamptz not null default now(),
  weight_kg numeric(6,2),
  height_cm numeric(6,2),
  bmi numeric(5,2) generated always as (
    case when weight_kg is not null and height_cm is not null and height_cm > 0
      then round(weight_kg / power(height_cm / 100.0, 2), 2) else null end
  ) stored,
  temperature_c numeric(4,1),
  systolic_mmhg smallint,
  diastolic_mmhg smallint,
  heart_rate_bpm smallint,
  respiratory_rate_bpm smallint,
  oxygen_saturation_percent numeric(5,2),
  capillary_glucose_mg_dl numeric(6,1),
  pain_scale smallint,
  notes text,
  outlier_justification text,
  recorded_by uuid not null references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  constraint vital_signs_record_patient_fk foreign key (clinic_id, clinical_record_id, patient_id)
    references public.clinical_records(clinic_id, id, patient_id) on delete restrict,
  constraint vital_signs_has_measurement check (num_nonnulls(weight_kg, height_cm, temperature_c, systolic_mmhg,
    diastolic_mmhg, heart_rate_bpm, respiratory_rate_bpm, oxygen_saturation_percent,
    capillary_glucose_mg_dl, pain_scale) > 0),
  constraint vital_signs_pain_scale check (pain_scale is null or pain_scale between 0 and 10),
  constraint vital_signs_positive_values check (
    (weight_kg is null or weight_kg > 0) and (height_cm is null or height_cm > 0)
    and (temperature_c is null or temperature_c > 0) and (systolic_mmhg is null or systolic_mmhg > 0)
    and (diastolic_mmhg is null or diastolic_mmhg > 0) and (heart_rate_bpm is null or heart_rate_bpm > 0)
    and (respiratory_rate_bpm is null or respiratory_rate_bpm > 0)
    and (oxygen_saturation_percent is null or oxygen_saturation_percent between 0 and 100)
    and (capillary_glucose_mg_dl is null or capillary_glucose_mg_dl > 0)
  ),
  constraint vital_signs_outlier_justification check (
    (coalesce(weight_kg between 0.2 and 500, true)
      and coalesce(height_cm between 20 and 250, true)
      and coalesce(temperature_c between 25 and 45, true)
      and coalesce(systolic_mmhg between 40 and 300, true)
      and coalesce(diastolic_mmhg between 20 and 200, true)
      and coalesce(heart_rate_bpm between 20 and 300, true)
      and coalesce(respiratory_rate_bpm between 4 and 100, true)
      and coalesce(capillary_glucose_mg_dl between 10 and 1000, true))
    or nullif(trim(outlier_justification), '') is not null
  )
);

create index vital_signs_record_measured_idx
  on public.vital_sign_measurements(clinic_id, clinical_record_id, measured_at desc)
  where voided_at is null;

create table public.clinical_change_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  actor_user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('created', 'updated', 'archived', 'voided', 'status_changed')),
  changed_fields text[] not null default '{}',
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index clinical_change_events_entity_idx
  on public.clinical_change_events(clinic_id, entity_type, entity_id, created_at desc);

create table public.specialty_modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.specialty_module_fields (
  id uuid primary key default gen_random_uuid(),
  specialty_module_id uuid not null references public.specialty_modules(id) on delete restrict,
  section_key text not null,
  field_key text not null,
  label text not null,
  data_type text not null check (data_type in ('text', 'long_text', 'boolean', 'integer', 'decimal', 'date', 'choice')),
  is_required boolean not null default false,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (specialty_module_id, section_key, field_key)
);

insert into public.specialty_modules(code, name) values
  ('general-medicine', 'Medicina general'), ('nutrition', 'Nutrición'),
  ('aesthetic-medicine', 'Medicina estética'), ('psychology', 'Psicología'),
  ('dentistry', 'Odontología'), ('gynecology', 'Ginecología'),
  ('pediatrics', 'Pediatría'), ('physiotherapy', 'Fisioterapia y rehabilitación');

create or replace function public.set_clinical_audit_fields()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
  else
    new.updated_by = auth.uid();
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.record_clinical_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old jsonb; v_new jsonb; v_action text; v_changed text[];
begin
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_new := to_jsonb(new);
  v_action := case when tg_op = 'INSERT' then 'created'
    when v_new ? 'voided_at' and (v_old->>'voided_at') is null and (v_new->>'voided_at') is not null then 'voided'
    when v_new ? 'archived_at' and (v_old->>'archived_at') is null and (v_new->>'archived_at') is not null then 'archived'
    when v_old->>'status' is distinct from v_new->>'status' then 'status_changed' else 'updated' end;
  select coalesce(array_agg(key order by key), '{}') into v_changed
  from jsonb_each(v_new) where v_old is null or v_old->key is distinct from v_new->key;
  insert into public.clinical_change_events(clinic_id, actor_user_id, entity_type, entity_id, action, changed_fields, previous_values, new_values)
  values (new.clinic_id, auth.uid(), tg_table_name, new.id, v_action, v_changed, v_old, v_new);
  return new;
end;
$$;

create or replace function public.prepare_patient_admin_fields()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.clinic_id is distinct from old.clinic_id then
    raise exception 'No se puede transferir un paciente entre clínicas.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.internal_identifier is distinct from old.internal_identifier then
    raise exception 'El identificador interno no se puede modificar.' using errcode = '22023';
  end if;
  new.first_names := coalesce(nullif(trim(new.first_names), ''), nullif(trim(new.full_name), ''));
  new.internal_identifier := coalesce(nullif(trim(new.internal_identifier), ''), 'PAC-' || upper(substr(md5(new.id::text), 1, 10)));
  new.full_name := coalesce(nullif(trim(concat_ws(' ', new.first_names, new.paternal_surname, new.maternal_surname)), ''), new.full_name);
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'clinical_records','initial_clinical_histories','clinical_history_identification','clinical_alerts',
    'family_medical_histories','pathological_histories','non_pathological_histories',
    'initial_clinical_assessments','vital_sign_measurements'
  ] loop
    execute format('create trigger %I_audit_fields before insert or update on public.%I for each row execute function public.set_clinical_audit_fields()', table_name, table_name);
    execute format('create trigger %I_change_event after insert or update on public.%I for each row execute function public.record_clinical_change()', table_name, table_name);
  end loop;
end $$;

create trigger patients_clinical_audit_fields before insert or update on public.patients
  for each row execute function public.set_clinical_audit_fields();
create trigger patients_prepare_admin_fields before insert or update on public.patients
  for each row execute function public.prepare_patient_admin_fields();
create trigger patients_clinical_change_event after insert or update on public.patients
  for each row execute function public.record_clinical_change();

-- Create the record and empty, structured history sections for existing patients without inventing clinical data.
insert into public.clinical_records(clinic_id, patient_id, created_by, created_at)
select p.clinic_id, p.id, p.created_by, p.created_at from public.patients p
where not exists (select 1 from public.clinical_records r where r.clinic_id = p.clinic_id and r.patient_id = p.id and r.archived_at is null);

insert into public.initial_clinical_histories(clinic_id, clinical_record_id, patient_id, created_by, created_at)
select r.clinic_id, r.id, r.patient_id, r.created_by, r.created_at from public.clinical_records r
where not exists (select 1 from public.initial_clinical_histories h where h.clinic_id = r.clinic_id and h.clinical_record_id = r.id and h.archived_at is null);

insert into public.clinical_history_identification(clinic_id, history_id, opening_date, created_by)
select h.clinic_id, h.id, h.opened_at::date, h.created_by from public.initial_clinical_histories h on conflict (history_id) do nothing;
insert into public.family_medical_histories(clinic_id, history_id, created_by)
select h.clinic_id, h.id, h.created_by from public.initial_clinical_histories h on conflict (history_id) do nothing;
insert into public.pathological_histories(clinic_id, history_id, other_history, created_by)
select h.clinic_id, h.id, nullif(p.relevant_history, ''), h.created_by
from public.initial_clinical_histories h join public.patients p on p.id = h.patient_id and p.clinic_id = h.clinic_id
on conflict (history_id) do nothing;
insert into public.non_pathological_histories(clinic_id, history_id, created_by)
select h.clinic_id, h.id, h.created_by from public.initial_clinical_histories h on conflict (history_id) do nothing;
insert into public.initial_clinical_assessments(clinic_id, history_id, created_by)
select h.clinic_id, h.id, h.created_by from public.initial_clinical_histories h on conflict (history_id) do nothing;
insert into public.clinical_alerts(clinic_id, clinical_record_id, patient_id, alert_type, name, created_by)
select r.clinic_id, r.id, r.patient_id, 'allergy', p.allergies, r.created_by
from public.clinical_records r join public.patients p on p.id = r.patient_id and p.clinic_id = r.clinic_id
where nullif(trim(p.allergies), '') is not null;
insert into public.clinical_alerts(clinic_id, clinical_record_id, patient_id, alert_type, name, created_by)
select r.clinic_id, r.id, r.patient_id, 'current_medication', p.current_medications, r.created_by
from public.clinical_records r join public.patients p on p.id = r.patient_id and p.clinic_id = r.clinic_id
where nullif(trim(p.current_medications), '') is not null;

create or replace function public.create_patient_with_record(
  p_clinic_id uuid,
  p_first_names text,
  p_paternal_surname text,
  p_maternal_surname text default null,
  p_date_of_birth date default null,
  p_sex text default null,
  p_gender_identity text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_marital_status text default null,
  p_occupation text default null,
  p_education_level text default null,
  p_status public.patient_status default 'active',
  p_emergency_contact_name text default null,
  p_emergency_contact_relationship text default null,
  p_emergency_contact_phone text default null,
  p_primary_doctor_id uuid default null
)
returns table(patient_id uuid, clinical_record_id uuid, initial_history_id uuid, internal_identifier text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid(); v_patient uuid := gen_random_uuid(); v_record uuid; v_history uuid;
  v_first text := regexp_replace(trim(coalesce(p_first_names, '')), '\s+', ' ', 'g');
  v_paternal text := regexp_replace(trim(coalesce(p_paternal_surname, '')), '\s+', ' ', 'g');
  v_maternal text := nullif(regexp_replace(trim(coalesce(p_maternal_surname, '')), '\s+', ' ', 'g'), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_identifier text;
begin
  if v_actor is null then raise exception 'Debes iniciar sesión.' using errcode = '42501'; end if;
  if not public.has_clinic_role(p_clinic_id, array['owner','admin','doctor','assistant']) then
    raise exception 'No tienes una membresía activa en la clínica.' using errcode = '42501';
  end if;
  if not public.clinic_has_write_entitlement(p_clinic_id) then
    raise exception 'La clínica no tiene permisos de escritura disponibles.' using errcode = '42501';
  end if;
  if v_first = '' or v_paternal = '' then raise exception 'Nombres y primer apellido son obligatorios.' using errcode = '22023'; end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date or p_date_of_birth < current_date - interval '120 years') then
    raise exception 'La fecha de nacimiento no es válida.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;
  if p_primary_doctor_id is not null and not exists (
    select 1 from public.clinic_members cm where cm.clinic_id = p_clinic_id and cm.user_id = p_primary_doctor_id
      and cm.status = 'active' and cm.role in ('owner','doctor')
  ) then raise exception 'El profesional responsable no pertenece a la clínica.' using errcode = '22023'; end if;
  if exists (
    select 1 from public.patients p where p.clinic_id = p_clinic_id and p.archived_at is null
      and lower(p.first_names) = lower(v_first) and lower(coalesce(p.paternal_surname,'')) = lower(v_paternal)
      and lower(coalesce(p.maternal_surname,'')) = lower(coalesce(v_maternal,''))
      and p.date_of_birth is not distinct from p_date_of_birth
      and ((v_email is not null and lower(p.email) = v_email) or (v_phone is not null and regexp_replace(coalesce(p.phone,''), '[^0-9+]', '', 'g') = v_phone))
  ) then raise exception 'Ya existe un paciente con el mismo nombre, fecha de nacimiento y contacto.' using errcode = '23505'; end if;
  v_identifier := 'PAC-' || upper(substr(md5(v_patient::text), 1, 10));
  insert into public.patients(id, clinic_id, primary_doctor_id, full_name, first_names, paternal_surname, maternal_surname,
    date_of_birth, sex, gender_identity, phone, email, address, marital_status, occupation, education_level,
    internal_identifier, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    status, created_by, updated_by)
  values (v_patient, p_clinic_id, p_primary_doctor_id, concat_ws(' ', v_first, v_paternal, v_maternal), v_first, v_paternal, v_maternal,
    p_date_of_birth, nullif(p_sex,''), nullif(trim(p_gender_identity),''), v_phone, v_email, nullif(trim(p_address),''),
    nullif(trim(p_marital_status),''), nullif(trim(p_occupation),''), nullif(trim(p_education_level),''),
    v_identifier, nullif(trim(p_emergency_contact_name),''), nullif(trim(p_emergency_contact_relationship),''),
    nullif(regexp_replace(coalesce(p_emergency_contact_phone,''), '[^0-9+]', '', 'g'),''), p_status, v_actor, v_actor);
  insert into public.clinical_records(clinic_id, patient_id, created_by) values (p_clinic_id, v_patient, v_actor) returning id into v_record;
  insert into public.initial_clinical_histories(clinic_id, clinical_record_id, patient_id, created_by)
    values (p_clinic_id, v_record, v_patient, v_actor) returning id into v_history;
  insert into public.clinical_history_identification(clinic_id, history_id, responsible_professional_id, created_by)
    values (p_clinic_id, v_history, p_primary_doctor_id, v_actor);
  insert into public.family_medical_histories(clinic_id, history_id, created_by) values (p_clinic_id, v_history, v_actor);
  insert into public.pathological_histories(clinic_id, history_id, created_by) values (p_clinic_id, v_history, v_actor);
  insert into public.non_pathological_histories(clinic_id, history_id, created_by) values (p_clinic_id, v_history, v_actor);
  insert into public.initial_clinical_assessments(clinic_id, history_id, created_by) values (p_clinic_id, v_history, v_actor);
  insert into public.audit_logs(clinic_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (p_clinic_id, v_actor, 'patient', v_patient, 'patient_and_record_created', jsonb_build_object('clinical_record_id', v_record, 'initial_history_id', v_history));
  return query select v_patient, v_record, v_history, v_identifier;
end;
$$;

alter table public.clinical_records enable row level security;
alter table public.initial_clinical_histories enable row level security;
alter table public.clinical_history_identification enable row level security;
alter table public.clinical_alerts enable row level security;
alter table public.family_medical_histories enable row level security;
alter table public.pathological_histories enable row level security;
alter table public.non_pathological_histories enable row level security;
alter table public.initial_clinical_assessments enable row level security;
alter table public.vital_sign_measurements enable row level security;
alter table public.clinical_change_events enable row level security;
alter table public.specialty_modules enable row level security;
alter table public.specialty_module_fields enable row level security;

grant select, insert, update on table public.clinical_records, public.initial_clinical_histories,
  public.clinical_history_identification, public.clinical_alerts, public.family_medical_histories,
  public.pathological_histories, public.non_pathological_histories, public.initial_clinical_assessments,
  public.vital_sign_measurements to authenticated;
grant select on table public.clinical_change_events, public.specialty_modules, public.specialty_module_fields to authenticated;
-- Explicit grants required by PostgREST; existing RLS policies remain the authorization boundary.
grant select on table public.profiles, public.clinics, public.clinic_members, public.clinic_subscriptions,
  public.doctor_public_profiles to authenticated;
grant select on table public.appointments, public.payments, public.medical_notes, public.consents,
  public.consent_signatures, public.medical_note_templates to authenticated;
revoke select, insert, update, delete on table public.patients from authenticated;
grant select (id, clinic_id, primary_doctor_id, full_name, first_names, paternal_surname, maternal_surname,
  date_of_birth, sex, gender_identity, phone, email, address, marital_status, occupation, education_level,
  internal_identifier, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
  status, created_by, created_at, updated_by, updated_at, archived_at) on public.patients to authenticated;
grant update (primary_doctor_id, full_name, first_names, paternal_surname, maternal_surname,
  date_of_birth, sex, gender_identity, phone, email, address, marital_status, occupation, education_level,
  emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, status, updated_by, updated_at)
  on public.patients to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'clinical_records','initial_clinical_histories','clinical_history_identification','clinical_alerts',
    'family_medical_histories','pathological_histories','non_pathological_histories',
    'initial_clinical_assessments','vital_sign_measurements'
  ] loop
    execute format('create policy "Clinical roles can read %1$s" on public.%1$I for select using (public.has_clinic_role(clinic_id, array[''owner'',''admin'',''doctor'']))', table_name);
    execute format('create policy "Clinical roles can insert %1$s" on public.%1$I for insert with check (public.has_clinic_role(clinic_id, array[''owner'',''admin'',''doctor'']) and public.clinic_has_write_entitlement(clinic_id))', table_name);
    execute format('create policy "Clinical roles can update %1$s" on public.%1$I for update using (public.has_clinic_role(clinic_id, array[''owner'',''admin'',''doctor''])) with check (public.has_clinic_role(clinic_id, array[''owner'',''admin'',''doctor'']) and public.clinic_has_write_entitlement(clinic_id))', table_name);
  end loop;
end $$;

create policy "Clinical roles can read clinical change events" on public.clinical_change_events for select
  using (public.has_clinic_role(clinic_id, array['owner','admin','doctor']));
create policy "Authenticated users can read specialty modules" on public.specialty_modules for select to authenticated using (true);
create policy "Authenticated users can read specialty fields" on public.specialty_module_fields for select to authenticated using (true);

create or replace function public.save_initial_clinical_history(
  p_clinic_id uuid, p_patient_id uuid, p_status public.clinical_history_status,
  p_information_provider_name text default null, p_information_provider_relationship text default null,
  p_information_reliability public.information_reliability default 'unknown', p_responsible_professional_id uuid default null,
  p_blood_type text default null, p_allergies text[] default '{}', p_active_conditions text[] default '{}', p_current_medications text[] default '{}',
  p_family_diabetes boolean default null, p_family_hypertension boolean default null, p_family_cardiovascular boolean default null,
  p_family_cancer boolean default null, p_family_neurological boolean default null, p_family_psychiatric boolean default null,
  p_family_hereditary boolean default null, p_family_details text default null,
  p_chronic_diseases text default null, p_surgeries text default null, p_hospitalizations text default null, p_injuries text default null,
  p_transfusions text default null, p_relevant_infections text default null, p_disability text default null, p_mental_health_history text default null, p_pathological_other text default null,
  p_diet text default null, p_physical_activity text default null, p_tobacco_use text default null, p_alcohol_use text default null, p_substance_use text default null,
  p_sleep text default null, p_hygiene text default null, p_housing text default null, p_vaccination text default null, p_non_pathological_other text default null,
  p_chief_complaint text default null, p_present_illness text default null, p_clinical_observations text default null,
  p_initial_impression text default null, p_initial_plan text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_record uuid; v_history uuid; v_value text;
begin
  if v_actor is null or not public.has_clinic_role(p_clinic_id, array['owner','admin','doctor']) then
    raise exception 'No tienes permiso para modificar la historia clínica.' using errcode = '42501';
  end if;
  if not public.clinic_has_write_entitlement(p_clinic_id) then raise exception 'La clínica no tiene permisos de escritura disponibles.' using errcode = '42501'; end if;
  select r.id, h.id into v_record, v_history
  from public.clinical_records r join public.initial_clinical_histories h on h.clinic_id = r.clinic_id and h.clinical_record_id = r.id
  where r.clinic_id = p_clinic_id and r.patient_id = p_patient_id and r.status = 'active' and r.archived_at is null and h.archived_at is null
  for update of h;
  if v_history is null then raise exception 'El expediente clínico no está disponible.' using errcode = 'P0002'; end if;
  if p_responsible_professional_id is not null and not exists (
    select 1 from public.clinic_members cm where cm.clinic_id = p_clinic_id and cm.user_id = p_responsible_professional_id
      and cm.status = 'active' and cm.role in ('owner','doctor')
  ) then raise exception 'El profesional responsable no pertenece a la clínica.' using errcode = '22023'; end if;

  update public.initial_clinical_histories set status = p_status,
    completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else null end
  where id = v_history and clinic_id = p_clinic_id;
  update public.clinical_history_identification set information_provider_name = nullif(trim(p_information_provider_name),''),
    information_provider_relationship = nullif(trim(p_information_provider_relationship),''), information_reliability = p_information_reliability,
    blood_type = nullif(trim(p_blood_type),''),
    responsible_professional_id = p_responsible_professional_id
  where history_id = v_history and clinic_id = p_clinic_id;
  update public.family_medical_histories set diabetes=p_family_diabetes, hypertension=p_family_hypertension,
    cardiovascular_disease=p_family_cardiovascular, cancer=p_family_cancer, neurological_disease=p_family_neurological,
    psychiatric_disorders=p_family_psychiatric, hereditary_diseases=p_family_hereditary, details=nullif(trim(p_family_details),'')
  where history_id=v_history and clinic_id=p_clinic_id;
  update public.pathological_histories set chronic_diseases=nullif(trim(p_chronic_diseases),''), surgeries=nullif(trim(p_surgeries),''),
    hospitalizations=nullif(trim(p_hospitalizations),''), injuries=nullif(trim(p_injuries),''), transfusions=nullif(trim(p_transfusions),''),
    relevant_infections=nullif(trim(p_relevant_infections),''), disability=nullif(trim(p_disability),''),
    mental_health_history=nullif(trim(p_mental_health_history),''), other_history=nullif(trim(p_pathological_other),'')
  where history_id=v_history and clinic_id=p_clinic_id;
  update public.non_pathological_histories set diet=nullif(trim(p_diet),''), physical_activity=nullif(trim(p_physical_activity),''),
    tobacco_use=nullif(trim(p_tobacco_use),''), alcohol_use=nullif(trim(p_alcohol_use),''), substance_use=nullif(trim(p_substance_use),''),
    sleep=nullif(trim(p_sleep),''), hygiene=nullif(trim(p_hygiene),''), housing=nullif(trim(p_housing),''),
    vaccination=nullif(trim(p_vaccination),''), other_history=nullif(trim(p_non_pathological_other),'')
  where history_id=v_history and clinic_id=p_clinic_id;
  update public.initial_clinical_assessments set chief_complaint=nullif(trim(p_chief_complaint),''), present_illness=nullif(trim(p_present_illness),''),
    clinical_observations=nullif(trim(p_clinical_observations),''), initial_impression=nullif(trim(p_initial_impression),''), initial_plan=nullif(trim(p_initial_plan),'')
  where history_id=v_history and clinic_id=p_clinic_id;

  update public.clinical_alerts set archived_at=now(), is_active=false
  where clinic_id=p_clinic_id and clinical_record_id=v_record and archived_at is null and alert_type in ('allergy','active_condition','current_medication');
  foreach v_value in array coalesce(p_allergies,'{}') loop if nullif(trim(v_value),'') is not null then
    insert into public.clinical_alerts(clinic_id,clinical_record_id,patient_id,alert_type,name,recorded_by,created_by)
    values(p_clinic_id,v_record,p_patient_id,'allergy',trim(v_value),v_actor,v_actor); end if; end loop;
  foreach v_value in array coalesce(p_active_conditions,'{}') loop if nullif(trim(v_value),'') is not null then
    insert into public.clinical_alerts(clinic_id,clinical_record_id,patient_id,alert_type,name,recorded_by,created_by)
    values(p_clinic_id,v_record,p_patient_id,'active_condition',trim(v_value),v_actor,v_actor); end if; end loop;
  foreach v_value in array coalesce(p_current_medications,'{}') loop if nullif(trim(v_value),'') is not null then
    insert into public.clinical_alerts(clinic_id,clinical_record_id,patient_id,alert_type,name,recorded_by,created_by)
    values(p_clinic_id,v_record,p_patient_id,'current_medication',trim(v_value),v_actor,v_actor); end if; end loop;
  return v_history;
end;
$$;

drop policy if exists "Scheduling and clinical roles can read patients" on public.patients;
create policy "Active clinic members can read patients" on public.patients for select
  using (archived_at is null and public.has_clinic_role(clinic_id, array['owner','admin','doctor','assistant']));
drop policy if exists "Doctors and admins can insert patients" on public.patients;
-- No authenticated INSERT policy: all patient creation must use create_patient_with_record so the record/history are atomic.
drop policy if exists "Doctors and admins can update patients" on public.patients;
create policy "Active clinic members can update patients" on public.patients for update
  using (public.has_clinic_role(clinic_id, array['owner','admin','doctor','assistant']))
  with check (public.has_clinic_role(clinic_id, array['owner','admin','doctor','assistant']) and public.clinic_has_write_entitlement(clinic_id));

revoke all on function public.create_patient_with_record(uuid,text,text,text,date,text,text,text,text,text,text,text,text,public.patient_status,text,text,text,uuid) from public;
grant execute on function public.create_patient_with_record(uuid,text,text,text,date,text,text,text,text,text,text,text,text,public.patient_status,text,text,text,uuid) to authenticated;
do $$
declare v_signature regprocedure;
begin
  select p.oid::regprocedure into v_signature
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_initial_clinical_history';
  execute format('revoke all on function %s from public', v_signature);
  execute format('grant execute on function %s to authenticated', v_signature);
end $$;

comment on table public.specialty_module_fields is
  'Extensible field definitions only. Future specialty answers must use typed, row-based response tables rather than one JSON document.';
