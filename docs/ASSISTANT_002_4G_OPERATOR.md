# ASSISTANT-002.4G — controlled Staging session

Prepared locally; **none of the remote/modifying commands below was executed**. Do not merge/deploy or execute fixtures from this document without separate authorization. [QA PR #93](https://github.com/Geovas91/MedControl/pull/93) and [outbound protection PR #94](https://github.com/Geovas91/MedControl/pull/94) must first be independently reviewed. Use a reviewed integrated commit containing both changes, not either branch alone.

## Current evidence and prerequisites

Operator-reported evidence: deployed checkout `eec7274b108394664f98daff52da03488a0ffe55`, `/var/www/clinicontrol`, Next listener PID 1058741 **at collection time**, port 3000 matching Nginx upstream; health/readiness 200; UFW active/default incoming deny and external IPv4 port 3000 unsuccessful. Build samples/process were stable. One user Cron POSTs to the internal localhost automation endpoint with an authorization header. Email readiness is **ready**; delivery is possible. OpenAI previously succeeded; retain its current key/model/flags. No Cron delivery was observed. This is user-supplied operational evidence, not newly collected in this task, and no exact UTC collection interval was supplied. PID must be rediscovered.

DEPLOYMENT IDENTITY: PARTIAL observations; reviewed source → full artifact → active serving process relationship UNKNOWN

WHATSAPP ISOLATION: UNKNOWN remotely; local reviewed provider remains nonfunctional

OTHER OUTBOUND CHANNELS: Resend/Calendar protection implemented in the dependency; effective deployment/independent senders UNKNOWN. OpenAI intentionally preserved; PayPal is outside appointment communications.

BACKGROUND WORKERS: one reported Cron, complete inventory UNKNOWN

RUNTIME EVIDENCE: operator report above; new protected deployment NOT EXECUTED

UNVERIFIED CONDITIONS: actual protected build/process, effective policy, all independently scheduled consumers, target Node 22/Linux startup

READY FOR READ-ONLY PREFLIGHT: YES, credentials supplied privately; no fixtures

READY FOR CONTROLLED STAGING DEPLOYMENT: YES, candidate ready for reviewed operator validation subject to prerequisites below; not deployment authorization or runtime PASS

READY FOR LIVE LIFECYCLE EXECUTION: NO

## Ordered operator actions

1. **Backup / rollback prerequisite.** In the existing authorized server manager, take a recoverable Staging build/site snapshot and protected configuration backup (including effective PM2 secret configuration). Record the old release, process definition/owner and UTC time. Keep values private, preserve OpenAI configuration exactly, and establish how to restore the old process before stopping it. Do not use `pm2 env`, `pm2 report`, raw `jlist`, logs, environment or Nginx dumps. Do not proceed if equivalent secure configuration cannot be supplied to the candidate or the rollback is untested/unavailable. No production site is in scope.

2. **Read-only prerequisite checks.** Confirm existing `APP_ENV=staging` and exact `APP_BASE_URL=https://staging.clinicontrol.mx` privately through the manager, approved Supabase project, reviewed integrated commit, existing service user/group, absolute Node 22.23.2 executable and port/proxy mapping. No credential values in commands. Identify every PM2 application/user, Cron/systemd/container/external sender; the one known Cron is not a complete inventory. Existing OpenAI behavior must be retained. If Staging scope differs, stop for a separately approved configuration plan; do not silently correct it. UFW incoming rules do not prove outbound isolation.

3. **MODIFYING — separate authorization required: candidate build and witness.** Prepare a new versioned release under an administrator-owned directory, leaving `/var/www/clinicontrol` intact for rollback. Populate it from the reviewed integrated revision using the existing deployment method and protected configuration backup; do not run seeds/migrations. As the build user in that candidate directory:

   ```bash
   npm ci
   npm run build
   node --experimental-strip-types scripts/qa/assistant-release.ts record
   ```

   `record` requires a clean Git checkout and a fresh receipt path. It hashes all `.next` build content except runtime caches/dev/diagnostics/traces/the receipt itself, all `node_modules` except `.bin` CLI shims, `public`, lock/package/config and the launcher; also hashes the Node executable. Symlinks in covered content are rejected. No environment values are hashed/emitted. Record source, artifact digest, build digest and file count in private deployment evidence. This binds an operator-observed build operation; the receipt is **not signed or an authorization credential** and alone does not attest a running process. Keep build output private; do not publish unrelated logs.

4. **MODIFYING — separate authorization required: immutable release and isolation.** Use the existing administrative deployment workflow to make this candidate release and every ancestor non-writable by the service user; runtime files/directories must have a different owner and no group/other write bit. Use an administrator-owned location such as `/var/www/clinicontrol-releases/<reviewed-revision>`, not an app-owned home parent. Make the receipt readable by the service group (e.g. 0640) and keep its owner administrative. Create an app-writable `.next/cache` separately before freezing the release; caches are excluded from the fingerprint. Do not make `node_modules`, `.next/server`, config or the launcher writable. Reject extended ACLs, bind mounts or delegated privileges allowing the service user to replace the release; the script checks POSIX owner/mode/symlinks, not ACL/capability/mount policy. Keep configuration files private and readable only by the required service identity. Enable **only** `APPOINTMENT_OUTBOUND_MODE=isolated` in the candidate's existing secure configuration workflow. Do not change any OpenAI flags/key/model or other integration settings. Independently running consumers must use the same protection/effective mode or be excluded through separately approved operational controls. Do not replay queued jobs.

5. **Read-only candidate check / MODIFYING process cutover.** As the non-root service user in the candidate release, `node --experimental-strip-types scripts/qa/assistant-release.ts check` verifies current full fingerprints and POSIX immutability. UNKNOWN/failed ownership, symlinks, changed Node/artifacts or missing receipt block. For the separately authorized cutover, stop the existing Staging process using its known process ID and retain its definition for rollback. Through the existing supervisor, start the absolute Node executable **directly**, with the candidate cwd and its secure configuration, passing `--experimental-strip-types /ABSOLUTE/CANDIDATE/scripts/qa/assistant-release.ts start`. For an already approved PM2 setup the shape is:

   ```bash
   # MODIFYING template: replace all paths/owner-specific details from verified manager metadata.
   # Run as the existing service owner, with equivalent private configuration already installed.
   pm2 stop clinicontrol-staging
   pm2 start /ABSOLUTE/NODE --name clinicontrol-staging-qa --interpreter none --cwd /ABSOLUTE/CANDIDATE -- --experimental-strip-types /ABSOLUTE/CANDIDATE/scripts/qa/assistant-release.ts start
   ```

   No `--update-env`, `pm2 save`, production process, Nginx update or migration is required by this procedure. The optional launcher checks immutable artifacts, loads dotenv using Next's installed loader without logging values, requires isolated Staging and no `NODE_OPTIONS`, emits one safe startup witness, and imports `next start` in the **same PID**, bound to 127.0.0.1:3000. It introduces no server endpoint or generic simulator. PM2 supervision/configuration must be independently reviewed; do not assume the example matches this host. The startup record precedes successful binding and is not itself proof of service readiness. Preserve its first startup record privately; never publish raw PM2 logs that can contain unrelated data.

6. **Read-only post-change validation.** Record UTC time. Check only health/readiness status codes using the PowerShell commands in `ASSISTANT_002_4_LIVE_PREPARATION.md`. Inspect the safe `/api/ready` fields locally: `checks.outbound=isolated`, `checks.email=disabled`; unknown policy should give 503. Independently match startup PID + kernel start ticks/boot identity + immutable artifact digest to the actual listener and Nginx upstream, current supervisor launch definition/cwd and origin. Do not reuse PID 1058741 or trust checkout SHA/receipt alone. Review every worker's artifact and policy. Observe the next naturally scheduled Cron result only via sanitized counters; the protected runner should claim zero jobs. Do not manually invoke Cron, send provider probes or read payload logs. If the process restarted or anything differs, recollect evidence. A trusted operator must establish the launch/proxy relationship; an app-written startup log or unsigned receipt alone cannot do so.

7. **Read-only authenticated preflight.** In the workstation's existing secure environment keep the QA owner credentials, public Supabase key/project and expected clinic. Enable only `ASSISTANT_QA_LIFECYCLE_READ=1`; leave mutation opt-in unset. Run:

   ```powershell
   npm run test:assistant:qa:lifecycle -- --preflight
   ```

   Professionals and dates no longer require copying internal UUIDs: protected member/availability RPCs search up to five active synthetic professionals and the next fourteen clinic-local days for two distinct canonical half-hour slots on one day. Explicit professional/date filters remain optional and fail if invalid; no broader fallback after an invalid explicit ID. Membership/tenant/subscription, automation flags, calendar status, email and each other gate are reported separately. No available slots => BLOCKED, not invented data. Recovery resolves its professional from the encrypted journal and verifies the authenticated actor/clinic rather than switching scope. Patient eligibility is deferred until creation, as before.

8. **Live authorization conditions — currently NOT satisfied.** Require reviewed integrated deployment, fresh independently bound process/build/origin and worker evidence, demonstrable effective transport isolation, successful read-only preflight, QA permissions/slots, private journal key/storage and exact cleanup capability. Current adapter intentionally still returns UNKNOWN for deployment/WhatsApp and retains conservative email/automation/calendar checks. `checks.outbound`, a receipt, SSH output copied into JSON, an environment flag or this document cannot change those gates. **A separately reviewed trusted verifier integration is still required before this runner can accept runtime evidence and authorize writes.** The local receipt/start helper supplies deployable evidence collection, not that missing trust bridge. Do not edit gates manually. This is a concrete remaining implementation prerequisite, not permission to force execution after the cutover.

9. **Future separately authorized lifecycle / cleanup.** Only after the previous conditions and trusted verifier are implemented/reviewed/validated, use the existing private journal configuration and mutation opt-in to run `npm run test:assistant:qa:lifecycle -- --execute`. CREATE → READ → RESCHEDULE → CANCEL uses actual forms, proposals and explicit confirmation. Require one owned booking, one-shot execution, expected persisted times/status/audit, second-tenant isolation and repeat cleanup: zero owned active bookings, exact temporary patient inactive, audit/cancelled history preserved, no unresolved owned proposals. Do not hard-delete, alter baseline fixtures or treat cancelled/inactive history as leakage. These commands remain blocked with the current adapter; no live execution occurred in this task.

10. **Partial failure and rollback.** Retain the encrypted journal and isolation, do not retry an ambiguous create/confirm, investigate with safe counts only. Future authorized recovery uses `npm run test:assistant:qa:lifecycle -- --recover <run-id>` and the same private journal/key; it is cleanup-only and rechecks authenticated scope. A pending/claimed proposal without a recoverable UI remains blocked until confirmed expiry/operator investigation; no forged server-action references. Do not restore normal sending while active temporary records or deferred jobs remain. After exact cleanup is verified, restore the previous reviewed release/config through the prepared rollback; for the new protected Staging release, explicit `APPOINTMENT_OUTBOUND_MODE=normal` resumes delivery (unsetting the mode fails closed). Preserve OpenAI settings. Record post-rollback health/readiness, fresh serving identity and cleanup evidence. Never blindly resume/replay queued messages.

No deployment, supervisor change, configuration change, actual provider request or patient/appointment mutation was executed while preparing this package. The startup receipt and Linux/Node 22 operational path still need target-host validation; local tests use Node 24 and filesystem/network doubles. See QA report for exact results and the two reproduced pre-existing full-suite source assertions.
