-- B5.2: durable, actor-bound proposals for the Appointment Assistant.
-- The authority is the closed tool name plus validated minimal arguments; prompts and display text are never stored.

create table public.assistant_pending_actions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  actor_clinic_member_id uuid not null references public.clinic_members(id) on delete restrict,
  tool_name text not null check (tool_name in ('create_appointment','confirm_appointment','reschedule_appointment','cancel_appointment')),
  validated_arguments jsonb not null check (jsonb_typeof(validated_arguments) = 'object'),
  status text not null default 'pending' check (status in ('pending','claimed','executed','failed','expired','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  executed_at timestamptz,
  failed_at timestamptz,
  error_code text,
  constraint assistant_pending_actions_expiry_check check (expires_at > created_at),
  constraint assistant_pending_actions_member_tenant_fkey foreign key (clinic_id, actor_clinic_member_id)
    references public.clinic_members(clinic_id, id) on delete restrict,
  constraint assistant_pending_actions_lifecycle_check check (
    (status = 'pending' and claimed_at is null and executed_at is null and failed_at is null and error_code is null)
    or (status = 'claimed' and claimed_at is not null and executed_at is null and failed_at is null)
    or (status = 'executed' and claimed_at is not null and executed_at is not null and failed_at is null and error_code is null)
    or (status = 'failed' and claimed_at is not null and executed_at is null and failed_at is not null and error_code is not null)
    or (status = 'expired' and executed_at is null and failed_at is null)
    or (status = 'cancelled' and claimed_at is null and executed_at is null and failed_at is null)
  )
);

create index assistant_pending_actions_actor_idx on public.assistant_pending_actions (actor_user_id, clinic_id, created_at desc);
create index assistant_pending_actions_expiry_idx on public.assistant_pending_actions (status, expires_at) where status = 'pending';

alter table public.assistant_pending_actions enable row level security;
revoke all on table public.assistant_pending_actions from public, anon, authenticated;
grant select on table public.assistant_pending_actions to authenticated;
create policy "Actors can read own assistant proposals in their active clinic"
  on public.assistant_pending_actions for select
  using (
    actor_user_id = auth.uid()
    and public.has_clinic_role(clinic_id, array['owner','admin','doctor','assistant'])
  );

create or replace function public.create_assistant_pending_action_for_current_user(
  p_clinic_id uuid, p_tool_name text, p_validated_arguments jsonb, p_expires_at timestamptz
)
returns table(id uuid, tool_name text, expires_at timestamptz, status text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_member public.clinic_members%rowtype; v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_member from public.clinic_members member where member.clinic_id=p_clinic_id and member.user_id=v_actor and member.status='active';
  if not found or v_member.role not in ('owner','admin','doctor','assistant') then raise exception 'Assistant action is not allowed.' using errcode='42501'; end if;
  if p_tool_name not in ('create_appointment','confirm_appointment','reschedule_appointment','cancel_appointment')
    or jsonb_typeof(p_validated_arguments) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_validated_arguments) as key where key not in ('appointment_id','patient_id','professional_id','local_date','local_time','duration_minutes','expected_status'))
    or p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then
    raise exception 'Invalid assistant proposal.' using errcode='22023';
  end if;
  insert into public.assistant_pending_actions(clinic_id,actor_user_id,actor_clinic_member_id,tool_name,validated_arguments,expires_at)
  values(p_clinic_id,v_actor,v_member.id,p_tool_name,p_validated_arguments,p_expires_at) returning * into v_action;
  return query select v_action.id,v_action.tool_name,v_action.expires_at,v_action.status;
end $$;

create or replace function public.claim_assistant_pending_action_for_current_user(p_action_id uuid)
returns table(id uuid, tool_name text, validated_arguments jsonb, status text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_action from public.assistant_pending_actions action
    where action.id=p_action_id and action.actor_user_id=v_actor and exists (select 1 from public.clinic_members member where member.id=action.actor_clinic_member_id and member.clinic_id=action.clinic_id and member.user_id=v_actor and member.status='active')
    for update;
  if not found then raise exception 'Assistant proposal is unavailable.' using errcode='42501'; end if;
  if v_action.status='pending' and v_action.expires_at <= now() then
    update public.assistant_pending_actions set status='expired' where assistant_pending_actions.id=v_action.id; v_action.status := 'expired';
  elsif v_action.status='pending' then
    update public.assistant_pending_actions set status='claimed',claimed_at=now() where assistant_pending_actions.id=v_action.id returning * into v_action;
  end if;
  return query select v_action.id,v_action.tool_name,v_action.validated_arguments,v_action.status,v_action.expires_at;
end $$;

create or replace function public.finish_assistant_pending_action_for_current_user(p_action_id uuid,p_outcome text,p_error_code text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_outcome not in ('executed','failed') or (p_outcome='executed' and p_error_code is not null) or (p_outcome='failed' and p_error_code not in ('forbidden','not_found','conflict','outside_availability','stale','invalid_transition','validation_error','entitlement','generic')) then raise exception 'Invalid assistant outcome.' using errcode='22023'; end if;
  select * into v_action from public.assistant_pending_actions action where action.id=p_action_id and action.actor_user_id=v_actor for update;
  if not found or v_action.status <> 'claimed' then raise exception 'Assistant proposal is unavailable.' using errcode='42501'; end if;
  update public.assistant_pending_actions set status=p_outcome,executed_at=case when p_outcome='executed' then now() else null end,failed_at=case when p_outcome='failed' then now() else null end,error_code=p_error_code where assistant_pending_actions.id=v_action.id;
  return p_outcome;
end $$;

create or replace function public.cancel_assistant_pending_action_for_current_user(p_action_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_action from public.assistant_pending_actions action where action.id=p_action_id and action.actor_user_id=v_actor and exists (select 1 from public.clinic_members member where member.id=action.actor_clinic_member_id and member.clinic_id=action.clinic_id and member.user_id=v_actor and member.status='active') for update;
  if not found then raise exception 'Assistant proposal is unavailable.' using errcode='42501'; end if;
  if v_action.status='pending' and v_action.expires_at <= now() then update public.assistant_pending_actions set status='expired' where assistant_pending_actions.id=v_action.id; return 'expired'; end if;
  if v_action.status='pending' then update public.assistant_pending_actions set status='cancelled' where assistant_pending_actions.id=v_action.id; return 'cancelled'; end if;
  return v_action.status;
end $$;

revoke all on function public.create_assistant_pending_action_for_current_user(uuid,text,jsonb,timestamptz) from public, anon;
revoke all on function public.claim_assistant_pending_action_for_current_user(uuid) from public, anon;
revoke all on function public.finish_assistant_pending_action_for_current_user(uuid,text,text) from public, anon;
revoke all on function public.cancel_assistant_pending_action_for_current_user(uuid) from public, anon;
grant execute on function public.create_assistant_pending_action_for_current_user(uuid,text,jsonb,timestamptz) to authenticated;
grant execute on function public.claim_assistant_pending_action_for_current_user(uuid) to authenticated;
grant execute on function public.finish_assistant_pending_action_for_current_user(uuid,text,text) to authenticated;
grant execute on function public.cancel_assistant_pending_action_for_current_user(uuid) to authenticated;
