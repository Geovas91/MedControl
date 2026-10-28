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

OBSERVED is in process memory; validated observations become VERIFIED, then APPLIED atomically with subscription/event updates. Conflicting verified observations retain minimal audit fields and requires_review. Failures are durably classified provider_mismatch/provider_unavailable; if the failure marker itself is unavailable, claimed attempt/expired lease remains recoverable. A lost commit acknowledgment is not reported as success and never creates another provider resource. Unsupported events use a separate lease-checked ignore-only RPC. The old finish_paypal_webhook EXECUTE grant is revoked from service_role so production cannot use its unfenced writer directly; fenced finalization invokes it internally.

Payment failure event type no longer overrides an authenticated current ACTIVE observation. Cancelled local subscriptions cannot be revived automatically even by an ACTIVE response; manual review is required. Older provider timestamps, missing timestamps after a known provider version, equal timestamp with a conflicting state, future timestamps and stale generations fail closed/review. Timestamp ordering supplements generation/local CAS and never replaces it. This can conservatively reject legitimate transitions; no automatic override is installed.

## Independent operation

reconcileCurrentClinicSubscription('inspect'|'apply') is server-only and derives actor/clinic using existing owner authorization. No arbitrary provider ID endpoint or scheduler exists. Inspect performs provider verification without claims/journal writes and returns only verified/applied=false or requires_review; it does NOT promise a safe apply decision. Apply rechecks authorization in SQL, shares the webhook fence and returns sanitized state. No independent operation was invoked against PayPal. Historical pending intents are deliberately not automatically bound/completed: absent subscription associations remain requires_review for separately authorized historical resolution.

## SQL artifacts and execution limits

supabase/tests/0068_paypal_reconciliation.sql is PREPARED, NOT EXECUTED. It includes ACL checks, owner/cross-tenant denial, interleaved generations, terminal protection and expired leases. Sequential interleaving is not a real independent-connection concurrency result. No new database lab was initialized because previous safety restrictions remain in force. Actual migration execution, pgTAP and separate-connection races are BLOCKED pending an independently permitted disposable PostgreSQL environment. Do not deploy or merge on unit results alone.

Required database acceptance before readiness:
1. Restore the reviewed pre-0068 baseline in an authorized isolated target; apply 0068 locally with ON_ERROR_STOP.
2. Run 0035/0067 compatible regressions (update legacy-finish invocation in a review-specific test harness since direct service-role EXECUTE is intentionally revoked) and 0068 pgTAP; report actual assertions.
3. Use two independent connections for generation claims and inverted finalization; verify final cancelled state and stale audit evidence.
4. Race approval versus finalization, lease expiry/reclaim, owner revocation, lost acknowledgments, custom/plan mismatches, same provider timestamp with differing states and unknown association then later approval.
5. Verify effective column/table/function grants, RLS, no bypass of legacy writer, pending unique index and unchanged creation fences.

## V1-03-C integration

Cancellation must claim the same fence BEFORE its provider operation, persist one-use dispatch evidence and use a protected transactional finalize/reverification. Reconciliation must not invalidate an in-flight cancellation and authorize another cancellation POST: add a reviewed operation-type/dispatch fence before enabling C. This B generation protocol is for read-only provider GETs; it is NOT authorization to retry provider mutations. Cancellation UI/endpoints, end-of-period entitlements and replacement flows are not implemented here.

## Validation

- Focused billing/provider/creation/reconciliation tests: 85 PASS, 0 FAIL.
- Full unit suite: 890 PASS, 0 FAIL, 0 SKIP.
- TypeScript --noEmit --incremental false: PASS.
- ESLint: 0 errors, two pre-existing patient-actions navigation warnings.
- git diff --check: PASS.
- SQL execution / real PostgreSQL concurrency: BLOCKED, not PASS.
- Independent review: PENDING. No CI PASS claimed.

Tests include duplicate events, deferred older observations, timeout, expired lease, approval snapshot conflict, terminal protection, pre-approval association failure, ID/plan/custom/status/time rejection and lost finalization/failure-marker errors. Existing owner/tenant/signature/error/creation tests remain passing. Authorization in the new SQL and true race behavior remain unverified until database acceptance; mocks alone cannot close them.

Deployment requires independent review, approved SQL/concurrency acceptance, compatible protected application/migration cutover (old webhook writer loses EXECUTE), confirmed backup/recovery and separate authorization. No production/Staging/Supabase/PayPal mutation performed. Overall V1_03_B_IMPLEMENTATION=PARTIAL; not DONE.