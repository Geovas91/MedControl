# ASSISTANT-002.4B / 002.4E / 002.4F / 002.4G — controlled live preparation

## 002.4G current execution package

Use `ASSISTANT_002_4G_OPERATOR.md` for the ordered backup/deployment/isolation/verification/preflight/recovery session. The earlier 002.4F procedure remains historical read-only collection guidance; its Node-24 streaming observer is separate from the new Node-22-compatible file-based release helper. Preserve the **current** Staging OpenAI configuration and behavior; any historical requirement to disable LLM flags is superseded.

[Outbound protection PR #94](https://github.com/Geovas91/MedControl/pull/94) adds actual Resend/Calendar/WhatsApp boundary protection and an early Cron stop; PR #93 retains QA-only discovery and release-witness tooling. Neither is deployed. New runs discover a protected QA professional and two real future slots; no internal UUID/date is required. Recovery pins the encrypted journal's professional and verifies the authenticated actor/clinic. Runtime deployment/WhatsApp gates remain UNKNOWN: receipts or readiness fields alone cannot authorize writes. A trusted verifier integration is still a separate reviewed prerequisite, explicitly described in the operator package.

READY FOR READ-ONLY PREFLIGHT: YES

READY FOR CONTROLLED STAGING DEPLOYMENT: YES (reviewed integrated candidate/operator prerequisites required)

READY FOR LIVE MUTATIONS: NO

## 002.4F — read-only DonWeb runtime evidence procedure

This procedure is prepared, NOT executed on DonWeb. No SSH session, runtime report, worker inventory or deployment receipt was available in this task. Source audit baseline: `c893be6da9ac5496ca3fdf3a27570d82f26b8119`. Local collection time is embedded in each report; source-review execution date: 2026-10-21. Source observations below do not attest Staging.

DEPLOYMENT IDENTITY: UNKNOWN

WHATSAPP ISOLATION: UNKNOWN (inspected source has no sending transport; deployed code and independent senders unverified)

OTHER OUTBOUND CHANNELS: email, Google Calendar, OpenAI and PayPal exist; effective runtime isolation UNKNOWN

BACKGROUND WORKERS: UNKNOWN

RUNTIME EVIDENCE: NOT COLLECTED; the new collector emits observations, never a verification credential

UNVERIFIED CONDITIONS: artifact provenance, loaded code, proxy/listener mapping, effective environment, every worker/scheduler/host and outbound egress

READY FOR READ-ONLY PREFLIGHT: YES — operator procedure and local observer prepared; runtime acceptance pending

READY FOR LIVE MUTATIONS: NO

### Required operator commands and collection boundaries

Run only on the existing Staging server, as the existing application owner, through the authorized administrative session. Confirm Staging host/site and the exact application directory in CloudPanel first; never infer it from the example path in the deployment runbook. Do not use production. Keep raw management screens/configuration private. Do not share environment dumps, process command lines, logs, Nginx configuration, crontab bodies or provider responses. Those can contain tokens, URLs with credentials, messages and patient information.

1. Obtain a **reviewed copy** of `scripts/qa/assistant-runtime-evidence.ts` from this PR on the operator workstation. Verify its SHA-256 against the reviewed file, then stream it to an existing authorized SSH session as below. This does not install code or modify the deployed checkout. Do not run `npm install`, build, Git checkout/pull, PM2 commands or any application module on the server. The observer uses only Node builtins and read-only Git `rev-parse`; it opens no network connection and does not use Supabase. The streaming procedure requires an already installed Node 24 supporting `--input-type=module-typescript`. If absent, STOP/UNKNOWN: do not install or upgrade Node during collection.

2. From CloudPanel's existing process management view, identify the PM2 application named `clinicontrol-staging`, its PM2 ID, owner, current status, PID, configured working directory and restart/start timestamp. Record only those metadata and UTC collection time in a private evidence record. If there is no existing read-only PM2 view, mark PM2 identity UNKNOWN. Do not start PM2 to inspect it. In particular `pm2 jlist`, `pm2 describe`, `pm2 env` and `pm2 report` are not recommended collection commands: they can expose environment/arguments, and the CLI may start a daemon if one is absent. A stale `dump.pm2` or PID file is not current process evidence.

3. Substitute the verified absolute Staging directory and the **numeric current PID** below (the named SSH host is the operator's already configured Staging alias). Do not paste credentials in commands. Run from the reviewed workstation checkout:

```powershell
Get-FileHash scripts/qa/assistant-runtime-evidence.ts -Algorithm SHA256
Get-Content -Raw scripts/qa/assistant-runtime-evidence.ts | ssh STAGING_ALIAS 'node --experimental-strip-types --input-type=module-typescript - /VERIFIED/STAGING/ROOT 12345'
```

The observer CLI also supports `node --experimental-strip-types /ALREADY/REVIEWED/observer.ts /VERIFIED/STAGING/ROOT 12345` if the file is already present outside the application. It does not create a report file; capture only sanitized stdout using the operator's approved evidence storage. No copy into the app, upload, deployment, service restart or configuration change is needed. On unsupported OS, unavailable scope or bad arguments it exits 2 with a fixed error. A JSON report means collection completed, **not PASS**. Missing fields remain null/UNKNOWN.

4. The PM2 PID may be an `npm start` wrapper. Inspect `directChildren` in the report, then collect again for each descendant until the actual Next server/listener is identified. Every report has PID, parent PID, kernel start ticks, state, cwd equality/hash and collection time. A cwd hash can be compared with the known operator directory hash; the observer deliberately does not print directory names or command lines. Have the operator privately map the proxy's upstream port/socket to its owning PID using the existing CloudPanel/network management view; record only match/mismatch, PID, source and time. Do not run `nginx -T`, `ss -p` with unfiltered output or publish command lines. If listener ownership/proxy routing cannot be established, keep it UNKNOWN. Parent-child correlation alone is insufficient.

5. Check the two process stability observations and repeated build hashes. PID disappearance/reuse, mismatched cwd, zombie/dead state, changing build or incomplete artifacts invalidate the observation. Repeat collection after investigation without restarting anything. A stable PID plus unchanged hashes is still **not** proof of the loaded artifact. `/proc/PID/environ` describes initial environment, may omit Next/dotenv-loaded values and cannot attest effective configuration. The report outputs only allowlisted SET / NOT_SET / UNKNOWN classifications, never values or secret hashes. A configured key is not proof of a working provider; a missing key there is not proof it is unavailable to application code. Do not inspect `.env*` by printing or sourcing them.

6. Collect only public health **status codes**, not bodies or arbitrary endpoints, from the operator workstation:

```powershell
(Get-Date).ToUniversalTime().ToString('o')
curl.exe --silent --output NUL --write-out 'health_http=%{http_code}\n' --max-time 10 https://staging.clinicontrol.mx/api/health
curl.exe --silent --output NUL --write-out 'ready_http=%{http_code}\n' --max-time 10 https://staging.clinicontrol.mx/api/ready
```

Do not follow redirects or attach auth/cookies. Health/readiness success establishes availability only; neither endpoint returns artifact/process provenance. Existing authenticated lifecycle preflight may separately read the safe readiness email classification, QA tenant scheduler flags and calendar projection under its existing opt-in. It still stops before fixtures on UNKNOWN deployment/WhatsApp gates.

7. In existing read-only infrastructure consoles, inventory **all** PM2 applications/owners/homes, CloudPanel sites, system and user systemd services/timers, all users' cron/anacron jobs, container workloads, external schedulers/CI jobs, and Supabase cron/Edge functions/webhooks. Do not execute a job, invoke `/api/internal/appointment-automations/run`, fetch database payloads, edit/disable schedules or install inspection tools. An administrator should inspect definitions privately and issue a sanitized table: workload alias, supervisor kind, owner alias, PID/build digest if applicable, active/scheduled state, outbound capability, review UTC time/source, coverage limitations. Use opaque aliases for private names and omit arguments entirely; do not hash credentials or private payloads. Record unavailable permissions as UNKNOWN; the collector's direct child list is not a host-wide inventory. Inspect effective configuration privately through the existing authorized manager and report only predicates (e.g. staging origin/project match, current OpenAI configuration remains unchanged, provider isolation demonstrated), never raw values. Do not alter any variable, including `APPOINTMENT_ASSISTANT_LLM_ENABLED` and `APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED`.

8. Independently review the resulting source/build/process observations, proxy mapping, worker inventory and outbound policy evidence. Record operator identity using an approved non-sensitive alias, host alias, UTC interval, reviewed PR SHA, collector file digest, scope, source of each assertion and explicit unknowns. Retain private evidence securely; do not commit it. No real WhatsApp/email/calendar test is part of collection. No egress probe should call a provider's send endpoint.

### What existing architecture can and cannot establish

The DonWeb runbooks describe Git checkout → `next build` in a mutable directory → PM2 `npm start` → reverse proxy. `next.config.mjs` has no custom build provenance or runtime identity endpoint. The collector distinguishes checkout HEAD, four artifact hashes (including hashed `.next/BUILD_ID`) and kernel process identity. BUILD_ID is a build label, not a commit receipt. These four hashes are samples, not a digest of the entire deployable tree. Dirty source, build-time public environment, rebuilding in place, mixed replicas and an old process retaining loaded modules all break SHA-only reasoning. Process start time preceding artifact modification can disprove a relationship; the reverse cannot prove it. No on-disk timestamp/hash can establish which modules were loaded earlier. No current PM2 name or health response fixes this gap.

The smallest credible future mechanism needs a **separately reviewed operational/deployment change**: build a versioned immutable release with trusted provenance binding commit, dependency lock digest and complete deployable-artifact digest; launch from that release; produce a startup receipt binding that digest/BUILD_ID to boot/process identity and effective non-secret configuration predicates. Expose only an authenticated minimal identity/nonce response from the serving process, then independently bind reverse proxy/listener and every replica/worker to it. Authenticate evidence through a trusted operator/collector channel with freshness, scope, integrity and anti-replay checks. A manifest written beside a mutable build, a caller-provided SHA/flag, PM2 environment variable or unsigned uploaded JSON is insufficient. Do not add/deploy this mechanism in 002.4F.

For WhatsApp, either establish the attested artifact has only the reviewed rejection paths **and** a complete inventory excludes independent senders, or obtain independently verifiable process-wide egress isolation covering app, workers, containers and external schedulers. Existing network policy may be reviewed read-only; installing/changing a policy requires separate authorization. Absence of a Meta key, disabled UI/tenant toggles or an empty queue is not global isolation. Other channels require their own evidence; email invitations run independently of reminder toggles.

### Lifecycle evidence integration

The observer report is deliberately **not consumed** by `staging-reads.ts`; both runtime gates remain UNKNOWN. There is no new opt-in, evidence-file path, approval boolean, CLI override or environment shortcut. Local collector tests and source-only rejection paths cannot turn either gate VERIFIED. Future integration requires separate review of a trusted verifier and provenance/receipt infrastructure, verifying expected Staging origin/project/release, actual serving and worker identities, freshness, inventory coverage and outbound policy before each mutation/cleanup step. Missing/invalid/stale/inconsistent evidence must block. Even independently reviewed reports in this task do not enable live mutations with the current implementation.

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
- Optional `ASSISTANT_QA_PROFESSIONAL_MEMBER`: restrict discovery to this protected active QA member. Invalid explicit values block; they never broaden the search. Recovery uses the encrypted journal's existing professional.
- Optional `ASSISTANT_QA_DATE`: restrict discovery to one valid future clinic-local ISO date. Otherwise search the next fourteen days, at most five protected QA professionals and two canonical 30-minute half-hour slots on the same day. Gates refresh before writes, so availability may still block later stages.

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
