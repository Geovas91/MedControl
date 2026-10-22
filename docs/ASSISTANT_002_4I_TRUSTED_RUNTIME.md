# ASSISTANT-002.4I — trusted runtime verification

See the [final security and operational review](ASSISTANT_002_4I_SECURITY_REVIEW.md) for corrected dispatch-time expiry/continuity/recovery checks and the unresolved privilege-separation and timing prerequisites. The reported service account also has administrative sudo permissions; non-root UID alone is not sufficient independence. No collector provisioning or runtime PASS is implied.

## Current decision

**DEPLOYMENT IDENTITY: UNKNOWN. WHATSAPP ISOLATION: UNKNOWN. READY FOR LIVE MUTATIONS: NO.**

The operator reports Staging release `d1079819eec335244c2848ad45ffb0e1864f665f`, PM2 `clinicontrol-staging-qa`, a stopped rollback process, paused Cron and readiness `outbound=isolated`. The authenticated read-only preflight reportedly passed its other functional controls and performed zero mutations. These are supplied observations, not independently collected evidence in this change. No new Staging request, server inspection, deployment, configuration/credential change or lifecycle execution was performed.

There is currently **no provisioned independent authority, public trust root, authoritative worker inventory or reviewed artifact/provenance pins**. `runtime-trust-policy.ts` deliberately exports `null`. Production acquisition therefore makes no network request and cannot authorize either runtime gate. The implementation supplies the verification protocol and its integration, not a fabricated operational PASS.

## Why the two gates were blocked

`assistant-runtime-evidence.ts` observes Git HEAD, selected Next manifests and initial Linux process environment presence. It explicitly cannot establish loaded-code provenance, effective dotenv configuration, Nginx routing or complete worker coverage. It remains unchanged and informational. `assistant-release.ts` fingerprints the full build/dependencies/runtime, checks immutability and starts Next in the same PID. Its unsigned receipt and startup witness are useful collection inputs, but neither authenticates the observer or proves the listener is serving that artifact now. Git source, build artifact and running-process identities are separate facts.

The reviewed WhatsApp provider rejects sends; the automation runner skips WhatsApp jobs. The integrated outbound guard also protects Resend/Calendar and prevents isolated Cron claims. Source branches and readiness cannot prove that all active senders use that release/configuration. Other PM2 owners, systemd, Cron, containers, Supabase schedules/Edge functions and external consumers remain outside application visibility. Disabled UI, incoming firewall rules and absence of a provider SDK in this checkout are insufficient. See the existing boundary audit for paths. OpenAI remains outside this control and is unchanged.

## Minimal trust mechanism

The QA workstation obtains one fresh, signed observation from an **independently administered read-only authority**. That authority must collect from the OS/supervisor/proxy and deployment control plane, not ask the application to attest itself. The authority's private Ed25519 key must be inaccessible to the application, app/service account, QA executor and release files. Public key provenance and control of the HTTPS endpoint must be reviewed through a separate administrative channel. A different URL alone does not establish independence.

The fixed, reviewed source policy pins endpoint, key ID/public key and validity, Staging origin/project/host, exact commit, full artifact/build/Node/provenance digests, canonical cwd/launcher, active proxy configuration, effective isolation policy and exhaustive sender inventory revision. None can be supplied through environment variables, CLI arguments, copied SSH output, an approval file or response-selected key. The expected source commit is pinned separately to the currently reported reviewed release; a different release requires a new policy review. Deploying this QA verifier into the application is unnecessary.

The client generates a random 256-bit nonce for each acquisition. The authority returns exactly `{keyId,payload,signature}`. Payload is unpadded base64url of UTF-8 `JSON.stringify` bytes conforming to `RuntimeEvidence`; signature is unpadded base64url of an Ed25519 signature over UTF-8 `clinicontrol-independent-runtime-v1\0` followed by those bytes (the suffix is a NUL byte). The verifier rejects duplicate/extra fields, alternate JSON serialization, wrong keys/signatures, oversized bodies, wrong nonce/audience/origin/project/host and mismatched pins. Fetch uses the fixed HTTPS endpoint, no redirects/cache and a five-second timeout. Response limit is 32 KiB; signed payload limit is 16 KiB. No exception text or received payload is logged.

Times are UTC Unix milliseconds. Evidence must be issued no more than 30 seconds ago, never in the future, expire within 30 seconds of issue and before key expiry. Two matching kernel/process observations at least one second apart must fit between issue and validation. PID/start ticks/boot/UID/cwd/Node/artifact/launcher, online PM2 identity, loopback listener and active Nginx upstream must agree. Effective isolation must be `isolated`, with email `disabled`. Every approved active app/worker must use the exact artifact and independently proven guarded or denied WhatsApp transport. An active app must be the serving PID. Active Cron/external senders are not supported as an exception in this conservative protocol: they must be observed paused/stopped or verification fails.

Coverage must include all six fixed scopes: all-user PM2, systemd and Cron, containers, Supabase schedulers and external senders. Workload IDs/kinds/states must exactly equal the reviewed inventory; missing, duplicate or extra workers fail. Unknown source coverage, independent senders, isolation failure or restart prevents verification. Digests identify the authority's retained collection records; they are not unauthenticated fingerprints accepted as authorization.

`assessSignedRuntimeEvidence` returns informative JSON only. Only zero-argument `acquireTrustedRuntimeProof`, using the source-fixed policy and fresh authority request, can mint an opaque in-memory proof registered in a private WeakMap. `runtimeVerificationBoundary` cannot recreate it from JSON, flags, receipts or assessments. The proof additionally requires current isolated/disabled readiness observations. Both gates verify together only when all requirements pass. Proof expiry is checked at the boundary, by lifecycle blockers, and at dashboard HTTP write dispatch using a private permit with wall-clock and monotonic bounds. Functional controls and scope are freshly rechecked before actions; changed process/control binding latches the current session closed. Expiration does not inherit the ordinary 60-second preflight lifetime. Read-only reconciliation retains ownership references even when authorization is unavailable; cleanup writes stay blocked. Functional tenant/auth/availability/eligibility/cleanup checks remain intact.

## Operational prerequisite — not implemented or provisioned here

A signature proves who signed bytes; it does **not** prove that a human assertion or an incomplete collector is true. Do not provision a service that signs executor-supplied JSON, app receipts, manual booleans or the output of the existing informational observer. The collector implementation and its administrative trust model need independent review before any public policy is enabled. No signing CLI or operational key is included in this change.

The authority must retain restricted, timestamped source records and refuse signing on any UNKNOWN. At minimum its audited collection must establish:

| Required observation | Independent source/control required |
| --- | --- |
| Source to full artifact | Operator-controlled build/provenance record binding the reviewed commit to the full release fingerprint, build and exact Node binary; reproduce receipt checks independently. Rebuilding creates different pins and needs review. |
| Loaded code / immutability | Trusted launch observation into the immutable release, non-root identity, actual executable/cwd/start ticks/boot identity and two stable samples. Administrative ownership, ancestors, ACLs, mount namespaces and capabilities must exclude app replacement. A startup log or `/proc/cwd` alone does not establish what was loaded. |
| PM2 / listener / Nginx / origin | Actual manager ownership and launch definition, kernel socket owner, loaded active Nginx configuration and public routing to this listener. Exclude alternate backends/replicas/cache paths that could answer for another process. Config files alone do not prove active config. |
| Effective isolation | Operator-controlled effective configuration after dotenv/launch precedence, immutable reviewed guard paths and independently observed policy controls. Initial `/proc/environ` or `/api/ready` alone is insufficient. Emit enum outcomes only; never read application patient/message data or print/hash secrets. |
| All senders / scheduling | Inventory across every owner, namespace and supervisor, including independent integrations and Supabase/external schedules. Prove the known Cron is actually paused, retained rollback is stopped, and no unknown consumer can send outside the reviewed control. Scope exclusions require independent proof of inability to affect this Staging project, not an operator label. |
| Temporal validity | Trusted synchronized workstation/authority clocks, fresh nonce collection and a controlled operational window preventing release, routing, policy or inventory changes during the short lease. Any change/restart revokes eligibility and requires recollection. |

An administrator or compromised authority that can replace the collector/key or lie about observations remains a trust assumption. A 30-second lease does not eliminate time-of-check/time-of-use risk: administrative change control or an enforced freeze/egress boundary must cover that window. This verifier is a QA admission control, not a server-side transaction lock or a proof of global network silence. If that operating assumption cannot be enforced, keep the policy disabled. Do not weaken guards or modify production to fit the inventory. The conservative schema may require a separately reviewed operational adaptation for a mixed or distributed topology; it must not silently exclude a sender.

Provisioning requires a separate reviewed operational change: approved collector implementation/deployment, protected signing key custody, independently authenticated public-key distribution, complete inventory and provenance, fixed public policy pins and key rotation/revocation workflow. Revocation removes/replaces the reviewed key/policy; expired evidence/keys fail closed. Do not create these credentials or modify the VPS as part of this task. No collection command can establish completeness for an unmanaged external service; that missing governance remains a blocker.

## Read-only Staging validation procedure

1. Review this change and the separately required authority/collector/policy change. Until that exists, expected runtime outcome is UNKNOWN/BLOCKED. Preserve the existing release, PM2 state, paused Cron, all environment values and OpenAI configuration. No build, restart, migrations, seeds or deployment is required for the local verifier.
2. From the workstation record collection time and health/readiness status only:

   ```powershell
   (Get-Date).ToUniversalTime().ToString('o')
   curl.exe --silent --output NUL --write-out 'health_http=%{http_code}\n' --max-time 10 https://staging.clinicontrol.mx/api/health
   curl.exe --silent --output NUL --write-out 'ready_http=%{http_code}\n' --max-time 10 https://staging.clinicontrol.mx/api/ready
   ```

   These are observations, not runtime authorization. Inspect only allowlisted readiness fields privately if required. Do not dump raw environment, PM2/Nginx configuration, logs or database records.
3. Once separately reviewed/provisioned, the independent authority must collect the table's observations with source/time and retain restricted records. The QA client requests fresh signed evidence itself; there is no evidence-import or manual approval command. Do not paste raw server output into JSON or sign unverified claims. Missing privileged visibility must yield refusal, not an empty approved inventory.
4. In the existing private QA workstation environment, mutation opt-in unset, enable only the existing read-only opt-in and run:

   ```powershell
   $env:ASSISTANT_QA_LIFECYCLE_READ = '1'
   npm run test:assistant:qa:lifecycle -- --preflight
   ```

   Use the existing secure owner/public-project configuration, never service-role credentials or command-line passwords. This authenticates and reads; it creates no fixtures. With this branch's null policy, confirm deployment/WhatsApp remain UNKNOWN, status BLOCKED and mutations zero. With a future reviewed real authority/policy, require both independently authenticated runtime gates plus every existing functional control. `patientEligibility` remains deferred exactly as before.
5. Inspect only sanitized gate sources and runtime enums/deadline. A failed/stale request, mismatched release/process/inventory or effective isolation failure must prevent authorization. Do not run `--execute`, `--recover`, manual Cron POSTs or provider probes to test the control. Actual creation/rescheduling/cancellation requires separate authorization after independent evidence is established.

## Validation and limits

Automated tests use ephemeral in-memory Ed25519 keys, signed synthetic observations and authority HTTP doubles. They execute the actual verifier/acquisition/boundary, including opaque proof minting, serialization rejection and expiry. They cover valid, incomplete, modified, stale, wrong-process/release/artifact/proxy, unknown-worker, independent-sender and isolation failures, plus missing authority, wrong key, transport failure and oversized input. They do not attest DonWeb, exercise a live authority or prove a real inventory complete.

Final test counts and commit/PR are recorded in the delivery report. No application behavior, permissions, RLS, providers, Supabase schema, dependency, credential or OpenAI setting changes are included.

RUNTIME EVIDENCE: local cryptographic/protocol tests only; no independent live collection.

UNVERIFIED CONDITIONS: authority/key custody, collector completeness, actual artifact/provenance pins, Linux loaded-code/routing/effective configuration, all workers/external consumers and operational freeze.

READY FOR READ-ONLY PREFLIGHT: YES (expected BLOCKED until prerequisites).

READY FOR LIVE MUTATIONS: NO.
