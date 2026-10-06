// Local PostgreSQL only. Verifies that exactly one confirmation acquires a pending Assistant action.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";

function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "supabase_db_CliniControl", "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr }));
    child.stdin.end(statement);
  });
}

test("concurrent Assistant confirmations grant exactly one executable claim", async () => {
  const clinicId = randomUUID();
  const actorId = randomUUID();
  let actionId;

  try {
    const setup = await sql(`begin;
      insert into auth.users(id,email,email_confirmed_at) values ('${actorId}','assistant-claim-${actorId}@example.test',now());
      insert into public.clinics(id,name) values ('${clinicId}','Assistant claim concurrency fixture');
      insert into public.clinic_members(clinic_id,user_id,role,status) values ('${clinicId}','${actorId}','owner','active');
      insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values ('${clinicId}','pro','active','manual');
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${actorId}',true);
      select id from public.create_assistant_pending_action_for_current_user('${clinicId}','cancel_appointment','{}',now()+interval '5 minutes');
      commit;`);
    assert.equal(setup.code, 0, setup.stderr);
    actionId = setup.stdout.split(/\s+/).at(-1);
    assert.match(actionId, /^[0-9a-f-]{36}$/i);

    const claim = () => sql(`begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${actorId}',true);
      select status from public.claim_assistant_pending_action_for_current_user('${actionId}');
      select pg_sleep(0.5);
      commit;`);
    const results = await Promise.all([claim(), claim()]);
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(results.map((result) => result.stdout.split(/\s+/).at(-1)).sort(), ["already_claimed", "claimed"]);

    const persisted = await sql(`select status, count(*) over () from public.assistant_pending_actions where id='${actionId}';`);
    assert.equal(persisted.code, 0, persisted.stderr);
    assert.equal(persisted.stdout, "claimed|1");
  } finally {
    const cleanup = await sql(`begin;
      delete from public.clinics where id='${clinicId}';
      delete from auth.users where id='${actorId}';
      commit;`);
    assert.equal(cleanup.code, 0, cleanup.stderr);
  }
});

// Real PostgreSQL execution/entitlement races. Synthetic fixtures are removed locally.
async function executionFixture(work) {
  const f = Object.fromEntries(["clinic", "actor", "doctor", "member", "patient"].map((name) => [name, randomUUID()]));
  try {
    const setup = await sql(`begin;
      insert into auth.users(id,email) values ('${f.actor}','owner-${f.actor}@example.test'),('${f.doctor}','doctor-${f.doctor}@example.test');
      insert into public.clinics(id,name,timezone) values ('${f.clinic}','Assistant execution concurrency','America/Mexico_City');
      insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values ('${f.clinic}','plus','active','manual');
      insert into public.clinic_members(clinic_id,user_id,role,status,is_professional) values ('${f.clinic}','${f.actor}','owner','active',false);
      insert into public.clinic_members(id,clinic_id,user_id,role,status,is_professional) values ('${f.member}','${f.clinic}','${f.doctor}','doctor','active',true);
      insert into public.patients(id,clinic_id,full_name) values ('${f.patient}','${f.clinic}','Synthetic concurrency');
      insert into public.patient_professional_assignments(clinic_id,patient_id,clinic_member_id,source) values ('${f.clinic}','${f.patient}','${f.member}','manual');
      insert into public.professional_availability_rules(clinic_id,clinic_member_id,weekday,start_time,end_time,effective_from) values ('${f.clinic}','${f.member}',1,'09:00','17:00','2026-01-01');
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${f.actor}',true);
      select id from public.create_assistant_pending_action_for_current_user('${f.clinic}','create_appointment',jsonb_build_object('patient_id','${f.patient}','professional_clinic_member_id','${f.member}','local_date','2030-01-07','local_time','10:00','duration_minutes',30),now()+interval '5 minutes');
      commit;`);
    assert.equal(setup.code, 0, setup.stderr);
    f.action = setup.stdout.split(/\s+/).at(-1);
    assert.match(f.action, /^[0-9a-f-]{36}$/i);
    const claimed = await sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${f.actor}',true); select status from public.claim_assistant_pending_action_for_current_user('${f.action}'); commit;`);
    assert.equal(claimed.code, 0, claimed.stderr);
    assert.equal(claimed.stdout.split(/\s+/).at(-1), "claimed");
    await work(f);
  } finally {
    const cleanup = await sql(`begin; delete from public.patient_professional_assignments where clinic_id='${f.clinic}'; delete from public.professional_availability_rules where clinic_id='${f.clinic}'; delete from public.appointments where clinic_id='${f.clinic}'; delete from public.patients where clinic_id='${f.clinic}'; delete from public.clinical_change_events where clinic_id='${f.clinic}'; delete from public.clinics where id='${f.clinic}'; delete from auth.users where id in ('${f.actor}','${f.doctor}'); commit;`);
    assert.equal(cleanup.code, 0, cleanup.stderr);
  }
}

const execute = (f, hold = false) => sql(`begin; set local application_name='assistant-execute-${f.action}'; set local role authenticated; select set_config('request.jwt.claim.sub','${f.actor}',true); select appointment_id from public.execute_claimed_assistant_pending_action_for_current_user('${f.action}'); ${hold ? "select pg_sleep(1.5);" : ""} commit;`);
const downgrade = (f, hold = false) => sql(`begin; set local application_name='assistant-downgrade-${f.action}'; update public.clinic_subscriptions set plan_id='basic' where clinic_id='${f.clinic}'; ${hold ? "select pg_sleep(1.5);" : ""} commit;`);

async function waitForConnection(f, prefix, eventType) {
  for (let n = 0; n < 50; n++) {
    const state = await sql(`select exists(select 1 from pg_stat_activity where application_name='assistant-${prefix}-${f.action}' and wait_event_type='${eventType}');`);
    assert.equal(state.code, 0, state.stderr);
    if (state.stdout === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Expected ${prefix} connection waiting on ${eventType}`);
}

async function appointmentCount(f) {
  const result = await sql(`select count(*) from public.appointments where clinic_id='${f.clinic}';`);
  assert.equal(result.code, 0, result.stderr);
  return Number(result.stdout);
}

test("concurrent execution of one claimed proposal produces exactly one appointment", async () => {
  await executionFixture(async (f) => {
    const results = await Promise.all([execute(f), execute(f)]);
    assert.equal(results.filter((r) => r.code === 0).length, 1);
    assert.equal(results.filter((r) => r.stderr.includes("Assistant is unavailable.")).length, 1);
    assert.equal(await appointmentCount(f), 1);
  });
});

test("execution holds commercial authority lock until canonical mutation commits", async () => {
  await executionFixture(async (f) => {
    const mutation = execute(f, true);
    await waitForConnection(f, "execute", "Timeout");
    const change = downgrade(f);
    await waitForConnection(f, "downgrade", "Lock");
    const results = await Promise.all([mutation, change]);
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    assert.equal(await appointmentCount(f), 1);
    assert.notEqual((await execute(f)).code, 0);
  });
});

test("downgrade winning the subscription lock denies execution with zero mutation", async () => {
  await executionFixture(async (f) => {
    const change = downgrade(f, true);
    await waitForConnection(f, "downgrade", "Timeout");
    const mutation = execute(f);
    await waitForConnection(f, "execute", "Lock");
    const [changed, executed] = await Promise.all([change, mutation]);
    assert.equal(changed.code, 0, changed.stderr);
    assert.notEqual(executed.code, 0);
    assert.match(executed.stderr, /Assistant is unavailable/);
    assert.equal(await appointmentCount(f), 0);
  });
});
