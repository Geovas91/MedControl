# V1-03-B — PayPal reconciliation (review candidate, PARTIAL)

Base cc240810b0b7c55b80b9119e8f2c6b7ca7b2da90; branch codex/v1-03-b-paypal-reconciliation. No change to 0067, creation transport/idempotency/fences, prices, clinical functionality or V1-05. No remote/provider execution.

## Regression evidence before implementation

Two deterministic tests were added and run against the unchanged webhook:
- Old PAYMENT.FAILED + provider ACTIVE: expected active, actual past_due (FAIL).
- Different events with deferred older ACTIVE GET, newer CANCELLED completion, then older completion: expected cancelled, actual active (FAIL).

The final regression suite uses the real shared TypeScript engine and a deterministic model of atomic DB fencing. These tests demonstrate orchestration behavior; they do not prove the PostgreSQL implementation under concurrency.

## Architecture

0068 adds RLS-protected paypal_reconciliation_fences and paypal_reconciliations. Application roles cannot mutate them directly; service_role can read and execute fixed-search-path SECURITY DEFINER RPCs. Each attempt records expected clinic/actor/event token, local row fingerprint and generation. Provider subscription identity is globally unique in the existing subscription model. Unknown associations become durable requires_review records without adopting webhook custom IDs as tenant identities.

Begin increments a per-provider-subscription generation and issues a two-minute lease. Every new attempt supersedes earlier in-flight attempts, including a live older lease; this deliberately favors freshness and may cause retryable starvation under heavy activity. GET occurs outside the DB transaction. Finalize locks/checks current generation, lease, exact subscription/plan/custom ID when present, local snapshot, owner membership for independent operations, provider timestamps and terminal-state rules. Fixed UTC makes the tuple fingerprint independent of the caller timezone. Approval during GET invalidates the row fingerprint; existing approval after cancellation remains protected by 0067. No historical intent or creation fence is cleared.

OBSERVED is in process memory; validated observations become VERIFIED, then APPLIED atomically with subscription/event updates. Conflicting observations retain minimal audit fields and requires_review, including provider_mismatch and identity_unverified detected before finalization. Provider unavailability records failed; if the failure marker itself is unavailable, claimed attempt/expired lease remains recoverable. A lost commit acknowledgment is not reported as success and never creates another provider resource. Unsupported events use a separate lease-checked ignore-only RPC. The old finish_paypal_webhook EXECUTE grant is revoked from service_role so production cannot use its unfenced writer directly; fenced finalization invokes it internally.

Payment failure event type no longer overrides an authenticated current ACTIVE observation. Cancelled local subscriptions cannot be revived automatically even by an ACTIVE response; manual review is required. Older provider timestamps, missing timestamps after a known provider version, equal timestamp with a conflicting state, future timestamps and stale generations fail closed/review. Timestamp ordering supplements generation/local CAS and never replaces it. This can conservatively reject legitimate transitions; no automatic override is installed.

## Independent operation

reconcileCurrentClinicSubscription('inspect'|'apply') is server-only and derives actor/clinic using existing owner authorization. No arbitrary provider ID endpoint or scheduler exists. Inspect performs provider verification without claims/journal writes and returns only verified/applied=false or requires_review; it does NOT promise a safe apply decision. Apply rechecks authorization in SQL, shares the webhook fence and returns sanitized state. No independent operation was invoked against PayPal. Historical pending intents are deliberately not automatically bound/completed: absent subscription associations remain requires_review for separately authorized historical resolution.

## Independent review remediation

Reviewed parent: 2d21639c49c2a063d6f6ed40a1fc87d678a24e60. These corrections address that review; another independent review remains required.

### Provider dates

The verified observation now carries optional start_time and billing_info.next_billing_time through the production RPC adapter into finish_paypal_reconciliation. Its corrected signature is `(uuid,bigint,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz)`, with p_start and p_end last and explicit null arguments when absent. Both webhook/internal legacy finalization and independent finalization apply COALESCE within the fenced transaction. No subscription columns were added.

TypeScript checks RFC3339 syntax, actual calendar dates and finite instants; unsupported leap seconds fail closed. SQL's timestamptz types reject malformed syntax and explicit isfinite checks reject infinity. Both supplied dates must be consistent; SQL also checks a partial update against preserved dates. Missing fields preserve existing values. Old generations, older provider status observations and backwards period changes cannot overwrite stored dates. A backwards schedule change is conservatively requires_review, even if legitimate. Equal status_update_time may advance a schedule: it versions status, not billing periods. start_time retains its existing provider meaning, and next_billing_time is a billing schedule observation, never proof of prepaid entitlement. Future scheduled dates are allowed; future status/verification times retain the existing bounded checks.

### Explicit identity policy

[PayPal's subscription schema](https://developer.paypal.com/api/subscriptions/v1/definitions/subscription/) makes custom_id optional. Absence alone therefore neither validates nor invalidates identity. A present conflicting value always fails. The local binding must also have a completed billing intent with non-null completed_at and creation_dispatched_at, matching clinic, provider subscription ID, provider plan and local plan. This is provenance from the existing owner-authorized approval flow, which verified custom_id when binding/completing; it is not a new assertion of provider payment. Begin returns identity_trusted only with that evidence; finish rechecks the binding. Inspect uses the same evidence predicates. Pending/expired unresolved intents, imported bindings without this provenance and unknown subscriptions stay requires_review/identity_unverified. Webhook payloads never establish a clinic association. Historical records are not modified or reconciled automatically.

### Lock graph and leases

| Writer | Lock sequence |
| --- | --- |
| Independent begin | owner membership FOR SHARE -> subscription fence; subscription/intent reads do not lock rows |
| Independent finish | owner membership FOR SHARE -> fence -> attempt -> subscription FOR UPDATE |
| Webhook begin/finish | event FOR UPDATE -> fence -> attempt (finish) -> subscription FOR UPDATE (finish) |
| claim/fail/ignore webhook | event only |
| Legacy finish (internal only) | event -> subscription; both already held by fenced caller |
| V1-02 begin/claim creation | clinic advisory lock -> membership -> subscription -> intent |
| V1-02 approval | clinic advisory lock -> membership -> intent -> subscription |

0067 is unchanged; its opposite subscription/intent ordering is serialized by the same clinic advisory lock. Reconciliation never locks an intent or requests that advisory lock, so it adds no reverse edge there. Membership invitation/capability writers can lock membership (and their separate capacity locks), but reconciliation does not acquire their capacity locks or invitations. No new advisory locks were introduced. Moving membership ahead of the fence/subscription in finish removes the reviewed queue-inversion path with owner revocation. The real multi-session test remains unexecuted, so deadlock freedom is not claimed. Future writers must be reviewed against this graph, including any triggers.

Finalization rechecks its lease after waiting for the subscription lock and checks the webhook token/live lease at that point using clock_timestamp. Losing a lease cannot authorize a late write. Membership checks remain held through the write; revocation committed first denies finalization. An already completed event cannot be reverted by a failure marker after a lost acknowledgment.

## SQL artifacts and execution limits

supabase/tests/0068_paypal_reconciliation.sql is PREPARED, NOT EXECUTED. It has 78 prepared pgTAP assertions (48 existing plus 30 emitted by the strict-interval matrix) (not an executed assertion count): grants, definer ownership/search_path, RLS, real owner of another clinic, cross-clinic binding rejection, all four optional date combinations in both finalization paths, persisted values, malformed/non-finite/inconsistent dates, trusted missing custom, unresolved historical binding, stale generations/provider times/backwards dates, equal status versions with schedule advancement/state conflict, terminal protection and expired leases. Sequential interleaving is not a real independent-connection concurrency result.

scripts/test-paypal-reconciliation-concurrency.mjs is PREPARED, NOT EXECUTED. It opens separate psql processes, waits for barriers and observes pg_blocking_pids rather than inferring overlap from sleeps. Scenarios: competing begins and inverted completion; independent versus webhook completion; three-way begin/queued owner revocation/finalize; existing approval locks and snapshot conflict; first approval uncommitted versus early webhook and recovery; lease expiry waiting for the fence and for the subscription. Only JavaScript syntax was checked locally. Execution also remains necessary to validate the harness itself.

No new database lab was initialized because previous safety restrictions remain in force. Read-only Docker inventory found no running target labelled clinicontrol.qa.disposable=v103b-reviewed. Actual migration execution, pgTAP and separate-connection races are BLOCKED pending an independently authorized disposable PostgreSQL environment. Do not rename, relabel or reuse another project's DB to satisfy these guards. Do not deploy or merge on unit results alone.

Required database acceptance before readiness:
1. Restore the reviewed pre-0068 baseline in an authorized isolated target; apply 0068 locally with ON_ERROR_STOP.
2. Run 0035/0067 compatible regressions (update legacy-finish invocation in a review-specific test harness since direct service-role EXECUTE is intentionally revoked) and 0068 pgTAP; report actual assertions.
3. Use two independent connections for generation claims and inverted finalization; verify final cancelled state and stale audit evidence.
4. Race approval versus finalization, lease expiry/reclaim, owner revocation, lost acknowledgments, custom/plan mismatches, same provider timestamp with differing states and unknown association then later approval.
5. Verify effective column/table/function grants, RLS, no bypass of legacy writer, pending unique index and unchanged creation fences.

After independent authorization/provisioning only, the prepared runner requires an already running container named clinicontrol-v103b-acceptance-<id>, label clinicontrol.qa.disposable=v103b-reviewed, network none, no ports, no mounts, unprivileged, local socket /var/run/postgresql, PostgreSQL 17+ database clinicontrol_v103b_acceptance and baseline through the corrected 0068. It never initializes a lab, reads dotenv or accepts a remote connection string. Example (placeholder must be replaced by the approved disposable name): `node scripts/test-paypal-reconciliation-concurrency.mjs --container clinicontrol-v103b-acceptance-<id>`. It creates only synthetic local fixtures and cleans only its generated identities; crashes may require scoped manual recovery. Do not execute it against existing persistent CliniControl/RestoPilot containers. Run pgTAP with ON_ERROR_STOP and verify its TAP output, not just psql's exit code.

## V1-03-C integration

Cancellation must claim the same fence BEFORE its provider operation, persist one-use dispatch evidence and use a protected transactional finalize/reverification. Reconciliation must not invalidate an in-flight cancellation and authorize another cancellation POST: add a reviewed operation-type/dispatch fence before enabling C. This B generation protocol is for read-only provider GETs; it is NOT authorization to retry provider mutations. Cancellation UI/endpoints, end-of-period entitlements and replacement flows are not implemented here.

## Validation

- Focused billing/provider/creation/reconciliation tests: 133 PASS, 0 FAIL, 0 SKIP.
- Full unit suite: 938 PASS, 0 FAIL, 0 SKIP.
- TypeScript --noEmit --incremental false: PASS.
- ESLint: 0 errors, two pre-existing patient-actions navigation warnings.
- git diff --check: PASS.
- SQL execution / real PostgreSQL concurrency: BLOCKED, not PASS.
- Independent review: PENDING. No CI PASS claimed.

Tests include duplicate events, deferred older observations, timeout, expired lease, approval snapshot conflict, terminal protection, pre-approval association failure, ID/plan/custom/status/time rejection and lost finalization/failure-marker errors. Existing owner/tenant/signature/error/creation tests remain passing. Authorization in the new SQL and true race behavior remain unverified until database acceptance; mocks alone cannot close them.

The reconciliation journal double now separately models received, processing, failed and processed, tokens, lease expiry and attempt counts. Tests exercise the real shared engine and production RPC projection (reconciliation-rpc.ts); persistence/locking remain simulated. Coverage includes failure after claim/GET, failed event redelivery, busy duplicates, processed duplicates, commit acknowledgment loss without journal reversion, failure-marker outages and expired token recovery. The older billing-handler tests intentionally stub reconciliation as route-level tests; the new engine/adapter tests supply the orchestration coverage, not database proof.

## Protected cutover prerequisite (not executed)

Old application + 0068 is incompatible: old webhook writer loses EXECUTE. New application + 0067 is incompatible: reconciliation RPCs are missing. Before any separately authorized deployment, pause/drain webhook/independent writers across every running release/worker, retain undelivered events for retry, verify approved backups, apply the reviewed 0068 and activate matching application code while writers remain blocked, verify exact signatures/grants/health, then reopen processing. There must be no old writer running during the mixed-version interval. A code-only rollback to V1-02 is incompatible with revoked legacy EXECUTE; plan a separately reviewed coordinated database/application rollback. Do not grant the legacy writer back ad hoc. This edited 0068 is only for environments where 0068 has never been applied; it is not a live upgrade migration for an earlier candidate schema.

Deployment requires independent review, approved SQL/concurrency acceptance, compatible protected application/migration cutover (old webhook writer loses EXECUTE), confirmed backup/recovery and separate authorization. No production/Staging/Supabase/PayPal mutation performed. Overall V1_03_B_IMPLEMENTATION=PARTIAL; not DONE.

Remediation code/local validation: V1_03_B_REMEDIATION=PASS. Database acceptance: V1_03_B_SQL_ACCEPTANCE=BLOCKED. These separate statuses do not approve integration or provisioning. The next step is independent review of this remediation, then explicit authorization for a disposable lab and execution of the prepared migration/SQL/concurrency acceptance; retain the PR as Draft until those gates are resolved.

## Strict billing period follow-up

The final read-only review found that equal endpoints passed validation but violated the unchanged 0003 CHECK. verifyObservation now rejects end <= start using parsed instants, including equivalent timezone offsets. Malformed-date checks are unchanged. finish_paypal_reconciliation rejects effective_end <= effective_start using COALESCE with existing dates, before any subscription update, classifying the attempt requires_review/provider_mismatch. The comparison is shared by independent and webhook finalization. Migrations 0003 and 0067 and the existing period CHECK are unchanged.

Seven additional unit tests cover identical and offset-equivalent instants, rejection through the production RPC adapter under both authorizations without calling finalization, safe audit reason projection, and a strictly later instant with an offset. Existing earlier-end, valid partial, absent-date and malformed-date tests remain. SQL adds a 2-path x 5-scenario x 3-assertion matrix: equal, offset-equal, earlier, start-only-equal and end-only-equal. It checks requires_review, durable provider_mismatch audit state (never applied), and equality of the entire stored subscription including status, dates and updated_at. Existing SQL assertions cover valid partial updates and absent fields. Partial validation is transactional SQL behavior, not established by unit mocks.

Local results: 133 focused and 938 complete unit tests PASS, no failures/skips. PostgreSQL execution remains BLOCKED; 78 is the prepared assertion count, not an executed result. No lab was created and no remote migration or provider request was performed. V1_03_B_PERIOD_FIX=PASS applies only to this focused correction; V1_03_B_SQL_ACCEPTANCE=BLOCKED and the complete milestone remains PARTIAL pending database acceptance and independent review.
## Persisted acceptance harness corrections (current status)

At 1b30c32cf1b22f7b1f8855024af19926867a1cfb, an explicitly authorized ONE-container PostgreSQL 17.6 lab applied 0001–0068 successfully. Actual final results were 0068 78/78, 0067 29/29, TEMP-adapted 0035 63/63, and TEMP-adapted concurrency 7/7 groups. The original 0035 had two obsolete expectations; the original concurrency runner failed. The lab was removed. Earlier BLOCKED/PREPARED descriptions above record the pre-acceptance state; they are not a statement that no SQL execution ever occurred.

Permanent changes affect tests/docs only:
- 0035 remains version-aware: before the corrected 0068 finish RPC exists, service_role must retain legacy-finalizer EXECUTE; afterward it must lack it. All other original client-denial and service grants remain checked.
- Unauthorized subscription UPDATE must either throw insufficient_privilege when the role lacks table UPDATE, or return zero changed rows under RLS when table UPDATE exists. The subsequent stored-status assertion remains. No permissions or RLS are changed. The suite still emits 63 assertions.
- The runner revokes membership using suspended, attaches an immediate rejection handler while awaiting other sessions, and accepts only stale or owner_required from the superseded attempt. It checks successful revocation COMMIT and the suspended row, then explicitly requires owner_required on a new finalization call after that commit. It additionally compares the complete subscription snapshot and checks that the attempted reconciliation is not applied.
- Separate psql processes, transaction barriers, pg_blocking_pids checks, container identity guards and generated-fixture cleanup are retained.

These permanent files are not byte-identical to the TEMP copies: version detection, dual ACL/RLS handling and extra no-write/commit assertions strengthen reproducibility. Previous adapted SQL results must not be advertised as execution of these exact repository-native files. Current native SQL reproducibility is PENDING. No new laboratory is authorized by the consumed previous one-container authorization.

After new explicit lab authorization and successful provisioning of the same documented isolated target (PostgreSQL 17+, pgTAP, authentic Supabase dependencies, reviewed migrations through 0068), run from the repository root in PowerShell:

```powershell
# Set $lab to the newly authorized container name; do not reuse a persistent DB.
docker cp supabase/tests "${lab}:/lab/tests"
foreach ($suite in @('0035_paypal_billing_hardening.sql', '0067_paypal_duplicate_subscription_prevention.sql', '0068_paypal_reconciliation.sql')) {
  docker exec $lab psql -X -qAt -h /var/run/postgresql -U postgres -d clinicontrol_v103b_acceptance -v ON_ERROR_STOP=1 -f "/lab/tests/$suite"
  if ($LASTEXITCODE -ne 0) { throw "SQL execution failed: $suite" }
  # Inspect TAP as well: no 'not ok', correct plans 1..63, 1..29, 1..78.
  # A zero psql exit code alone is not a TAP PASS.
}
node scripts/test-paypal-reconciliation-concurrency.mjs --container $lab
if ($LASTEXITCODE -ne 0) { throw 'Concurrency acceptance failed' }
```

No temporary SQL or runner patch is needed by these commands. They have NOT been rerun in this harness-persistence task. Historical post-0035/pre-0068 compatibility also needs execution against its matching authorized baseline. No grants should be restored to satisfy tests. Independent review, a newly authorized native PostgreSQL run and integration authorization remain pending; V1-03-B is not DONE.
Local validation after persistence: node --check runner PASS; complete unit suite 938/938 PASS, zero failures/skips; TypeScript --noEmit --incremental false PASS; ESLint zero errors and two pre-existing patient-actions navigation warnings; git diff --check PASS. No PostgreSQL tests rerun. V1_03_B_HARNESS_REMEDIATION=PASS; V1_03_B_REPOSITORY_SQL_REPRODUCIBILITY=PENDING.
