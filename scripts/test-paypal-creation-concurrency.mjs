// Requires separately authorized 0067 already
// applied to this disposable local container. No dotenv, remote DB or PayPal.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const [, , option, container] = process.argv;
if (option !== '--container' || !/^clinicontrol-v102-acceptance-[a-z0-9]+$/.test(container ?? '') || process.argv.length !== 4) {
  throw new Error('Explicit disposable V1-02 container required: --container clinicontrol-v102-acceptance-<id>');
}
const identity = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(identity.Config.Labels?.['clinicontrol.qa.disposable'], 'v102-15af16b');
assert.equal(identity.HostConfig.NetworkMode, 'none');
assert.equal(identity.Mounts.length, 0, 'No shared/persistent volumes allowed');

function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-h', '/v102', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']);
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr }));
    child.stdin.end(statement);
  });
}

test('real separate PostgreSQL connections serialize begin and allow only one creation permit', async () => {
  const clinic = randomUUID(), actor = randomUUID();
  // Stop before fixture writes when the independently reviewed migration is absent.
  const preflight = await sql("select to_regprocedure('public.claim_paypal_billing_creation(uuid,uuid,uuid)') is not null;");
  assert.equal(preflight.code, 0, preflight.stderr); assert.equal(preflight.stdout, 't');
  try {
    const setup = await sql(`begin;
      insert into auth.users(id,email) values('${actor}','${actor}@example.test');
      insert into public.clinics(id,name) values('${clinic}','V102 local concurrency');
      insert into public.clinic_members(clinic_id,user_id,role,status) values('${clinic}','${actor}','owner','active');
      commit;`);
    assert.equal(setup.code, 0, setup.stderr);
    const begin = `begin; set local role service_role;
      select (public.begin_paypal_billing_intent('${clinic}','${actor}','basic','P-LOCAL')).id;
      select pg_sleep(0.2); commit;`;
    const starts = await Promise.all([sql(begin), sql(begin)]);
    for (const result of starts) assert.equal(result.code, 0, result.stderr);
    assert.equal(starts[0].stdout, starts[1].stdout);
    const intent = starts[0].stdout;
    assert.match(intent, /^[a-f0-9-]{36}$/);
    const claim = `begin; set local role service_role;
      select public.claim_paypal_billing_creation('${intent}','${clinic}','${actor}');
      select pg_sleep(0.2); commit;`;
    const claims = await Promise.all([sql(claim), sql(claim)]);
    for (const result of claims) assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(claims.map(result => result.stdout).sort(), ['f', 't']);
    const retry = await sql(begin);
    assert.notEqual(retry.code, 0); assert.match(retry.stderr, /billing_creation_unknown/);
    const count = await sql(`select count(*) from public.paypal_billing_intents where clinic_id='${clinic}';`);
    assert.equal(count.code, 0, count.stderr); assert.equal(count.stdout, '1');
    const expire = await sql(`update public.paypal_billing_intents set expires_at=now()-interval '1 day' where id='${intent}' and clinic_id='${clinic}';`);
    assert.equal(expire.code, 0, expire.stderr);
    const expiredRetry = await sql(begin);
    assert.notEqual(expiredRetry.code, 0); assert.match(expiredRetry.stderr, /billing_creation_unknown/);
    const repeatedClaim = await sql(claim);
    assert.equal(repeatedClaim.code, 0, repeatedClaim.stderr); assert.equal(repeatedClaim.stdout, 'f');
  } finally {
    // Only the generated synthetic billing/identity fixtures in this local DB.
    const cleanup = await sql(`begin;
      delete from public.paypal_billing_intents where clinic_id='${clinic}' and user_id='${actor}';
      delete from public.clinic_members where clinic_id='${clinic}' and user_id='${actor}';
      delete from public.clinics where id='${clinic}';
      delete from auth.users where id='${actor}'; commit;`);
    assert.equal(cleanup.code, 0, cleanup.stderr);
  }
});
