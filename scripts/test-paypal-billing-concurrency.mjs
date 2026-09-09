// Local PostgreSQL only. Does not read application credentials or call PayPal.
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

test("PostgreSQL concurrent claim and finalization are fenced across separate connections", async (t) => {
  const clinic = randomUUID();
  const event = `WH-${randomUUID()}`;
  const subscription = `I-${randomUUID().replaceAll("-", "").toUpperCase()}`;
  try {
    const setup = await sql(`begin;
      insert into public.clinics(id,name) values('${clinic}','Local PayPal concurrency fixture');
      insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider,provider_subscription_id,provider_plan_id)
        values('${clinic}','basic','inactive','paypal','${subscription}','P-CONCURRENCY');
      commit;`);
    assert.equal(setup.code, 0, setup.stderr);

    let token;
    await t.test("two simultaneous claim transactions yield exactly one worker", async () => {
      const statement = `begin; set local role service_role;
        select public.claim_paypal_webhook('${event}','BILLING.SUBSCRIPTION.ACTIVATED','${subscription}');
        select pg_sleep(1); commit;`;
      const results = await Promise.all([sql(statement), sql(statement)]);
      for (const result of results) assert.equal(result.code, 0, result.stderr);
      const claims = results.map(result => JSON.parse(result.stdout));
      assert.deepEqual(claims.map(claim => claim.state).sort(), ["busy", "claimed"]);
      token = claims.find(claim => claim.state === "claimed").token;
    });
    await t.test("two simultaneous finalizers mutate once and reject the reused token", async () => {
      const statement = `set role service_role;
        select public.finish_paypal_webhook('${event}','${token}','active','P-CONCURRENCY',null,null);`;
      const results = await Promise.all([sql(statement), sql(statement)]);
      assert.deepEqual(results.map(result => result.code).sort(), [0, 3]);
      assert.equal(results.find(result => result.code === 0).stdout, "processed");
      assert.match(results.find(result => result.code !== 0).stderr, /webhook_lease_lost/);
    });
    await t.test("processed receipt has one attempt and one matching SaaS subscription", async () => {
      const result = await sql(`select json_build_object('state',e.processing_status,'attempts',e.attempt_count,
        'status',s.status,'count',(select count(*) from public.clinic_subscriptions where provider_subscription_id='${subscription}'))
        from public.paypal_webhook_events e join public.clinic_subscriptions s on s.provider_subscription_id=e.provider_subscription_id
        where e.event_id='${event}';`);
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { state: "processed", attempts: 1, status: "active", count: 1 });
    });
  } finally {
    const cleanup = await sql(`begin;
      delete from public.paypal_webhook_events where event_id='${event}';
      delete from public.clinic_subscriptions where clinic_id='${clinic}';
      delete from public.clinics where id='${clinic}'; commit;`);
    assert.equal(cleanup.code, 0, cleanup.stderr);
  }
});
