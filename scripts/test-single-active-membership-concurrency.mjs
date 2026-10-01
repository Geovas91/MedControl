// Local Docker PostgreSQL only; synthetic fixtures, no external services or credentials.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

function sql(statement, database = "postgres") {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "supabase_db_CliniControl", "psql", "-X", "-qAt", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"]);
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout: stdout.trim(), stderr }));
    child.stdin.end(statement);
  });
}

test("migration preflight aborts on duplicates without disclosing or repairing them", async () => {
  // Separate scratch database: never remove or bypass the real local unique index.
  const database = `membership_preflight_${randomUUID().replaceAll("-", "")}`;
  const user = randomUUID();
  const created = await sql(`create database ${database};`);
  assert.equal(created.code, 0, created.stderr);
  try {
    const setup = await sql(`create type public.clinic_member_status as enum ('active','invited','suspended');
      create table public.clinic_members(user_id uuid,status public.clinic_member_status);
      insert into public.clinic_members values('${user}','active'),('${user}','active');`, database);
    assert.equal(setup.code, 0, setup.stderr);
    const result = await sql(readFileSync("supabase/migrations/0056_single_active_clinic_membership.sql", "utf8"), database);
    assert.equal(result.code, 3);
    assert.match(result.stderr, /Active membership integrity check failed\./);
    assert.equal(result.stderr.includes(user), false);
    const after = await sql(`select json_build_object('rows',(select count(*) from public.clinic_members),
      'index',to_regclass('public.clinic_members_one_active_per_user_idx'));`, database);
    assert.deepEqual(JSON.parse(after.stdout), { rows: 2, index: null });
  } finally {
    const dropped = await sql(`drop database ${database};`);
    assert.equal(dropped.code, 0, dropped.stderr);
  }
});
async function setup() {
  const user = randomUUID(), clinics = [randomUUID(), randomUUID()], owners = [randomUUID(), randomUUID()];
  const tokens = [randomUUID(), randomUUID()];
  const users = [user, ...owners];
  const result = await sql(`begin;
    insert into auth.users(id,email,email_confirmed_at) values ${users.map(id => `('${id}','single-${id}@example.test',now())`).join(",")};
    ${clinics.map((clinic, i) => `
      insert into public.clinics(id,name) values('${clinic}','Local single membership fixture');
      insert into public.clinic_members(clinic_id,user_id,role,status) values('${clinic}','${owners[i]}','owner','active');
      insert into public.clinic_subscriptions(clinic_id,plan_id,status) values('${clinic}','pro','active');
      insert into public.clinic_member_invitations(clinic_id,invited_email,normalized_email,role,token_hash,expires_at,created_by)
        values('${clinic}','single-${user}@example.test','single-${user}@example.test','doctor',encode(extensions.digest('${tokens[i]}','sha256'),'hex'),now()+interval '1 day','${owners[i]}');`).join("\n")}
    commit;`);
  assert.equal(result.code, 0, result.stderr);
  return { user, clinics, owners, tokens };
}
async function cleanup(fixture) {
  const { user, clinics, owners } = fixture;
  const result = await sql(`begin;
    delete from public.clinics where id in ('${clinics[0]}','${clinics[1]}') or id in (select clinic_id from public.clinic_members where user_id='${user}' and role='owner');
    delete from auth.users where id in ('${user}','${owners[0]}','${owners[1]}'); commit;`);
  assert.equal(result.code, 0, result.stderr);
}
function accept(f, i) {
  return sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${f.user}';
    select public.accept_clinic_member_invitation_for_current_user(encode(extensions.digest('${f.tokens[i]}','sha256'),'hex'));
    select pg_sleep(0.3); commit;`);
}
async function activeCount(user) {
  const result = await sql(`select count(*) from public.clinic_members where user_id='${user}' and status='active';`);
  assert.equal(result.code, 0, result.stderr);
  return Number(result.stdout);
}

test("two clinics concurrently accept the same user: one winner, one generic denial", async () => {
  const f = await setup();
  try {
    const results = await Promise.all([accept(f, 0), accept(f, 1)]);
    assert.deepEqual(results.map(r => r.code).sort(), [0, 3]);
    assert.match(results.find(r => r.code !== 0).stderr, /Invitation is unavailable\./);
    assert.equal(await activeCount(f.user), 1);
    const result = await sql(`select json_build_object(
      'accepted',(select count(*) from public.clinic_member_invitations where accepted_user_id='${f.user}'),
      'pending',(select count(*) from public.clinic_member_invitations where normalized_email='single-${f.user}@example.test' and status='pending' and token_hash is not null),
      'audits',(select count(*) from public.audit_logs where actor_user_id='${f.user}' and action='invitation_accepted'));`);
    assert.deepEqual(JSON.parse(result.stdout), { accepted: 1, pending: 1, audits: 1 });
  } finally { await cleanup(f); }
});

test("concurrent privileged inserts without advisory locks are constrained by the unique index", async () => {
  const f = await setup();
  try {
    const insert = clinic => sql(`begin; set local role service_role;
      insert into public.clinic_members(clinic_id,user_id,role,status) values('${clinic}','${f.user}','doctor','active');
      select pg_sleep(0.3); commit;`);
    const results = await Promise.all(f.clinics.map(insert));
    assert.deepEqual(results.map(r => r.code).sort(), [0, 3]);
    assert.match(results.find(r => r.code !== 0).stderr, /clinic_members_one_active_per_user_idx/);
    assert.equal(await activeCount(f.user), 1);
  } finally { await cleanup(f); }
});

test("onboarding concurrent with invitation acceptance leaves exactly one usable clinic", async () => {
  const f = await setup();
  try {
    const onboarding = sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${f.user}';
      select public.complete_clinic_onboarding_for_current_user('Local onboarding race',null,null,null,'America/Mexico_City',null,null,null,'Synthetic Owner','pro',true,true,true);
      select pg_sleep(0.3); commit;`);
    const [onboarded, accepted] = await Promise.all([onboarding, accept(f, 0)]);
    assert.equal(onboarded.code, 0, onboarded.stderr);
    assert.ok([0, 3].includes(accepted.code));
    if (accepted.code !== 0) assert.match(accepted.stderr, /Invitation is unavailable\./);
    assert.equal(await activeCount(f.user), 1);
    const result = await sql(`select count(*) from public.clinic_members where user_id='${f.user}' and role='owner';`);
    assert.equal(Number(result.stdout), accepted.code === 0 ? 0 : 1);
    const retry = await sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${f.user}';
      select public.complete_clinic_onboarding_for_current_user('Retry',null,null,null,'America/Mexico_City',null,null,null,'Synthetic Owner','pro',true,true,true); commit;`);
    assert.equal(retry.code, 0, retry.stderr);
    assert.equal(await activeCount(f.user), 1);
  } finally { await cleanup(f); }
});
