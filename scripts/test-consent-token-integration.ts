import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadConsentEmailData, runConsentEmailDelivery } from "../lib/consents/email-delivery.ts";
import { createSigningToken, hashSigningToken } from "../lib/consents/signing-token.ts";

const token = createSigningToken();
const tokenHash = hashSigningToken(token);
assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
assert.match(tokenHash, /^[a-f0-9]{64}$/);

const sql = String.raw`
begin;
insert into auth.users(id, email) values ('19000000-0000-4000-8000-000000000001', 'qr-integration@example.test');
insert into public.clinics(id, name) values ('29000000-0000-4000-8000-000000000001', 'QR Integration Clinic');
insert into public.clinic_members(clinic_id, user_id, role, status) values ('29000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000001', 'owner', 'active');
insert into public.clinic_subscriptions(clinic_id, plan_id, status, billing_provider) values ('29000000-0000-4000-8000-000000000001', 'pro', 'active', 'manual');
insert into public.patients(id, clinic_id, full_name, first_names, paternal_surname, internal_identifier, email, status) values ('39000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'Paciente QR', 'Paciente', 'QR', 'PAC-QRINTEGR8', 'qr-integration@example.test', 'active');
insert into public.clinical_records(id, clinic_id, patient_id, status) values ('49000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000001', 'active');
create temporary table qr_integration(consent_id uuid, public_available boolean, patient_visible boolean, consent_visible boolean, hash_read_sqlstate text, server_hash_visible boolean);
grant select, insert, update on qr_integration to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
insert into qr_integration(consent_id) select public.create_consent_for_current_user('29000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000001', 'Consentimiento QR', 'v1', 'Texto ficticio de integración.', null);
select public.issue_consent_signing_link_for_current_user('29000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000001', (select consent_id from qr_integration), '${tokenHash}', now() + interval '7 days');
update qr_integration set
  patient_visible = exists(select 1 from public.patients where id = '39000000-0000-4000-8000-000000000001' and clinic_id = '29000000-0000-4000-8000-000000000001' and email = 'qr-integration@example.test'),
  consent_visible = exists(select 1 from public.consents where id = consent_id and patient_id = '39000000-0000-4000-8000-000000000001' and clinic_id = '29000000-0000-4000-8000-000000000001' and status = 'pending');
do $permission_check$
begin
  perform signing_token_hash from public.consents where id = (select consent_id from qr_integration);
exception when others then
  update qr_integration set hash_read_sqlstate = sqlstate;
end
$permission_check$;
reset role;
update qr_integration set server_hash_visible = exists(select 1 from public.consents where id = consent_id and signing_token_hash = '${tokenHash}');
set local role anon;
update qr_integration set public_available = exists(select 1 from public.get_public_consent_for_signing('${tokenHash}'));
reset role;
select json_build_object(
  'status_pending', consent.status = 'pending',
  'stored_hash_match', consent.signing_token_hash = '${tokenHash}',
  'expires_future', consent.signing_token_expires_at > now(),
  'unused', consent.signing_token_used_at is null,
  'not_revoked', consent.signing_token_revoked_at is null,
  'public_available', test.public_available,
  'patient_visible', test.patient_visible,
  'consent_visible', test.consent_visible,
  'hash_read_sqlstate_42501', test.hash_read_sqlstate = '42501',
  'server_hash_visible', test.server_hash_visible
)
from qr_integration test join public.consents consent on consent.id = test.consent_id;
rollback;
`;

const result = spawnSync("docker", ["exec", "-i", "supabase_db_CliniControl", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
  input: sql,
  encoding: "utf8"
});

if (result.status !== 0) {
  const safeError = result.stderr.replace(/[a-f0-9]{64}/gi, "[hash-redacted]").trim();
  throw new Error(`Local consent integration failed. Start the local Supabase stack and retry.${safeError ? ` ${safeError}` : ""}`);
}

const resultLine = result.stdout.split(/\r?\n/).find((line) => line.trim().startsWith("{"));
assert.ok(resultLine, "Integration result was not returned.");
const verification = JSON.parse(resultLine) as Record<string, boolean>;
assert.deepEqual(verification, {
  status_pending: true,
  stored_hash_match: true,
  expires_future: true,
  unused: true,
  not_revoked: true,
  public_available: true,
  patient_visible: true,
  consent_visible: true,
  hash_read_sqlstate_42501: true,
  server_hash_visible: true
});

const loaded = await loadConsentEmailData({
  patient: async () => ({ data: verification.patient_visible ? { email: "qr-integration@example.test" } : null }),
  consent: async () => ({ data: verification.consent_visible ? {
    id: "59000000-0000-4000-8000-000000000001",
    status: "pending",
    consentType: "Consentimiento QR",
    signingTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    signingTokenUsedAt: null,
    signingTokenRevokedAt: null
  } : null }),
  consentTokenHash: async () => ({ data: verification.server_hash_visible ? { signingTokenHash: tokenHash } : null })
});
let sent = 0;
const delivery = await runConsentEmailDelivery(`https://clinic.example/consent/sign/${token}`, {
  resolveContext: async () => ({
    userId: "19000000-0000-4000-8000-000000000001",
    clinicId: "29000000-0000-4000-8000-000000000001",
    patientId: "39000000-0000-4000-8000-000000000001",
    consentId: "59000000-0000-4000-8000-000000000001",
    clinicName: "QR Integration Clinic",
    timeZone: "America/Mexico_City"
  }),
  loadData: async () => loaded,
  getCanonicalBaseUrl: () => "https://clinic.example",
  providerReady: () => true,
  send: async () => { sent += 1; return { ok: true }; },
  audit: async () => undefined,
  log: () => undefined
});
assert.deepEqual(delivery, { state: "sent" });
assert.equal(sent, 1);

console.log("Consent email integration passed: authenticated tenant reads succeed, protected hash access returns 42501, and server-scoped delivery completes.");
