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
