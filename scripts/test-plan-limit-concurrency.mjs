// Local PostgreSQL only. Uses synthetic users and never calls external providers.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "supabase_db_CliniControl", "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout: stdout.trim(), stderr }));
    child.stdin.end(statement);
  });
}

function uid() { return randomUUID(); }
function token() { return `local-${randomUUID()}`; }

async function setupScenario({ plan, existingDoctors, suspended = false }) {
  const clinic = uid(), creator = uid(), first = uid(), second = uid();
  const firstToken = token(), secondToken = token();
  const existing = Array.from({ length: existingDoctors }, () => uid());
  const users = [creator, first, second, ...existing];
  const userValues = users.map((id, index) => `('${id}','local-${id}@example.test',now())`).join(",");
  const memberValues = [
    `('${clinic}','${creator}','${plan === "basic" ? "admin" : "owner"}','active')`,
    ...existing.map(id => `('${clinic}','${id}','doctor','active')`),
    ...(suspended ? [
      `('${clinic}','${first}','doctor','suspended')`,
      `('${clinic}','${second}','doctor','suspended')`
    ] : [])
  ].join(",");
  const setup = await sql(`begin;
    insert into auth.users(id,email,email_confirmed_at) values ${userValues};
    insert into public.clinics(id,name) values('${clinic}','Local doctor limit fixture');
    insert into public.clinic_members(clinic_id,user_id,role,status) values ${memberValues};
    insert into public.clinic_subscriptions(clinic_id,plan_id,status) values('${clinic}','${plan}','active');
    insert into public.clinic_member_invitations(clinic_id,invited_email,normalized_email,role,token_hash,expires_at,created_by) values
      ('${clinic}','local-${first}@example.test','local-${first}@example.test','doctor',encode(extensions.digest('${firstToken}','sha256'),'hex'),now()+interval '1 day','${creator}'),
      ('${clinic}','local-${second}@example.test','local-${second}@example.test','doctor',encode(extensions.digest('${secondToken}','sha256'),'hex'),now()+interval '1 day','${creator}');
    commit;`);
  assert.equal(setup.code, 0, setup.stderr);
  return { clinic, creator, first, second, firstToken, secondToken, users };
}

async function accept(user, rawToken) {
  return sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true);
    select public.accept_clinic_member_invitation_for_current_user(encode(extensions.digest('${rawToken}','sha256'),'hex'));
    select pg_sleep(0.5); commit;`);
}

async function cleanup(fixture) {
  const result = await sql(`begin; delete from public.clinics where id='${fixture.clinic}'; delete from auth.users where id in (${fixture.users.map(id => `'${id}'`).join(",")}); commit;`);
  assert.equal(result.code, 0, result.stderr);
}

async function activeDoctorSeats(clinic) {
  const result = await sql(`select count(*) from public.clinic_members where clinic_id='${clinic}' and status='active' and role in ('owner','doctor');`);
  assert.equal(result.code, 0, result.stderr);
  return Number(result.stdout);
}

test("doctor plan limits serialize real concurrent invitation acceptance", async t => {
  for (const scenario of [
    { name: "Basic last slot", plan: "basic", existingDoctors: 0, expectedSeats: 1 },
    { name: "Plus last slot", plan: "plus", existingDoctors: 3, expectedSeats: 5 },
    { name: "concurrent suspended doctor reactivation", plan: "plus", existingDoctors: 3, suspended: true, expectedSeats: 5 }
  ]) {
    await t.test(`${scenario.name}: one wins and one loses`, async () => {
      const fixture = await setupScenario(scenario);
      try {
        const results = await Promise.all([accept(fixture.first, fixture.firstToken), accept(fixture.second, fixture.secondToken)]);
        assert.deepEqual(results.map(result => result.code).sort(), [0, 3]);
        assert.ok(results.find(result => result.code !== 0).stderr.includes("Invitation is unavailable."));
        assert.equal(await activeDoctorSeats(fixture.clinic), scenario.expectedSeats);
      } finally { await cleanup(fixture); }
    });
  }

  await t.test("Pro remains unlimited and accepts both", async () => {
    const fixture = await setupScenario({ plan: "pro", existingDoctors: 1 });
    try {
      const results = await Promise.all([accept(fixture.first, fixture.firstToken), accept(fixture.second, fixture.secondToken)]);
      assert.deepEqual(results.map(result => result.code), [0, 0]);
      assert.equal(await activeDoctorSeats(fixture.clinic), 4);
    } finally { await cleanup(fixture); }
  });
});

test("two platform admins cannot overwrite the same support transition", async () => {
  const clinic = uid(), requester = uid(), firstAdmin = uid(), secondAdmin = uid(), ticket = uid();
  try {
    const setup = await sql(`begin;
      insert into auth.users(id,email,email_confirmed_at) values
        ('${requester}','requester-${requester}@example.test',now()),
        ('${firstAdmin}','admin-${firstAdmin}@example.test',now()),
        ('${secondAdmin}','admin-${secondAdmin}@example.test',now());
      insert into public.clinics(id,name) values('${clinic}','Local support concurrency fixture');
      insert into public.clinic_members(clinic_id,user_id,role,status) values('${clinic}','${requester}','doctor','active');
      insert into public.platform_admins(user_id,email,role) values
        ('${firstAdmin}','admin-${firstAdmin}@example.test','support'),
        ('${secondAdmin}','admin-${secondAdmin}@example.test','support');
      insert into public.support_tickets(id,reference_code,clinic_id,created_by,category,severity,status,subject,summary)
        values('${ticket}',upper(substr(replace('${ticket}','-',''),1,16)),'${clinic}','${requester}','appointments','normal','open','Safe subject','Safe summary');
      commit;`);
    assert.equal(setup.code, 0, setup.stderr);
    const transition = admin => sql(`begin; set local role service_role;
      select count(*) from public.transition_admin_support_ticket('${ticket}','open','triaged','${admin}');
      select pg_sleep(0.5); commit;`);
    const results = await Promise.all([transition(firstAdmin), transition(secondAdmin)]);
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(results.map(result => Number(result.stdout.split(/\s+/)[0])).sort(), [0, 1]);
    const evidence = await sql(`select json_build_object(
      'status',(select status from public.support_tickets where id='${ticket}'),
      'events',(select count(*) from public.support_ticket_events where ticket_id='${ticket}' and event_type='support_ticket_status_changed'),
      'audits',(select count(*) from public.audit_logs where entity_id='${ticket}' and action='support_ticket_triaged'));`);
    assert.equal(evidence.code, 0, evidence.stderr);
    assert.deepEqual(JSON.parse(evidence.stdout), { status: "triaged", events: 1, audits: 1 });
  } finally {
    const cleanupResult = await sql(`begin; delete from public.clinics where id='${clinic}'; delete from public.platform_admins where user_id in ('${firstAdmin}','${secondAdmin}'); delete from auth.users where id in ('${requester}','${firstAdmin}','${secondAdmin}'); commit;`);
    assert.equal(cleanupResult.code, 0, cleanupResult.stderr);
  }
});
