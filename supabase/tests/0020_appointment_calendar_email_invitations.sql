-- Run after a local `supabase db reset` with:
-- Get-Content -Raw supabase/tests/0020_appointment_calendar_email_invitations.sql |
--   docker exec -i supabase_db_clinicontrol-pr42-local psql -U postgres -d postgres -v ON_ERROR_STOP=1
begin;

insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000020', 'calendar-doctor-a@example.test'),
  ('10000000-0000-4000-8000-000000000021', 'calendar-assistant-a@example.test'),
  ('10000000-0000-4000-8000-000000000022', 'calendar-doctor-b@example.test'),
  ('10000000-0000-4000-8000-000000000023', 'calendar-outsider@example.test');

insert into public.clinics(id, name) values
  ('20000000-0000-4000-8000-000000000020', 'Calendar Clinic A'),
  ('20000000-0000-4000-8000-000000000021', 'Calendar Clinic B');

insert into public.clinic_members(clinic_id, user_id, role, status) values
  ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000020', 'doctor', 'active'),
  ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000021', 'assistant', 'active'),
  ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000022', 'doctor', 'active');

insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values
  ('20000000-0000-4000-8000-000000000020', 'pro', 'active', 'paypal'),
  ('20000000-0000-4000-8000-000000000021', 'pro', 'active', 'paypal');

insert into public.patients(id, clinic_id, full_name, email) values
  ('30000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000020', 'Patient A', 'patient-a@example.test'),
  ('30000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000021', 'Patient B', 'patient-b@example.test');

insert into public.appointments(id, clinic_id, patient_id, doctor_id, title, starts_at, ends_at) values
  ('40000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000020', '30000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000020', 'Appointment A', now() + interval '1 day', now() + interval '1 day 1 hour'),
  ('40000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000021', '30000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000022', 'Appointment B', now() + interval '2 days', now() + interval '2 days 1 hour');

-- missing_recipient and disabled are application preflight results. Before a real
-- delivery calls the RPC, neither may create or mutate appointment_invites.
do $$
begin
  if exists (
    select 1 from public.appointment_invites
    where appointment_id = '40000000-0000-4000-8000-000000000020'
  ) then
    raise exception 'Preflight unexpectedly created an appointment invite';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000020', true);

do $$
declare
  v_first record;
  v_repeat record;
  v_next record;
  v_uid text;
begin
  select * into strict v_first
  from public.prepare_appointment_email_invite(
    '40000000-0000-4000-8000-000000000020', 'REQUEST', 'appointment-a:0:REQUEST'
  );
  if not v_first.should_send or v_first.sequence <> 0 then
    raise exception 'First real delivery did not start at sequence 0';
  end if;
  v_uid := v_first.ics_uid;

  select * into strict v_repeat
  from public.prepare_appointment_email_invite(
    '40000000-0000-4000-8000-000000000020', 'REQUEST', 'appointment-a:0:REQUEST'
  );
  if v_repeat.should_send or v_repeat.sequence <> 0 or v_repeat.ics_uid <> v_uid then
    raise exception 'Repeated idempotency key was not a stable duplicate';
  end if;

  select * into strict v_next
  from public.prepare_appointment_email_invite(
    '40000000-0000-4000-8000-000000000020', 'CANCEL', 'appointment-a:1:CANCEL'
  );
  if not v_next.should_send or v_next.sequence <> 1 or v_next.ics_uid <> v_uid then
    raise exception 'New operation did not increment sequence exactly once with stable UID';
  end if;

  update public.appointment_invites
  set status = 'sent', delivery_status = 'sent'
  where id = v_next.invite_id;
  select * into strict v_repeat
  from public.prepare_appointment_email_invite(
    '40000000-0000-4000-8000-000000000020', 'CANCEL', 'appointment-a:1:CANCEL'
  );
  if v_repeat.should_send or v_repeat.sequence <> 1 then
    raise exception 'Sent operation was not kept consumed';
  end if;
  if (select delivery_status from public.appointment_invites where id = v_next.invite_id) <> 'sent' then
    raise exception 'Duplicate retry modified sent delivery state';
  end if;

  select * into strict v_next
  from public.prepare_appointment_email_invite(
    '40000000-0000-4000-8000-000000000020', 'REQUEST', 'appointment-a:2:REQUEST'
  );
  update public.appointment_invites
  set status = 'failed', delivery_status = 'delivery_unknown'
  where id = v_next.invite_id;
  select * into strict v_repeat
  from public.prepare_appointment_email_invite(
    '40000000-0000-4000-8000-000000000020', 'REQUEST', 'appointment-a:2:REQUEST'
  );
  if v_repeat.should_send or v_repeat.sequence <> 2 then
    raise exception 'delivery_unknown operation was not kept consumed';
  end if;
  if (select delivery_status from public.appointment_invites where id = v_next.invite_id) <> 'delivery_unknown' then
    raise exception 'Duplicate retry modified delivery_unknown state';
  end if;

  if (select count(*) from public.appointment_invites where appointment_id = '40000000-0000-4000-8000-000000000020' and channel = 'email') <> 1 then
    raise exception 'More than one email invite exists for the appointment';
  end if;
end
$$;

-- An assistant cannot prepare an invitation, even inside the same clinic.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000021', true);
do $$
begin
  begin
    perform public.prepare_appointment_email_invite(
      '40000000-0000-4000-8000-000000000020', 'REQUEST', 'assistant-attempt'
    );
    raise exception 'Assistant prepared an invitation';
  exception
    when others then
      if sqlerrm <> 'Appointment is unavailable.' then raise; end if;
  end;
end
$$;

-- A doctor cannot prepare an invitation belonging to another clinic.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000020', true);
do $$
begin
  begin
    perform public.prepare_appointment_email_invite(
      '40000000-0000-4000-8000-000000000021', 'REQUEST', 'cross-clinic-attempt'
    );
    raise exception 'Cross-clinic invitation was prepared';
  exception
    when others then
      if sqlerrm <> 'Appointment is unavailable.' then raise; end if;
  end;
end
$$;

-- An authenticated user without membership is also rejected.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000023', true);
do $$
begin
  begin
    perform public.prepare_appointment_email_invite(
      '40000000-0000-4000-8000-000000000020', 'REQUEST', 'outsider-attempt'
    );
    raise exception 'Outsider prepared an invitation';
  exception
    when others then
      if sqlerrm <> 'Appointment is unavailable.' then raise; end if;
  end;
end
$$;

reset role;

-- The RPC is not executable by the anonymous API role.
set local role anon;
do $$
begin
  begin
    perform public.prepare_appointment_email_invite(
      '40000000-0000-4000-8000-000000000020', 'REQUEST', 'anonymous-attempt'
    );
    raise exception 'Anonymous role executed the invitation RPC';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- Only REQUEST and CANCEL are accepted, and keys must be 1..255 characters.
do $$
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000020', true);
  set local role authenticated;
  begin
    perform public.prepare_appointment_email_invite('40000000-0000-4000-8000-000000000020', 'PUBLISH', 'invalid-method');
    raise exception 'Invalid method was accepted';
  exception when others then
    if sqlerrm <> 'Invalid calendar invitation method.' then raise; end if;
  end;
  begin
    perform public.prepare_appointment_email_invite('40000000-0000-4000-8000-000000000020', null, 'invalid-null-method');
    raise exception 'Null method was accepted';
  exception when others then
    if sqlerrm <> 'Invalid calendar invitation method.' then raise; end if;
  end;
  begin
    perform public.prepare_appointment_email_invite('40000000-0000-4000-8000-000000000020', 'REQUEST', '');
    raise exception 'Empty idempotency key was accepted';
  exception when others then
    if sqlerrm <> 'Invalid calendar invitation idempotency key.' then raise; end if;
  end;
  begin
    perform public.prepare_appointment_email_invite('40000000-0000-4000-8000-000000000020', 'REQUEST', repeat('x', 256));
    raise exception 'Oversized idempotency key was accepted';
  exception when others then
    if sqlerrm <> 'Invalid calendar invitation idempotency key.' then raise; end if;
  end;
  reset role;
end
$$;

-- Direct invalid writes exercise every 0020 constraint.
do $$
declare
  v_invite_id uuid;
begin
  select id into strict v_invite_id
  from public.appointment_invites
  where appointment_id = '40000000-0000-4000-8000-000000000020' and channel = 'email';

  begin update public.appointment_invites set sequence = -1 where id = v_invite_id;
    raise exception 'Negative sequence was accepted'; exception when check_violation then null; end;
  begin update public.appointment_invites set last_method = 'PUBLISH' where id = v_invite_id;
    raise exception 'Invalid stored method was accepted'; exception when check_violation then null; end;
  begin update public.appointment_invites set delivery_status = 'unknown' where id = v_invite_id;
    raise exception 'Invalid delivery state was accepted'; exception when check_violation then null; end;
  begin update public.appointment_invites set provider_message_id = repeat('p', 256) where id = v_invite_id;
    raise exception 'Oversized provider message id was accepted'; exception when check_violation then null; end;
  begin update public.appointment_invites set last_idempotency_key = '' where id = v_invite_id;
    raise exception 'Empty stored idempotency key was accepted'; exception when check_violation then null; end;
  begin update public.appointment_invites set last_idempotency_key = repeat('k', 256) where id = v_invite_id;
    raise exception 'Oversized stored idempotency key was accepted'; exception when check_violation then null; end;
  begin update public.appointment_invites set failed_reason = repeat('f', 65) where id = v_invite_id;
    raise exception 'Oversized failure reason was accepted'; exception when check_violation then null; end;
  begin update public.appointment_invites set ics_uid = null where id = v_invite_id;
    raise exception 'Email invite without UID was accepted'; exception when check_violation then null; end;
  begin
    insert into public.appointment_invites(clinic_id, appointment_id, patient_id, channel, ics_uid)
    values (
      '20000000-0000-4000-8000-000000000020',
      '40000000-0000-4000-8000-000000000020',
      '30000000-0000-4000-8000-000000000020',
      'email',
      'second-uid@example.test'
    );
    raise exception 'Second email row for one appointment was accepted';
  exception when unique_violation then null; end;
end
$$;

rollback;

select '0020 appointment calendar email SQL tests passed' as result;
