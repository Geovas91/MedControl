# ASSISTANT-002.4B / 002.4E — controlled live preparation

## Commands and current support

| Command | Boundary | Default |
| --- | --- | --- |
| `npm run test:assistant:qa` | Node unit/integration with mocked data/provider boundaries | Local only |
| `npm run test:assistant:qa:browser` | Chrome, actual React component and action/orchestration source; mocked services | Local only |
| `npm run test:assistant:qa:live` | Authenticated read-only browser smoke against the exact Staging origin | BLOCKED, exit 2 |
| `npm run test:assistant:qa:openai` | One request through the actual transport and planner | BLOCKED, exit 2 |
| `npm run test:assistant:qa:lifecycle -- --preflight` | Read-only normal-user lifecycle infrastructure audit | BLOCKED before login without explicit read opt-in |

The read-only Staging smoke and OpenAI smoke can be enabled later through secure process environment configuration without editing code. Neither loads `.env.local` automatically. Do not commit credentials, session state, provider responses, screenshots, traces or DOM dumps. Output contains only static status fields, booleans, stage names and a request count. Exit 0 means PASS, 1 means executed FAIL, 2 means BLOCKED before browser/network operation.

## Authenticated browser read-only smoke

Supply through the existing secure environment mechanism:

- `ASSISTANT_QA_STAGING_LIVE=1`
- `ASSISTANT_QA_LIVE_MODE=read_only`
- `ASSISTANT_QA_EMAIL`: authorized `qa.<role>.norte@clinicontrol.mx` or `qa.<role>.sur@clinicontrol.mx` account accepted by the gate.
- `ASSISTANT_QA_PASSWORD`: existing password; do not reset or guess it.
- `ASSISTANT_QA_CLINIC`: exactly `CliniControl QA Norte` or `CliniControl QA Sur`, matching the account.
- Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for an existing browser.

Run `npm run test:assistant:qa:live`. It uses only `https://staging.clinicontrol.mx`, logs in once through `/login`, checks the expected clinic label on the dashboard, opens `/dashboard/bot` and sends one synthetic appointment-read request. It awaits an appointment-list response and clears cookies/closes its fresh browser context even on failure. No result text or patient data is printed. The account allowlist and visible clinic label are guardrails, not proof of `tenant_type`, RLS or notification isolation.

The smoke creates no fixtures and does not select results, prepare proposals or confirm operations. A successful read does not prove provider success. Authentication, Supabase reads and LLM planning may execute on Staging when opted in; sessions and audit/rate-limit events may be written internally. This is not a lifecycle test: it always reports `liveLifecycle=BLOCKED`.

## One-request OpenAI smoke

Supply `ASSISTANT_QA_OPENAI_LIVE=1` and an existing `OPENAI_API_KEY` securely. The smoke uses `APPOINTMENT_ASSISTANT_LLM_MODEL` if configured, otherwise the application provider default. It never changes that variable or either LLM feature flag. Run `npm run test:assistant:qa:openai`.

The request uses a fixed synthetic agenda prompt with no names, identifiers, credentials or clinical information. It calls the production `requestOpenAiPlanner` transport (eight-second timeout, no retries, no tools) through `planAssistantConversation`. Actual planner events are observed within the dedicated CLI process and the original logger is restored afterward.

- `plannerInvoked`: observed `planner_called`.
- `plannerSuccess`: observed `planner_success` after successful provider transport and contract validation.
- `plannerFallback`: observed fallback, timeout or invalid-output event.
- `providerFailure`: transport failed, including malformed envelope/JSON.
- `requests`: at most one. A deterministic fallback yields FAIL even when it could answer the UI request.

This verifies the local transport/planner path to the provider when executed successfully. Verifying the deployed Staging process requires safe `planner_called`, `planner_success`, `planner_fallback`, `planner_timeout` or `planner_invalid_output` events for that Staging attempt.

## Live lifecycle gate — currently BLOCKED

002.4E adds a dedicated fixture manager, browser lifecycle runner and idempotent recovery/cleanup. The older `:live` command remains read-only. The new `:lifecycle` command offers `--preflight`, `--execute` and `--recover <run-id>`. Runtime notification/deployment evidence is still incomplete: credentials or flags alone cannot unblock writes. The checklist below remains mandatory.

1. Confirm the approved Supabase Staging project, active QA membership, `tenant_type=qa`, effective Assistant entitlement and allowed professional using the normal authorized QA user. Never substitute a service-role session or disable RLS.
2. Create a dedicated temporary fictitious patient with a unique run marker through the supported patient workflow. Do not treat persistent baseline patients as disposable. Use no real name/phone/email; verify the exact owned patient/clinic pair.
3. Verify real future availability through the protected slot engine. Availability uses clinic-member identity; appointment ownership uses user identity. Find an alternative slot without changing baseline availability rules.
4. Verify current outbound isolation independently for invitations/reminders/review email, WhatsApp and calendar connections/jobs. Review `deliverAppointmentCalendarEmail`, scheduler settings and integration paths. Prior isolation, a `.test` address, empty contact field or boolean assertion alone is insufficient proof of all channels. Do not change Staging configuration during QA.
5. Maintain a private per-run journal with exact owned references, clinic, creation receipts and expected state before subsequent operations. Recovery after a crash must retain cleanup scope. Shared reports contain only counts and resource kinds.
6. Through the authenticated browser, prepare/create/read/reschedule/cancel the temporary appointment with explicit confirmation. Verify no mutation at proposal and fresh persisted state after confirmation, with no duplicated booking.
7. Cleanup only run-created records: cancel the exact owned active appointment through the canonical authorized lifecycle, verify cancellation and absence of active booking, and cancel pending owned proposals. Archive/release the temporary patient through a supported authorized mechanism after ownership and absence of unrelated records are confirmed. Preserve required cancellation/audit history. Do not hard-delete or modify baseline resources.
8. Repeat cleanup to prove idempotency. On failure, retain FAIL/BLOCKED and safe counts of remaining owned artifacts. Resolve persisted state before retrying any ambiguous create/confirm result.

Existing RBAC/patient-scope/availability seed and cleanup scripts manage baseline datasets. They are not lifecycle cleanup tools and must not be run by this suite. No migration, deployment, production change, credential rotation or configuration change is included.

## 002.4E lifecycle command configuration

No live mutation was run during implementation. `--execute` and `--recover` below are documented for a separately authorized future execution only.

For read-only preflight, configure the invoking process securely:

- `ASSISTANT_QA_LIFECYCLE_READ=1`.
- Existing `ASSISTANT_QA_EMAIL`, `ASSISTANT_QA_PASSWORD`, `ASSISTANT_QA_CLINIC`. This stricter runner supports normal `qa.owner.norte` / `qa.owner.sur` accounts only, to verify clinic-wide safe projections and patient retirement permissions. No password guessing/reset.
- `ASSISTANT_QA_SUPABASE_URL=https://fnknctihnrryntkjqxeo.supabase.co` (exact approved Staging project).
- `ASSISTANT_QA_PUBLISHABLE_KEY`: public publishable/anon key only. Secret/service-role keys are rejected. Queries reuse cookies from the actual application login, never service-role impersonation.
- `ASSISTANT_QA_PROFESSIONAL_MEMBER`: exact authorized active QA professional's clinic-member reference, supplied privately.
- `ASSISTANT_QA_DATE`: actual future clinic-local ISO date with at least two distinct 30-minute half-hour slots on the same day. Gates re-run before writes, so availability can still block later stages.

Run `npm run test:assistant:qa:lifecycle -- --preflight`. Output is a static gate/status summary, never scope IDs, fixture names, cookies, prompts or database/provider errors. This checks authenticated membership, QA tenant type, subscription, professional, slots, current email readiness, scheduler settings, safe calendar status and supported patient form. Before patient creation, actual eligibility is explicitly deferred; it must pass the canonical RPC immediately after creation and before any appointment proposal.

Current built-in blockers, even with credentials and all opt-ins:

| Blocker | Safe resolution |
| --- | --- |
| `deployment` UNKNOWN | Supply a separately reviewed read-only mechanism that verifies the deployed build/process identity and relevant workers, bound to current Staging. No trusted runtime verifier exists in the present application. A claimed SHA/env flag cannot substitute. This requires follow-up implementation/review, not just credential configuration. |
| `whatsapp` UNKNOWN | The verified runtime mechanism must establish that no provider send path is enabled/reachable for this run. Current source shows a skeleton/skip path, which alone is insufficient for deployed proof. No override flag is provided. |
| Email enabled or settings/calendar active | Stop. Obtain verified isolation through a separately authorized operational process. Do not alter Staging configuration or integrations from this runner. |
| `patientEligibility` after creation | Read the exact new patient/professional eligibility via the canonical RPC. Failure triggers exact guarded cleanup; never assign baseline resources or bypass RLS. |
| LIVE-006 second account missing | Optional secure `ASSISTANT_QA_OTHER_EMAIL` / `ASSISTANT_QA_OTHER_PASSWORD` must identify the other QA owner. A second actual browser login verifies QA membership/tenant type and probes only this run's patient/appointment references for absence under that user's RLS. No unrelated records are enumerated or changed. Missing account means LIVE-006 BLOCKED/PARTIAL. |

## Private journal, future execution and recovery

Future execution additionally requires `ASSISTANT_QA_LIFECYCLE_MUTATIONS=1` and `ASSISTANT_QA_JOURNAL_KEY` containing a securely provisioned base64-encoded random 32-byte encryption key. Never echo or commit it. Retain it in the secure environment for recovery. Optional `ASSISTANT_QA_JOURNAL_DIRECTORY` must be outside this repository, including after symlink resolution; default is the user's private `.clinicontrol-qa` directory outside the checkout. Journal files are also ignored by Git as defense in depth. Encryption protects private references even on platforms where file mode bits do not implement user ACLs; operators should restrict directory access using native ACLs.

Only after the runtime blockers are resolved and live mutation execution is separately authorized: `npm run test:assistant:qa:lifecycle -- --execute`. It revalidates all gates before fixture writes, proposal/confirmation and cleanup. The journal contains unique run identity, scope, synthetic patient marker, exact owned references, write-ahead stage and revision; it never stores credentials/tokens, provider payloads or clinical data. Patient/booking ownership must be recovered by exact marker, creator/audit actor, clinic and creation time. Creation is never retried after an ambiguous result.

An interrupted journal may only enter `--recover <run-id>` with the same secure key/scope and mutation opt-in. It cannot resume creation. Run IDs/references and file paths stay in the private operator journal; share only status and remaining resource counts. An exclusive `.lock` prevents two runners using the same journal. Normal exit removes the lock; a crash intentionally leaves it. An operator must first verify that the previous process has stopped, then remove only that exact stale lock before recovery. Never automate lock stealing.

Cleanup cancels remaining owned active appointments through assistant proposals and explicit confirmation, preserves audit/cancellation history, verifies no active owned bookings, retires the exact patient as `inactive` through the edit form, and verifies retirement. It runs twice. Physical cancelled appointments, inactive patients and their draft/history/audit rows are intentionally retained. No archive/delete is improvised. Multiple unexpected bookings, a changed creator/scope or missing ownership evidence stop cleanup and retain the journal for review.

Pending proposals created in the current visible UI can be cancelled through that same UI. After a crash, the current application has no proposal-rehydration screen; the runner does not forge a server-action reference. A pending/claimed proposal blocks cleanup. Wait for a pending proposal's existing expiry and rerun read-only recovery checks before retrying cleanup; an unresolved claim requires operator investigation. Do not claim cleanup PASS in the meantime.

Exit 0 means all implemented scenarios and cleanup passed; exit 1 means a failed assertion/operation or cleanup failure; exit 2 means BLOCKED or PARTIAL (for example missing second-tenant evidence). These meanings apply to lifecycle outcomes; there were zero live mutations in this implementation task.
