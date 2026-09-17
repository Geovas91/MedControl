-- A claimed action is owned by the transaction that changed it from pending.
-- Callers that arrive after that transition must not execute the persisted action.
create or replace function public.claim_assistant_pending_action_for_current_user(p_action_id uuid)
returns table(id uuid, tool_name text, validated_arguments jsonb, status text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_action public.assistant_pending_actions%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_action
  from public.assistant_pending_actions action
  where action.id = p_action_id
    and action.actor_user_id = v_actor
    and exists (
      select 1
      from public.clinic_members member
      where member.id = action.actor_clinic_member_id
        and member.clinic_id = action.clinic_id
        and member.user_id = v_actor
        and member.status = 'active'
    )
  for update;

  if not found then
    raise exception 'Assistant proposal is unavailable.' using errcode = '42501';
  end if;

  if v_action.status = 'pending' and v_action.expires_at <= now() then
    update public.assistant_pending_actions
    set status = 'expired'
    where assistant_pending_actions.id = v_action.id;
    v_action.status := 'expired';
  elsif v_action.status = 'pending' then
    update public.assistant_pending_actions
    set status = 'claimed', claimed_at = now()
    where assistant_pending_actions.id = v_action.id
    returning * into v_action;
  elsif v_action.status = 'claimed' then
    -- This call did not acquire the claim and must never execute the action.
    v_action.status := 'already_claimed';
  end if;

  return query select v_action.id, v_action.tool_name, v_action.validated_arguments,
    v_action.status, v_action.expires_at;
end;
$$;

revoke all on function public.claim_assistant_pending_action_for_current_user(uuid) from public, anon;
grant execute on function public.claim_assistant_pending_action_for_current_user(uuid) to authenticated;
