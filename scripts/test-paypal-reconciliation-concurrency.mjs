// PREPARED ONLY. Never initializes a lab or uses linked DB credentials.
// Execution requires separate authorization of an already provisioned disposable target.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const [, , option, container] = process.argv;
if (option !== '--container' || !/^clinicontrol-v103b-acceptance-[a-z0-9]+$/.test(container ?? '') || process.argv.length !== 4) {
  throw new Error('Separately authorized disposable V1-03-B container required');
}
const identity = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(identity.Config.Labels?.['clinicontrol.qa.disposable'], 'v103b-reviewed');
assert.equal(identity.HostConfig.NetworkMode, 'none');
assert.equal(identity.HostConfig.Privileged, false);
assert.equal(identity.Mounts.length, 0, 'No shared/persistent volumes');
assert.equal(Object.keys(identity.HostConfig.PortBindings ?? {}).length, 0);
const db = 'clinicontrol_v103b_acceptance';
const sessions = new Set();
let sequence = 0;
function connection() {
  const name = `v103b_${process.pid}_${++sequence}`;
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-h', '/var/run/postgresql', '-X', '-qAt', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1']);
  sessions.add(child);
  let output = '', errors = '', buffer = '';
  const markers = new Map();
  child.stdout.on('data', chunk => {
    output += chunk; buffer += chunk;
    const lines = buffer.split(/\r?\n/); buffer = lines.pop();
    for (const line of lines) { const done = markers.get(line); if (done) { markers.delete(line); done.resolve(); } }
  });
  child.stderr.on('data', chunk => { errors += chunk; });
  const closed = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => {
      sessions.delete(child);
      for (const marker of markers.values()) marker.reject(new Error('Database session ended before barrier'));
      resolve({ code, output: output.trim(), errors });
    });
  });
  child.stdin.write(`set application_name='${name}'; set statement_timeout='15s'; set lock_timeout='10s';\n`);
  return { name, child, closed, write: text => child.stdin.write(text + '\n'),
    barrier() {
      const id = `BARRIER_${randomUUID()}`;
      const promise = new Promise((resolve, reject) => { markers.set(id, { resolve, reject }); });
      child.stdin.write(`\\echo ${id}\n`); return promise;
    },
    end(text = '') { child.stdin.end(text + '\n'); return closed; }
  };
}
async function sql(text) { return connection().end(text); }
function ok(result) {
  assert.equal(result.code, 0, 'Local SQL session failed; inspect locally without publishing raw SQL errors');
  return result.output.split(/\r?\n/).filter(line => !line.startsWith('BARRIER_')).join('\n').trim();
}
async function blocked(name) {
  for (let n = 0; n < 100; n++) {
    if (ok(await sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and cardinality(pg_blocking_pids(pid))>0);`)) === 't') return;
    await delay(25);
  }
  assert.fail('Expected independent-connection lock wait not observed');
}
const clinic = randomUUID(), actor = randomUUID(), intent = randomUUID();
const sub = `I-${randomUUID().replaceAll('-', '').toUpperCase()}`;
const eventPrefix = `WH-${randomUUID()}`;
const approvalClinic = randomUUID(), approvalActor = randomUUID(), approvalIntent = randomUUID();
const approvalSub = `I-${randomUUID().replaceAll('-', '').toUpperCase()}`;
const begin = () => `public.begin_paypal_reconciliation('${sub}',null,null,'${clinic}','${actor}')`;
const finish = (t, status = 'ACTIVE', end = 'null') => `public.finish_paypal_reconciliation('${t.id}',${t.generation},'${sub}','P-LOCAL','${status}','${intent}',clock_timestamp(),clock_timestamp(),null,${end})`;
async function claim() { return JSON.parse(ok(await sql(`set role service_role; select ${begin()};`))); }

// Read-only preflight before ANY fixture mutation. No environment variables/dotenv.
assert.equal(ok(await sql(`select current_database()='${db}' and current_setting('server_version_num')::int>=170000
 and to_regprocedure('public.finish_paypal_reconciliation(uuid,bigint,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz)') is not null
 and to_regprocedure('public.claim_paypal_billing_creation(uuid,uuid,uuid)') is not null;`)), 't');
try {
  ok(await sql(`begin;
    insert into auth.users(id,email) values('${actor}','${actor}@example.test');
    insert into public.clinics(id,name) values('${clinic}','V103B disposable concurrency');
    insert into public.clinic_members(clinic_id,user_id,role,status) values('${clinic}','${actor}','owner','active');
    insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider,provider_subscription_id,provider_plan_id)
     values('${clinic}','basic','active','paypal','${sub}','P-LOCAL') on conflict(clinic_id) do update
     set plan_id='basic',status='active',billing_provider='paypal',provider_subscription_id='${sub}',provider_plan_id='P-LOCAL';
    insert into public.paypal_billing_intents(id,clinic_id,user_id,plan_id,provider_plan_id,provider_subscription_id,status,completed_at,creation_dispatched_at)
     values('${intent}','${clinic}','${actor}','basic','P-LOCAL','${sub}','completed',now(),now()); commit;`));

  // Two simultaneous begin transactions really block each other on the fence.
  const first = connection(); first.write(`begin; set local role service_role; select ${begin()};`); await first.barrier();
  const next = connection(); const nextResult = next.end(`begin; set local role service_role; select ${begin()}; commit;`);
  await blocked(next.name); first.write('commit;'); const firstResult = await first.end();
  const old = JSON.parse(ok(firstResult)), newer = JSON.parse(ok(await nextResult));
  assert.ok(newer.generation > old.generation);
  assert.equal(ok(await sql(`set role service_role; select ${finish(newer, 'ACTIVE', "'2030-06-01T00:00:00Z'")};`)), 'processed');
  assert.equal(ok(await sql(`set role service_role; select ${finish(old, 'ACTIVE', "'2030-01-01T00:00:00Z'")};`)), 'stale');
  assert.equal(ok(await sql(`select current_period_end='2030-06-01T00:00:00Z' from public.clinic_subscriptions where clinic_id='${clinic}';`)), 't');
  console.log('PASS separate reconciliation connections + inverted completion + dates');

  // Reconciliation and webhook completion share the same fence; newer event wins.
  const independent = await claim();
  const event = `${eventPrefix}-race`;
  const eventLease = JSON.parse(ok(await sql(`set role service_role; select public.claim_paypal_webhook('${event}','BILLING.SUBSCRIPTION.ACTIVATED','${sub}');`)));
  const web = JSON.parse(ok(await sql(`set role service_role; select public.begin_paypal_reconciliation('${sub}','${event}','${eventLease.token}');`)));
  const holder = connection(); holder.write(`begin; set local role service_role; select ${finish(web)};`); await holder.barrier();
  const late = connection(); const lateResult = late.end(`set role service_role; select ${finish(independent)};`);
  await blocked(late.name); ok(await holder.end('commit;')); assert.equal(ok(await lateResult), 'stale');
  console.log('PASS independent reconciliation versus webhook completion');

  // Original three-way lock inversion: begin holds membership+fence, revocation
  // queues for membership, finalize must wait BEFORE taking the fence.
  const pending = await claim();
  const beforeRevocation = ok(await sql(`select to_jsonb(s) from public.clinic_subscriptions s where clinic_id='${clinic}';`));
  const ownerReader = connection(); ownerReader.write(`begin; set local role service_role; select ${begin()};`); await ownerReader.barrier();
  const revoker = connection(); revoker.write(`begin; update public.clinic_members set status='suspended' where clinic_id='${clinic}' and user_id='${actor}';`);
  const revoked = revoker.barrier();
  // Observe rejection immediately while another session's lock wait is inspected.
  // Awaiting the original promise below still propagates failures through cleanup.
  void revoked.catch(() => {});
  await blocked(revoker.name);
  const finalizer = connection(); const denied = finalizer.end(`set role service_role; select ${finish(pending)};`); await blocked(finalizer.name);
  ok(await ownerReader.end('commit;')); await revoked; ok(await revoker.end('commit;'));
  assert.equal(ok(await sql(`select status='suspended' from public.clinic_members where clinic_id='${clinic}' and user_id='${actor}';`)), 't');
  const denial = await denied;
  // The queued revocation need not win the membership lock. The intervening
  // begin already superseded this generation; stale must also prevent any apply.
  if (denial.code === 0) assert.equal(ok(denial), 'stale');
  else assert.match(denial.errors, /owner_required/);
  assert.doesNotMatch(denial.errors, /deadlock detected/);
  const afterRevocation = await sql(`set role service_role; select ${finish(pending)};`);
  assert.notEqual(afterRevocation.code, 0); assert.match(afterRevocation.errors, /owner_required/);
  assert.equal(ok(await sql(`select to_jsonb(s) from public.clinic_subscriptions s where clinic_id='${clinic}';`)), beforeRevocation);
  assert.equal(ok(await sql(`select state<>'applied' from public.paypal_reconciliations where id='${pending.id}';`)), 't');
  ok(await sql(`update public.clinic_members set status='active' where clinic_id='${clinic}' and user_id='${actor}';`));
  console.log('PASS queued owner revocation versus begin/finalize; no lock inversion');

  // Existing V1-02 approval RPC is exercised without PayPal. Completed intent
  // is an idempotent no-op but still takes its actual membership/intent/sub locks.
  const observed = await claim();
  const approval = connection(); approval.write(`begin; set local role service_role;
    select public.complete_paypal_billing_intent('${intent}','${clinic}','${actor}','basic','${sub}','P-LOCAL','active',null,null);`);
  await approval.barrier(); const reconciler = connection(); const applied = reconciler.end(`set role service_role; select ${finish(observed)};`);
  await blocked(reconciler.name); ok(await approval.end('commit;')); assert.equal(ok(await applied), 'processed');
  // Also model a genuine concurrent local row change during provider GET: CAS rejects it.
  const snapshot = await claim();
  ok(await sql(`update public.clinic_subscriptions set current_period_end='2030-07-01T00:00:00Z' where clinic_id='${clinic}';`));
  assert.equal(ok(await sql(`set role service_role; select ${finish(snapshot)};`)), 'requires_review');
  console.log('PASS completed approval lock interaction + local snapshot conflict');

  // Genuine first approval is uncommitted while an event arrives. An unknown
  // association must stay review-only until the owner approval commits.
  ok(await sql(`begin;
    insert into auth.users(id,email) values('${approvalActor}','${approvalActor}@example.test');
    insert into public.clinics(id,name) values('${approvalClinic}','V103B pending approval');
    insert into public.clinic_members(clinic_id,user_id,role,status) values('${approvalClinic}','${approvalActor}','owner','active');
    insert into public.paypal_billing_intents(id,clinic_id,user_id,plan_id,provider_plan_id,provider_subscription_id,status,creation_dispatched_at,previous_subscription_id)
      values('${approvalIntent}','${approvalClinic}','${approvalActor}','basic','P-LOCAL','${approvalSub}','pending',now(),
      (select provider_subscription_id from public.clinic_subscriptions where clinic_id='${approvalClinic}')); commit;`));
  const firstApproval = connection(); firstApproval.write(`begin; set local role service_role;
    select public.complete_paypal_billing_intent('${approvalIntent}','${approvalClinic}','${approvalActor}','basic','${approvalSub}','P-LOCAL','active',null,null);`);
  await firstApproval.barrier();
  const earlyEvent = `${eventPrefix}-approval`;
  const earlyLease = JSON.parse(ok(await sql(`set role service_role; select public.claim_paypal_webhook('${earlyEvent}','BILLING.SUBSCRIPTION.ACTIVATED','${approvalSub}');`)));
  const early = JSON.parse(ok(await sql(`set role service_role; select public.begin_paypal_reconciliation('${approvalSub}','${earlyEvent}','${earlyLease.token}');`)));
  assert.equal(early.state, 'requires_review'); assert.equal(early.identity_trusted, false);
  ok(await firstApproval.end('commit;'));
  const afterApproval = JSON.parse(ok(await sql(`set role service_role; select public.begin_paypal_reconciliation('${approvalSub}','${earlyEvent}','${earlyLease.token}');`)));
  assert.equal(afterApproval.state, 'claimed'); assert.equal(afterApproval.identity_trusted, true);
  assert.equal(ok(await sql(`set role service_role; select public.finish_paypal_reconciliation('${afterApproval.id}',${afterApproval.generation},'${approvalSub}','P-LOCAL','ACTIVE','${approvalIntent}',clock_timestamp(),clock_timestamp(),null,null);`)), 'processed');
  console.log('PASS uncommitted first approval versus webhook + recovery after commit');

  const expired = await claim();
  const expirer = connection(); expirer.write(`begin; update public.paypal_reconciliation_fences set lease_until=clock_timestamp()-interval '1 second' where provider_subscription_id='${sub}';`);
  await expirer.barrier(); const waiting = connection(); const expirationResult = waiting.end(`set role service_role; select ${finish(expired)};`);
  await blocked(waiting.name); ok(await expirer.end('commit;')); assert.equal(ok(await expirationResult), 'stale');
  const recovery = await claim(); assert.equal(ok(await sql(`set role service_role; select ${finish(recovery)};`)), 'processed');
  console.log('PASS lease expiration behind lock wait and recovery');

  // Lease valid at fence acquisition, but expires waiting for the subscription.
  const waitExpiry = await claim();
  ok(await sql(`update public.paypal_reconciliation_fences set lease_until=clock_timestamp()+interval '1 second' where provider_subscription_id='${sub}';`));
  const subHolder = connection(); subHolder.write(`begin; select 1 from public.clinic_subscriptions where clinic_id='${clinic}' for update;`); await subHolder.barrier();
  const delayed = connection(); const delayedResult = delayed.end(`set role service_role; select ${finish(waitExpiry)};`); await blocked(delayed.name);
  let elapsed = false;
  for (let n = 0; n < 100; n++) {
    if (ok(await sql(`select lease_until<=clock_timestamp() from public.paypal_reconciliation_fences where provider_subscription_id='${sub}';`)) === 't') { elapsed = true; break; }
    await delay(25);
  }
  assert.ok(elapsed); ok(await subHolder.end('commit;')); assert.equal(ok(await delayedResult), 'stale');
  console.log('PASS lease expires while waiting for final subscription lock');
} finally {
  // Roll back every outstanding local transaction before scoped synthetic cleanup.
  for (const child of [...sessions]) if (!child.stdin.writableEnded) child.stdin.end('rollback;\n');
  // Bounded sessions have statement/lock timeouts; wait for their closure.
  for (let n = 0; sessions.size && n < 700; n++) await delay(25);
  assert.equal(sessions.size, 0, 'Outstanding sessions: do not run cleanup while they remain');
  for (const fixture of [{ clinic, actor, intent, sub }, { clinic: approvalClinic, actor: approvalActor, intent: approvalIntent, sub: approvalSub }]) {
    ok(await sql(`begin;
      delete from public.paypal_reconciliations where provider_subscription_id='${fixture.sub}' and (clinic_id='${fixture.clinic}' or clinic_id is null);
      delete from public.paypal_reconciliation_fences where provider_subscription_id='${fixture.sub}';
      delete from public.paypal_webhook_events where provider_subscription_id='${fixture.sub}' and event_id like '${eventPrefix}%';
      delete from public.paypal_billing_intents where id='${fixture.intent}' and clinic_id='${fixture.clinic}' and user_id='${fixture.actor}';
      delete from public.clinic_subscriptions where clinic_id='${fixture.clinic}';
      delete from public.clinic_members where clinic_id='${fixture.clinic}' and user_id='${fixture.actor}';
      delete from public.clinics where id='${fixture.clinic}'; delete from auth.users where id='${fixture.actor}'; commit;`));
  }
}
