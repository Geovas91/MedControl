# ASSISTANT-002.4E / 002.4F — lifecycle boundary inventory

## 002.4F source audit and runtime limits (2026-10-21)

Scope: source at `c893be6da9ac5496ca3fdf3a27570d82f26b8119`, plus the operator-only observer/tests/docs in this change. No deployed process, secret, database setting or server configuration was read. Repository absence findings apply only to this source tree.

| Path / boundary | Inspected behavior | Runtime conclusion |
| --- | --- | --- |
| `lib/server/whatsapp/meta-whatsapp-cloud-provider.ts` | Only provider implementation found. `sendTemplateMessage` rejects both disabled and enabled cases; no HTTP transport. Webhook verification returns false; parser returns empty events. | Source cannot send; deployed transport UNKNOWN |
| `lib/server/whatsapp/config.ts`, `lib/whatsapp/config.ts` | Only exact string `true` enables readiness branch; it still returns unavailable. Meta credentials/provider/version/encryption keys are server-only configuration names. | Initial environment presence does not attest effective config |
| `lib/server/appointment-automation-runner.ts` | `reminder_whatsapp` jobs finish skipped (`provider_not_enabled`) before delivery; email jobs call Resend. | Source runner does not send WhatsApp; deployed/independent runners UNKNOWN |
| `app/api/internal/appointment-automations/run/route.ts` | Bearer cron secret checked before loading service-role runner; POST claims/finishes jobs and can send emails. | Never invoke it for evidence collection |
| `supabase/migrations/0031_appointment_automation_jobs.sql`, `0033_whatsapp_notifications_v1_foundations.sql` and later migrations | SQL queue/lease/domain foundation, consent/provider account/template/delivery tables; reviewed enqueue produces email/review jobs, no implemented WhatsApp provider call. No `pg_cron`/`cron.schedule`/HTTP sender definition found in migrations. | Existing remote jobs, triggers/functions or external consumers UNKNOWN; no DB change/read performed |
| `lib/whatsapp/{types,template-registry,consent,e164}.ts` | Contracts, template/consent/number validation only. | No transport |
| `app/api/**` | No WhatsApp webhook route in current route inventory; PayPal webhook is separate. | Hosted Edge functions/other services not established by repo inventory |
| `config/contact.ts`, `app/page.tsx` | Configured public sales link uses `wa.me` with fixed sales message; user navigation to WhatsApp, not automatic server delivery. | Potential user-initiated channel; not proof of global isolation |
| `app/dashboard/directory/actions.ts`, `lib/server/directory.ts` | WhatsApp directory field storage; no sending function found. Bot page feature labels are informational only. | UI state cannot verify isolation |
| `lib/server/appointment-calendar-email.ts`, `lib/email/resend-provider.ts`, automation runner | Immediate booking invitation/update/cancellation emails and queued reminder/review emails use Resend. Invitations are independent of reminder flags. | Runtime email readiness and all entry points need verification |
| `lib/server/appointment-google-calendar.ts`, `google-calendar-provider.ts` | Connected-calendar refresh and event create/update/delete transport, independently gated by membership/integration. | Safe owner projection plus runtime identity needed |
| Assistant OpenAI provider, PayPal endpoints, support notification service | Additional network/API/email capabilities outside WhatsApp. | Not claimed globally isolated; do not exercise during collection |
| DonWeb runbooks, `next.config.mjs`, `/api/health`, `/api/ready` | Mutable build directory, PM2 or panel-managed Node, reverse proxy; no process-bound artifact attestation. | Checkout SHA/build label/health alone insufficient |

Search scope included `app`, `lib`, `config`, `scripts`, all migrations and API route inventory for WhatsApp/Meta/Twilio/send functions and scheduler/HTTP definitions. No independent WhatsApp worker/SDK transport or queue consumer was found in this checkout. PM2 applications under other users, cron/systemd, containers, external services and Supabase deployed functions remain outside source visibility.

`scripts/qa/assistant-runtime-evidence.ts` reads Git HEAD, hashes selected build files, and projects Linux `/proc` state/cwd/initial environment/child metadata. It never imports app code, calls PM2, contacts a provider or changes files/settings. It does not emit raw environment, process names/arguments, exception messages, paths, build labels or secret digests. No observer field is accepted as a lifecycle authorization input. Read the operator procedure and immutable-release/startup-receipt prerequisite in `ASSISTANT_002_4_LIVE_PREPARATION.md` before collection.

DEPLOYMENT IDENTITY: UNKNOWN

WHATSAPP ISOLATION: UNKNOWN

OTHER OUTBOUND CHANNELS: present in source; runtime isolation UNKNOWN

BACKGROUND WORKERS: UNKNOWN

RUNTIME EVIDENCE: NOT COLLECTED

UNVERIFIED CONDITIONS: serving artifact provenance, proxy/listener/process binding, effective configuration and complete sender/scheduler inventory

REQUIRED OPERATOR COMMANDS: reviewed observer streamed over existing SSH; status-code-only health/readiness GETs; existing read-only management views (see live preparation)

READY FOR READ-ONLY PREFLIGHT: YES (procedure prepared, remote evidence pending)

READY FOR LIVE MUTATIONS: NO

This is a source/contract audit at PR #93 head 46fc2ea and the subsequent QA-only changes. Current remote fixture state, deployed code identity and process configuration were not inspected: the read-only lifecycle CLI stopped at its explicit opt-in gate. The user's reported authenticated-browser and OpenAI Staging PASS are retained separately from this task's local evidence.

| Boundary | Existing implementation | Test consequence |
| --- | --- | --- |
| QA baseline | `scripts/qa/seed-rbac-demo-users.mjs`, patient-scope and availability seed/cleanup scripts | Persistent Norte/Sur baseline is never disposable. Existence/current completeness unverified; do not seed or repair it here. |
| Active tenant | `lib/server/active-tenant.ts` | `auth.getUser`, exactly one active membership and clinic `tenant_type` read. The runner checks the same underlying records using the actual browser session and a public Supabase key. Email/visible clinic name alone cannot grant readiness. |
| Patient creation | `components/patients/create-patient-form.tsx`, `app/dashboard/patients/new/actions.ts`, `lib/server/create-patient.ts` | Owner/entitlement checks precede atomic `create_patient_with_record`; administrative patient, record and initial draft history are created together. Phone/emergency phone and birth date are mandatory. The driver uses only fictional administrative values and the existing form. |
| Patient retirement | edit form/action and `lib/server/update-patient.ts` | Supported authorized operation is `status=inactive`; no archive UI is exposed. The runner never writes patient tables or `archived_at` directly and never deletes records. |
| Eligibility/identity | `lib/server/patients.ts`, registry | Canonical eligibility RPC checked after new patient creation and before any appointment proposal. Initial fixture-creation preflight explicitly defers that check; it does not falsely verify a nonexistent patient's eligibility. |
| Slots | `lib/server/professional-slots.ts`, registry | Protected `get_professional_available_slots`, clinic-member identity, clinic-local future date, 30-minute duration and half-hour starts. Two distinct slots on the same future day are needed. Application revalidates at proposal/confirm. |
| Assistant proposals | `app/dashboard/bot/actions.ts`, registry | Actual component selection/form workflow. Runner reads durable proposed arguments and checks exact references/time/duration, pending/unexecuted status and unchanged persisted appointments before confirmation. No server-action reference is manufactured. |
| One-shot execution | registry and existing migrations 0049/0059/0060 | Actor/clinic scope, atomic claim, `already_claimed`, mutation marker and current write-authority checks. Browser double click plus one authenticated negative call to the application's `execute_claimed_assistant_pending_action_for_current_user` RPC after a verified execution. Only rejection with no persisted/audit change passes. No generic write client or service role. |
| Appointment lifecycle/audit | `lib/server/appointment-lifecycle.ts`, existing lifecycle RPC | Persisted appointment and events read under RLS. Exact creation event must identify this run's actor before a booking is treated as owned. Created/rescheduled/cancelled audit events must each occur once. |
| Immediate invitations | `lib/server/appointment-calendar-email.ts`, `lib/email/config.ts`, `/api/ready` | Registry calls email delivery after confirm, separately from reminder flags. `/api/ready` exposes current configuration readiness; the preflight requires `email=disabled`. A blank email, `.test` address or disabled scheduler alone does not prove all-channel isolation. |
| Scheduler/reminders/reviews | `lib/server/appointment-automation-runner.ts`, scheduler status RPC | Current assistant/reminder/review flags must all be explicitly false. Errors/missing projection block. No jobs are created/claimed manually by the runner. |
| Google Calendar | `appointment-google-calendar.ts`, safe integration-status RPC | General appointment status actions may sync calendars as well as send email. Owner projection must show no connected clinic integration; private tokens/tables are never read. |
| WhatsApp | provider skeleton and runner skip branch | Audited source currently rejects provider sends and skips WhatsApp jobs, but source text/static UI is not proof of the deployed workers. Built-in gate remains UNKNOWN pending deployment-bound verification. |
| Environment/deployment | Next/PM2 and health/readiness architecture | Existing routes do not attest the source/build of every relevant process/worker. An env flag or claimed SHA cannot prove runtime identity. Deployment gate remains UNKNOWN; no deployed variables/build/processes changed. |
| Recovery | `scripts/qa/lifecycle/journal.ts`, `runner.ts` | AES-256-GCM, external private path, exclusive lock, atomic/fsynced write-ahead steps, revision/identity checks. Recover only exact owned patient/appointments/proposals. No retry of an ambiguous create/confirm. Failure retains encrypted recovery data. |

## Verified locally vs current runtime unknown

Local unit tests validate state-machine checks, ownership, encryption/locking, ambiguity recovery, one-shot result handling and cleanup failure behavior. Real Chrome validates the same driver against actual React patient forms/actions/orchestration with fake protected data and mutation boundaries. These tests do not establish remote SQL/RLS persistence or outbound isolation.

The built-in adapter deliberately cannot become ready by setting every execution flag. It still returns UNKNOWN for WhatsApp and deployment identity. A separately reviewed, read-only runtime verification mechanism must bind channel behavior to the actual Staging build/processes and worker configuration before those gates can be verified. Until then, no new patient or appointment may be created remotely by this runner.
