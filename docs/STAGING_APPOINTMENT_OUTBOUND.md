# Staging appointment outbound protection

This change is a dependency of QA PR #93. It has not been deployed or remotely exercised.

`APPOINTMENT_OUTBOUND_MODE=isolated` is accepted only with existing `APP_ENV=staging` and exact `APP_BASE_URL=https://staging.clinicontrol.mx`. It stops Resend before SDK construction, every Google Calendar transport (OAuth exchange/refresh/revoke and event create/update/delete), and WhatsApp provider readiness. The automation runner returns zero counters before obtaining an admin client/claiming jobs. Immediate invitations, reminder/review and support email share the guarded Resend boundary. No message is marked sent and no fake provider ID is created. Guards emit no new payload/credential logs.

OpenAI, Supabase and PayPal are outside this appointment communication switch; OpenAI flags/key/model are unchanged. Isolation is process-wide for the protected channels, including support email, not a patient-specific exception.

Staging requires explicit `normal` or `isolated`. Missing/malformed/empty mode, inconsistent Staging scope or an unknown APP_ENV fails closed; readiness returns 503 for blocked configuration. Normal non-Staging production defaults are preserved. Intentionally isolated Staging reports email disabled and `checks.outbound=isolated`, including when email is required. That field is a safe effective-policy observation, not deployment attestation or proof that unreviewed external senders are absent.

Do not configure production with this mode. A mistaken isolation request in a non-Staging scope blocks rather than silently sending. A server operator must verify effective behavior and the serving release after a separately authorized deployment. All app/worker processes must run the reviewed artifact and policy, or be independently excluded/stopped through an authorized operation. An external script/provider, old worker or other host can bypass application code; this PR does not claim network-wide isolation.

Rollback after exact QA cleanup: restore the previous reviewed release/config through the normal controlled rollback. For this new release in Staging, explicitly use `APPOINTMENT_OUTBOUND_MODE=normal` to resume delivery; removing it leaves Staging blocked. Never re-enable outbound while temporary active bookings/proposals or deferred jobs could generate communications. Do not delete, replay or run queued jobs to validate isolation. Keep the current OpenAI environment unchanged.

Tests execute actual adapters and runner in isolated VM environments with network/DB doubles, including invalid configuration, production defaults, Cron, all Calendar operations, WhatsApp rejection, email readiness and the real OpenAI transport against a synthetic HTTP double. No real provider call occurs in tests.
