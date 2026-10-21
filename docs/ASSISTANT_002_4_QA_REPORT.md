# ASSISTANT-002.4 / 002.4B / 002.4E / 002.4F — QA execution report

## 002.4F runtime verification preparation (2026-10-21)

Starting head: `c893be6da9ac5496ca3fdf3a27570d82f26b8119`; same branch and draft PR #93. This increment adds only an operator-side read-only observer, focused tests and documentation. Application code, lifecycle gates, permissions, provider activation, dependencies, PM2 settings and migrations are unchanged.

DEPLOYMENT IDENTITY: UNKNOWN — no DonWeb evidence collected; HEAD, build artifacts and loaded process cannot currently be independently bound

WHATSAPP ISOLATION: UNKNOWN — inspected provider rejects and runner skips WhatsApp, but deployed code and independent senders are unverified

OTHER OUTBOUND CHANNELS: email / Google Calendar / OpenAI / PayPal exist in source; effective isolation UNKNOWN

BACKGROUND WORKERS: UNKNOWN — complete supervisor/scheduler/container/external inventory not available

RUNTIME EVIDENCE: NOT COLLECTED — observer/procedure prepared, no remote server session or commands executed

UNVERIFIED CONDITIONS: immutable artifact provenance, startup/process receipt, proxy/listener binding, effective environment and complete sender/worker coverage

REQUIRED OPERATOR COMMANDS: reviewed collector via existing SSH and status-code-only health/readiness GETs; private read-only management review; exact procedure in `ASSISTANT_002_4_LIVE_PREPARATION.md`

READY FOR READ-ONLY PREFLIGHT: YES (procedure prepared; runtime acceptance pending)

READY FOR LIVE MUTATIONS: NO

The observer records collection interval and explicit sources; outputs allowlisted environment presence and kernel metadata, hashes selected build artifacts and paths without exposing values, raw process/environment/configuration or exceptions. No report, flag or user-supplied SHA can authorize lifecycle operations. It always returns UNKNOWN runtime attestation and `readyForLiveMutations=false`, including when local observations match. Existing `staging-reads.ts` continues to return UNKNOWN for deployment/WhatsApp. Minimal future immutable-release/startup-receipt and trusted verifier requirements are documented, not deployed.

Local validation for this increment: 273 unit/integration PASS (4 new observer tests); 14 browser PASS against simulated persistence. The observer tests cover secret-safe projection, malformed/unavailable process input, absent artifacts/processes, and matching process/build observations that remain UNKNOWN. They use temporary local fixtures, not Linux/PM2/DonWeb runtime evidence. Windows stdin smoke parsed the streaming command and correctly exited 2 before collection on unsupported OS. Initial TypeScript/build validation found a missing required `NODE_ENV` in the observer's deliberately minimal Git subprocess environment; corrected to a constant without inheriting secrets. Final lint, TypeScript (`npx tsc --noEmit --incremental false --pretty false`), production build and `git diff --check`: PASS. Existing module-type/color and LF/CRLF warnings are non-failing. Remote checks are absent, not CI PASS.

No server collection, live login, provider request, patient/appointment mutation, deployment, restart, configuration change, migration or merge was performed in 002.4F. Original conversational incident: NOT VERIFIED / not declared resolved. Historical results below retain their original scope.

## Baseline and scope

Baseline `eec7274b108394664f98daff52da03488a0ffe55`; 002.4A head `27731c32a7c8a61932825e0a197784544b3d4163`. Continue only branch `codex/assistant-002-4-qa-automation` and draft PR #93.

002.4E starts at validated head `46fc2ea6b0f25e70f74b4cb9980437b5e80d6ab6`. The user separately confirmed Authenticated Staging Browser PASS and OpenAI Staging PASS: `llm_gate_allowed=1`, `planner_called=1`, `planner_success=1`, fallback/timeout/invalid_output each zero. These are user-supplied results, not reruns by this task. The dedicated OpenAI CLI has still not executed a provider request.

Production component, actions, parser, orchestration, authorization, RLS and migrations are unchanged. This replaces the earlier broad scenario totals with independent execution levels and bounded evidence. A mock confirmation does not establish Supabase persistence or database atomicity.

## Inventory and architecture

The existing Playwright config starts Next on port 3100; QA browser accounts authenticate through `/login` using Email/Contraseña and `Iniciar sesión`. No Assistant browser suite existed at baseline. Baseline QA scripts manage persistent RBAC, patient-scope and availability datasets; none provides exact temporary appointment-lifecycle cleanup.

`playwright.assistant.config.ts` starts a standalone HTTP server bound only to `127.0.0.1:3117`. `tests/assistant-browser/server.mjs` builds into OS temp using Webpack bundled with pinned Next 16.3.3, then removes that exact temporary build directory. No dependencies or application routes are added. The default Playwright config ignores the dedicated suite to prevent running it against the application server.

The harness mounts actual `AppointmentAssistant` through React DOM. Tests type/click accessible labels/buttons, including actual structured-choice and confirmation handlers. It bundles actual action/orchestration source, replacing auth/tool registry, patient/settings services, timezone, logger, provider and Next cache/navigation boundaries. Actions are ordinary functions here: this does not exercise Next server-action HTTP/Flight, real session validation, SQL locks, RLS or provider calls. The fixed day is 2030-10-21 in America/Mexico_City.

Each test uses a fresh browser context and synthetic Norte/Sur data. Counters observe reads, mock proposals and mock mutations; returned contexts/diagnostic events are recorded. React hooks are real. The harness uses literal test environment settings, never the host environment. CSP disallows connections and Playwright aborts requests outside loopback. Traces/video/screenshots are off. No live data/sessions enter this harness.

## Independent execution counts

| Level | PASS | FAIL | BLOCKED | NOT RUN | Evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| UNIT / INTEGRATION | 269 tests | 0 | 0 | 0 | Previous 242 + 27 lifecycle/fixture/journal/recovery tests; no skips |
| BROWSER COMPONENT INTEGRATION | 14 tests | 0 | 0 | 0 | Previous 12 + shared lifecycle/forms test and unknown-notification gate test |
| AUTHENTICATED BROWSER E2E | User-confirmed PASS | 0 observed here | 0 | Not rerun here | User evidence supplied for 002.4E; no new login attempted |
| LIVE STAGING lifecycle | 0 | 0 | 1 suite / all 6 scenarios | 0 | Task prohibits live mutations; CLI stopped before login; deployment/WhatsApp evidence unknown |
| OPENAI STAGING | User-confirmed PASS | 0 reported | 0 | Not rerun here | Safe planner counts supplied above |
| OPENAI CLI LIVE | 0 | 0 | 0 | 1 smoke | Dedicated provider CLI request remains unexecuted |

Statuses are exclusive: an unexecuted level with an identified gate is BLOCKED rather than NOT RUN. Unit tests, browser tests and acceptance scenarios are different units. No combined PASS total is claimed.

## Browser evidence

| Test | Executed assertions |
| --- | --- |
| BROWSER-001 | Incomplete natural create request yields create intent/missing-patient question, zero mutations |
| BROWSER-002 | Patient-list helper/button retain authorized mock patient; Sur patient not shown |
| BROWSER-003 | Professional helper/button retain patient/professional; Sur professional not shown |
| BROWSER-004 | Future slots shown; structured slot sets 10:00/tomorrow in context; zero mutations |
| BROWSER-005 | Verified proposal patient/professional/time; proposed date/time/duration; no mock appointment before confirm |
| BROWSER-006 | Two immediate DOM confirm clicks yield one action, one mock mutation/appointment with correct duration; success UI |
| BROWSER-007 | Date search selects/revalidates appointment; focused reference retained; no mutation |
| BROWSER-008 | Reschedule proposal leaves mock original untouched; confirm changes time on same mock appointment |
| BROWSER-009 | Cancellation proposal leaves scheduled status; only confirmation changes mock status |
| BROWSER-010 | Exact three requested turns preserve tomorrow, replace exclusive bounds, execute 3 empty reads and emit no invalidation |
| BROWSER-011 | Failed read stays error, date survives and retry executes after recovery; zero mutations |
| BROWSER-012 | Simulated missing session blocks read and confirmation; mock clinic switch and missing reference reject old visible choice; zero mutations |

002.4E adds two tests in `appointment-assistant-lifecycle.spec.ts`. The first runs the same `runLifecycle` and `BrowserLifecycleAdapter` intended for Staging, using actual React CreatePatientForm/EditPatientForm/AppointmentAssistant with fake protected services. It validates LIVE-001 through LIVE-005 against simulated persistence, unchanged booking before confirmation, one-shot rejection, audit history and two cleanup passes. LIVE-006 remains BLOCKED in that browser test without a second real user; expected runner status is PARTIAL. The second proves unknown email evidence prevents patient creation despite mutation opt-in.

These security assertions test component/action reactions to simulated protected-service results, not deployed authorization or Supabase isolation. Duplicate UI-click suppression is distinct from the mocked concurrent claim test and from real database concurrency.

## QA-001 through QA-030 traceability

`U` = executed Node tests with mocked boundaries; `B` = executed browser component integration. Every live lifecycle acceptance remains unverified despite passing local assertions.

| QA | Local evidence | Boundary / remaining gap |
| --- | --- | --- |
| 001 incomplete creation | U: qa-bundle, conversation; B:001 | Missing-field UI; no live mutation |
| 002 patient selection | U: patient-autocomplete; B:002 | Authorized mock list only |
| 003 professional selection | U: patient-autocomplete; B:003 | Mock clinic only |
| 004 availability | U: read-tools, time-filters; B:004 | Mock slot results, not real occupied-slot lookup |
| 005 creation proposal | U: confirm-eligibility; B:005 | Actual action proposal, mocked storage |
| 006 confirm creation | U: confirm-eligibility; B:006 | Mock persistence only; Supabase persistence BLOCKED |
| 007 duplicate confirmation | U: confirm-eligibility; B:006 | UI guard + simulated claim; database atomicity unverified |
| 008 appointment search | U: read-tools; B:007 | Date read with mock appointment |
| 009 upcoming appointments | U: read-tools, llm-planner | Mock upcoming read; browser upcoming NOT RUN |
| 010 appointment selection | U: structured-selection; B:007 | Actual handler, mock fresh lookup |
| 011 reschedule proposal | U: tools/proposal-amendments (includes source checks); B:008 | Runtime action observed in browser; mock storage |
| 012 confirm reschedule | U: confirm-eligibility; B:008 | One mock row updated; live persistence BLOCKED |
| 013 cancellation | U: confirm-eligibility; B:009 | Actual UI; mock cancellation |
| 014 three turns | U: context-reliability; B:010 | Real React/orchestration; no HTTP Flight in harness |
| 015 empty continuity | U: context-reliability; B:010 | Three empty queries, no artificial invalidation |
| 016 selection continuity | U: structured-selection/context-reliability; B:007–009 | Mock reference revalidation |
| 017 draft correction | U: qa-bundle/flexible-context/proposal-amendments | Some source checks; browser amendment NOT RUN |
| 018 context isolation | U: qa-bundle/ephemeral-context; B:012 | Simulated clinic change; real sessions BLOCKED |
| 019 classification | U: llm-planner/parser | Mock provider + deterministic typed classification |
| 020 real LLM | U: live-gates observer tests use fake HTTP only | Real smoke BLOCKED, 0 requests |
| 021 provider failure | U: llm-planner/live-gates | Timeout/HTTP/invalid JSON/schema; one fake request maximum |
| 022 LLM safety | U: domain-gate/qa-bundle | Injection/domain/typed-ID restrictions with mocks |
| 023 tenant isolation | U: patient-autocomplete/read-tools; B:002–003/012 | Mock scope; Norte/Sur RLS BLOCKED |
| 024 authentication | U: context-reliability/confirm-eligibility; B:012 | Simulated rejection; real login/unauthenticated HTTP NOT RUN |
| 025 confirmation required | U: tools/confirm-eligibility; B:005/008/009 | No mock mutation before each confirm |
| 026 stale references | U: structured-selection/context-reliability; B:012 | Missing mock reference and mock clinic change |
| 027 concurrency | U: confirm-eligibility | Concurrent calls against claim double; database concurrency BLOCKED |
| 028 unavailable slot | U: confirm-eligibility/tools | Mock validation; real occupied slot NOT RUN |
| 029 read failure | U: context-reliability; B:011 | Safe error/retry, no false empty success |
| 030 expired context | U: qa-bundle/ephemeral-context | Expired reset; browser expiry NOT RUN |

## Validation and failure analysis

- Unit/integration: 269 PASS, 0 FAIL, 0 SKIP.
- Browser component: 14 PASS, 0 FAIL, 0 SKIP.
- Lifecycle preflight CLI: exit 2 BLOCKED (`read_only_opt_in_required`); no login or remote operation.
- No lifecycle execution/recovery command or real provider request was executed.
- `npm run lint`: PASS.
- `npx tsc --noEmit --incremental false --pretty false`: PASS.
- `npm run build`: PASS (Next 16.3.3, 31 static pages; unchanged route inventory).
- `git diff --check`: PASS.

During harness bring-up, Webpack exposed DefinePlugin as `webpack.DefinePlugin` and browser imports needed a literal process-environment shim. Those infrastructure failures were corrected. No production defect was established and no application fix was made. Existing module-type and NO_COLOR/FORCE_COLOR warnings are not failures.

## Cleanup and recommendation

Each browser test clears its in-memory appointments/proposals, verifies zero remaining records, repeats cleanup for idempotency and closes its browser context. The harness removes its exact OS-temp build. No real fixture was created, no baseline fixture changed and no remote cleanup was needed. Real fixture cleanup is NOT VERIFIED.

For the new full simulated runner test, cleanup follows retention policy instead: one cancelled synthetic booking and one inactive synthetic patient, audit preserved. Synthetic test-only sessionStorage carries boundary state across browser navigation; Playwright destroys the isolated context afterward. This is separate from persisting a real login/session. Journal unit tests create encrypted files only in a dedicated OS-temp directory, release locks and remove that exact directory.

See `ASSISTANT_002_4_LIVE_PREPARATION.md` for environment-only opt-in of supported read/provider smokes, safe output semantics and the outstanding lifecycle isolation/ownership/cleanup gate. Mutation mode cannot be enabled by a flag. No Staging LLM key/flags/model or other configuration was changed.

ASSISTANT-003 recommendation: NOT READY for a full lifecycle release. Staging browser/OpenAI success is user-confirmed; lifecycle Supabase persistence/RLS, runtime outbound isolation and real cleanup remain unverified. The original conversational incident is not declared resolved.

## 002.4E deliverables and readiness

See `ASSISTANT_002_4E_BOUNDARY_AUDIT.md` for the precise service/auth/notification inventory and `ASSISTANT_002_4_LIVE_PREPARATION.md` for safe configuration, recovery and blocker-resolution procedures.

| Requirement | Implementation / evidence | Real Staging lifecycle result |
| --- | --- | --- |
| PREFLIGHT | Exact origins/project, public key, real-user cookie session, QA tenant/membership/subscription/member/slot reads and per-channel gates | BLOCKED before login; runtime deployment/WhatsApp proof unsupported |
| FIXTURE MANAGER | Unique synthetic marker, authorized create form, external AES-GCM journal, atomic/fsynced stages, exclusive lock and ownership recovery | NOT EXECUTED |
| CREATE | Exact proposal arguments and zero mutation before confirmation; one correct persisted record required | NOT EXECUTED |
| READ | Run-specific date/name request, unique selection, UI/persistence checks and no writes | NOT EXECUTED |
| RESCHEDULE | Same-day alternative verified slot, exact proposal, unchanged original until confirm, same booking afterward | NOT EXECUTED |
| CANCEL | Explicit proposal/confirm, cancelled state and preserved creation/reschedule/cancellation audit events | NOT EXECUTED |
| IDEMPOTENCY | Duplicate UI clicks, already-executed RPC rejection and no extra booking/audit; interrupted runs cleanup-only | NOT EXECUTED |
| TENANT ISOLATION | Optional second QA-owner browser login; exact run-owned patient/booking probes under other tenant RLS | BLOCKED / not executed here |
| CLEANUP | Exact ownership including creation-audit actor; cancel active booking, inactive patient, pending expiry checks, repeat twice | PASS only with local controlled services; remote NOT VERIFIED |
| NOTIFICATION ISOLATION | Current email readiness, scheduler and safe calendar projection supported; deployment-bound WhatsApp identity absent | BLOCKED |

Local results: UNIT TESTS 269 PASS / 0 FAIL; BROWSER TESTS 14 PASS / 0 FAIL. LIVE TESTS: 0 executed, 6 lifecycle scenarios BLOCKED (LIVE-001 through LIVE-006). Counts are per level and must not be summed as equivalent scenarios.

READY FOR CONTROLLED LIVE EXECUTION: NO

QA AUTOMATION STATUS: PARTIAL

RELEASE RECOMMENDATION: NOT READY
