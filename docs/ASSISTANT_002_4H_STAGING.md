# ASSISTANT-002.4H — integrated Staging candidate

Integration branch: `codex/assistant-002-4h-integration`, based on main `eec7274b108394664f98daff52da03488a0ffe55`. It contains exact reviewed heads #94 `7db560edcef4310ae5c90e64716aa4970ec69ff3` and #93 `a8c8c206c29cf08d492ab54c6d6777a5133a0584`, with no merge conflicts. Both original branches/PRs and main remain untouched. **Pin the exact integrated SHA in the final delivery report**, not a moving branch name. The final report is the deployment package's revision pin; this source document cannot embed its own future commit SHA.

## Local validation / limits

On the integrated candidate, Node **22.23.2 Windows x64**: full unit suite **821 PASS / 0 FAIL / 0 SKIP**, Assistant QA **290 PASS / 0 FAIL / 0 SKIP**, browser integration **14 PASS / 0 FAIL**, outbound protection **7 PASS / 0 FAIL**. Browser persistence and provider/DB boundaries use doubles. Lint, explicit TypeScript validation, production build and diff check pass. No live request/fixture or provider message was executed. No migrations/dependencies changed.

The two former failures expected obsolete `clinic_members` query syntax and a role/member-ID ternary. Their replacements execute the existing services against the same protected member-list fixture: exclude foreign/inactive/nonprofessional records, retain colleagues for owner/admin and restrict doctors to their authenticated user while using clinic-member IDs for availability. The shared VM harness is extracted without changing application logic or deleting tests; valid mutation-filter and SQL authorization assertions remain.

Node 22 validation found a real launcher issue: named ESM import from bundled CommonJS `@next/env` was undefined. The launcher now uses `createRequire`; an actual subprocess dotenv regression test proves loading works and preserves an existing OpenAI flag. Node 22 file-based type stripping and the test resolver work. Next's production build runs successfully under this exact Node version. Linux owner/mode/ACL/mount behavior, `/proc`, actual PM2 launch/privilege handling, socket ownership and startup witness on the VPS remain **UNKNOWN** until the bounded check/start steps below. Windows success is not Linux runtime attestation.

## Trusted verification boundary

`scripts/qa/lifecycle/runtime-verification.ts` is wired into authenticated preflight and its safe output. It separates readiness policy/email observations from reviewed-release binding, independently observed serving process/origin and complete worker evidence. Wrong scope/blocked policy is rejected. Even an isolated readiness response with caller-supplied VERIFIED flags, SHA or receipt cannot authorize deployment/WhatsApp gates. No environment override, approval file, public administrative endpoint or JSON-approval parser exists.

No independently authenticated operator-controlled observation channel or authoritative worker inventory is available locally. Per 002.4H's fallback, this implements **only the safe integration boundary**: runtime gates remain UNKNOWN/BLOCKED and no positive runtime authorization is possible. The unsigned release receipt/startup log alone cannot supply that missing authority. A future trusted collector implementation must independently bind the operator-observed launch and proxy/listener/worker state to the reviewed immutable release, with scope/freshness/integrity checks, and needs separate review. Do not convert operator notes or readiness booleans to VERIFIED manually. This candidate can validate deployment/isolation read-only; it cannot yet execute live lifecycle mutations.

## Minimum operator sequence — NOT EXECUTED

All configuration/build/start/stop/rollback operations below require separate authorization. Use only the known Staging site; no production, migration, manual automation POST or database write. Existing operational snapshot is described in `ASSISTANT_002_4G_OPERATOR.md`; rediscover current PIDs, never reuse historical 1058741.

1. **Backup prerequisite.** Take a recoverable Staging build/site snapshot and protected effective configuration/PM2-definition backup through the existing manager. Retain the old `/var/www/clinicontrol` release and process definition. Verify rollback access and preserve all OpenAI key/model/flags. Keep credentials/config contents private; do not dump environment or raw PM2/Nginx/job logs.

2. **Exact candidate / configuration prerequisite.** Set the pinned SHA from the final report on the workstation:

   ```powershell
   $Candidate = '<exact integrated SHA from the delivery report>'
   if ($Candidate -notmatch '^[a-f0-9]{40}$') { throw 'Exact reviewed SHA required' }
   git fetch origin codex/assistant-002-4h-integration
   if ((git rev-parse FETCH_HEAD) -ne $Candidate) { throw 'Candidate moved: review required' }
   ```

   Through the existing deployment manager prepare a new versioned candidate directory from **that commit**, with equivalent private configuration. Do not overwrite the rollback release. Confirm the existing service owner/group, absolute Node 22.23.2 executable, APP_ENV Staging, exact Staging base URL, approved Supabase project and Nginx upstream 3000 privately. Fill the absolute paths below from that manager; do not guess them. This does not authorize deployment automatically.

3. **MODIFYING — build and record**, in the candidate directory using the target Node runtime on PATH:

   ```bash
   node --version # must be v22.23.2
   npm ci
   npm run build
   node --experimental-strip-types scripts/qa/assistant-release.ts record
   ```

   Require a clean source checkout, source equal to the pinned SHA, a fresh receipt, complete build/runtime/dependency fingerprints and matching Node digest. A new build/release needs a new record; never edit or reuse an old receipt as approval. Keep stdout limited to the safe record when sharing evidence.

4. **MODIFYING — isolate/freeze**, through the approved configuration/deployment manager: set only candidate `APPOINTMENT_OUTBOUND_MODE=isolated`; preserve OpenAI and other configuration. Make release files/ancestors non-writable by the non-root service user; administrative owner, no group/other write, no mutable symlink/ACL/mount bypass. Make the administrative-owned receipt readable by the service group (0640). Provide an app-writable `.next/cache` separately; do not make server modules writable. The launcher checks POSIX owner/mode/symlinks, not ACL/capability/mount policy. Stop if those independent controls cannot be established. Do not delete/replay deferred jobs.

5. **READ-ONLY target check**, as that service user in the candidate directory: `node --experimental-strip-types scripts/qa/assistant-release.ts check`. Expected: safe `operation=check`, exact source/digests, `authorization=NONE`. Failure => stop, no cutover. This bounds Linux filesystem/Node compatibility validation without starting services or contacting providers.

6. **MODIFYING — controlled startup**, only after authorized target check and secure configuration are ready. Use the existing supervisor/owner, retaining the old definition. This is a template, not a command to run with guessed identities:

   ```bash
   pm2 stop clinicontrol-staging
   pm2 start /ABSOLUTE/NODE --name clinicontrol-staging-qa --interpreter none --cwd /ABSOLUTE/CANDIDATE -- --experimental-strip-types /ABSOLUTE/CANDIDATE/scripts/qa/assistant-release.ts start
   ```

   Direct Node avoids an npm wrapper. The witness fingerprints the immutable release and Node, loads existing dotenv quietly, requires isolated Staging/no NODE_OPTIONS, and imports `next start` in that same PID on 127.0.0.1:3000. A startup record precedes binding, so is not proof the service is serving. Do not use `pm2 save`, change Nginx/production, or publish raw logs. If the existing owner/config cannot support this template, stop for its exact authorized supervisor adaptation.

7. **READ-ONLY health/readiness and identity**, from the workstation:

   ```powershell
   (Get-Date).ToUniversalTime().ToString('o')
   curl.exe --silent --output NUL --write-out 'health_http=%{http_code}\n' --max-time 10 https://staging.clinicontrol.mx/api/health
   curl.exe --silent --output NUL --write-out 'ready_http=%{http_code}\n' --max-time 10 https://staging.clinicontrol.mx/api/ready
   ```

   Require 200 and privately inspect allowlisted readiness fields: `checks.outbound=isolated`, `checks.email=disabled`. Independently match the reviewed immutable digest/Node, fresh startup PID/start ticks/boot identity, current serving socket, supervisor launch definition/cwd and Nginx upstream/origin. Retain source/time for every observation. Do not infer trust from SHA, PID, receipt or readiness alone. Process restart/change => recollect.

8. **READ-ONLY workers/Cron.** Privately inventory all PM2 owners/apps, Cron/systemd/container/external consumers and relevant Supabase scheduled/Edge/webhook workloads. Require every appointment sender to run the protected candidate/effective isolation or be independently excluded by an authorized control. Review the known localhost Cron definition without exposing its authorization header. Observe the next naturally scheduled result as safe counters only (isolated runner claims zero); **never invoke its endpoint manually**. Missing visibility remains UNKNOWN. Incoming UFW protection is not outbound isolation.

9. **READ-ONLY authenticated preflight**, workstation, existing secure QA-owner/public-project configuration, mutation opt-in unset: `npm run test:assistant:qa:lifecycle -- --preflight` with `ASSISTANT_QA_LIFECYCLE_READ=1`. Discovery uses protected QA-member/slot RPCs; inspect each gate and the new sanitized runtime observations. It creates no patient/appointment. Deployment/WhatsApp remain blocked until a reviewed trusted observation integration exists. Do not run `--execute`/`--recover` merely because rollout/readiness looks correct.

10. **MODIFYING rollback, only if authorized and no unresolved temporary active fixtures/proposals/jobs can send:** retain isolation while investigating any partial failure; preserve encrypted journals if any prior separately authorized run exists. For the retained old supervisor definition:

    ```bash
    pm2 stop clinicontrol-staging-qa
    pm2 start clinicontrol-staging
    ```

    Restore its backed-up private configuration through the manager, preserving OpenAI. Recheck health/readiness and fresh process/origin mapping. Do not replay queued notifications. For the new protected release, explicit `normal` resumes Staging delivery; removing the mode fails closed. Recovery and exact retained-history cleanup rules remain in the G operator guide; no live lifecycle is authorized here.

STAGING DEPLOYMENT: READY for controlled operator validation with the prerequisites above.

LIVE LIFECYCLE: BLOCKED until independently trusted runtime/worker evidence is integrated and verified.
