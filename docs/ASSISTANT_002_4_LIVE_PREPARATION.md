# ASSISTANT-002.4B — controlled live preparation

## Commands and current support

| Command | Boundary | Default |
| --- | --- | --- |
| `npm run test:assistant:qa` | Node unit/integration with mocked data/provider boundaries | Local only |
| `npm run test:assistant:qa:browser` | Chrome, actual React component and action/orchestration source; mocked services | Local only |
| `npm run test:assistant:qa:live` | Authenticated read-only browser smoke against the exact Staging origin | BLOCKED, exit 2 |
| `npm run test:assistant:qa:openai` | One request through the actual transport and planner | BLOCKED, exit 2 |

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

There is no verified temporary-fixture and notification-isolation adapter here. The live command refuses mutation mode; flags or a self-attested JSON file cannot enable it. This section is a preparation procedure, not an executable lifecycle suite. Completing that adapter remains work; credentials alone cannot unblock lifecycle writes.

1. Confirm the approved Supabase Staging project, active QA membership, `tenant_type=qa`, effective Assistant entitlement and allowed professional using the normal authorized QA user. Never substitute a service-role session or disable RLS.
2. Create a dedicated temporary fictitious patient with a unique run marker through the supported patient workflow. Do not treat persistent baseline patients as disposable. Use no real name/phone/email; verify the exact owned patient/clinic pair.
3. Verify real future availability through the protected slot engine. Availability uses clinic-member identity; appointment ownership uses user identity. Find an alternative slot without changing baseline availability rules.
4. Verify current outbound isolation independently for invitations/reminders/review email, WhatsApp and calendar connections/jobs. Review `deliverAppointmentCalendarEmail`, scheduler settings and integration paths. Prior isolation, a `.test` address, empty contact field or boolean assertion alone is insufficient proof of all channels. Do not change Staging configuration during QA.
5. Maintain a private per-run journal with exact owned references, clinic, creation receipts and expected state before subsequent operations. Recovery after a crash must retain cleanup scope. Shared reports contain only counts and resource kinds.
6. Through the authenticated browser, prepare/create/read/reschedule/cancel the temporary appointment with explicit confirmation. Verify no mutation at proposal and fresh persisted state after confirmation, with no duplicated booking.
7. Cleanup only run-created records: cancel the exact owned active appointment through the canonical authorized lifecycle, verify cancellation and absence of active booking, and cancel pending owned proposals. Archive/release the temporary patient through a supported authorized mechanism after ownership and absence of unrelated records are confirmed. Preserve required cancellation/audit history. Do not hard-delete or modify baseline resources.
8. Repeat cleanup to prove idempotency. On failure, retain FAIL/BLOCKED and safe counts of remaining owned artifacts. Resolve persisted state before retrying any ambiguous create/confirm result.

Existing RBAC/patient-scope/availability seed and cleanup scripts manage baseline datasets. They are not lifecycle cleanup tools and must not be run by this suite. No migration, deployment, production change, credential rotation or configuration change is included.
