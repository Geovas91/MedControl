import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canEditIssuedConsent, hasUnsavedConsentChanges, UNSAVED_CONSENT_MESSAGE } from "../../lib/consents/editing.ts";

const persisted = {
  consentType: "Procedimiento",
  consentVersion: "v1",
  consentText: "Texto persistido anterior."
};

const workspace = readFileSync(new URL("../../components/clinical-record/pending-consent-workspace.tsx", import.meta.url), "utf8");
const signingControls = readFileSync(new URL("../../components/clinical-record/consent-signing-link-controls.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../../lib/server/clinical-consents.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../app/dashboard/patients/[id]/consents/[consentId]/actions.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/0024_update_pending_consent_content.sql", import.meta.url), "utf8");

test("editing without saving creates a dirty state and blocks every signing channel", () => {
  assert.equal(hasUnsavedConsentChanges({ ...persisted, consentText: "Texto nuevo." }, persisted), true);
  assert.equal(hasUnsavedConsentChanges({ ...persisted, consentText: `${persisted.consentText}\n` }, persisted), true);
  assert.match(workspace, /signingActionsBlocked = dirty \|\| isSaving/);
  assert.equal(UNSAVED_CONSENT_MESSAGE, "Guarda los cambios antes de generar un enlace de firma.");
  assert.match(workspace, /UNSAVED_CONSENT_MESSAGE/);
  assert.match(signingControls, /disabled=\{pending \|\| blocked\}/);
  assert.match(signingControls, /disabled=\{signingActionsBlocked \|\| !qrAvailability\.available\}/);
  assert.match(signingControls, /disabled=\{signingActionsBlocked \|\| !emailAvailability\.available\}/);
  assert.match(signingControls, /disabled=\{signingActionsBlocked\}[\s\S]+Copiar enlace/);
});

test("after persisting the new snapshot, the saved values are no longer dirty", () => {
  const saved = { ...persisted, consentText: "Texto nuevo persistido." };
  assert.equal(hasUnsavedConsentChanges(saved, saved), false);
  assert.match(workspace, /setPersistedValues\(result\.values\)/);
  assert.match(workspace, /setExpectedUpdatedAt\(result\.updatedAt\)/);
  assert.match(workspace, /router\.refresh\(\)/);
  assert.match(server, /select\("consent_type, consent_version, consent_text, updated_at"\)/);
});

test("active links and signed states make the issued snapshot non-editable", () => {
  assert.equal(canEditIssuedConsent("pending", true), false);
  assert.equal(canEditIssuedConsent("signed", false), false);
  assert.equal(canEditIssuedConsent("cancelled", false), false);
  assert.match(workspace, /Revoca el enlace vigente antes de editar el consentimiento\./);
  assert.match(migration, /v_consent\.status <> 'pending'[\s\S]+return 'immutable'/);
  assert.match(migration, /signing_token_hash is not null[\s\S]+return 'active_link'/);
});

test("save and token issuance are serialized against the exact displayed revision", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /v_consent\.updated_at is distinct from p_expected_updated_at/);
  assert.match(migration, /consent\.updated_at = p_expected_updated_at/);
  assert.match(server, /detail\.data\.updated_at !== expectedUpdatedAt/);
  assert.match(signingControls, /name="expected_updated_at" value=\{expectedUpdatedAt\}/);
  assert.match(server, /update\.data !== true[\s\S]+state: "stale"/);
});

test("editing an issued consent does not mutate its reusable template", () => {
  const updateStatement = migration.match(/update public\.consents[\s\S]*?where id = v_consent\.id;/)?.[0] ?? "";
  assert.match(updateStatement, /consent_text = v_text/);
  assert.doesNotMatch(updateStatement, /medical_note_templates|template_id/);
  assert.match(workspace, /Guardarlo no modifica la plantilla reutilizable\./);
});

test("saving preserves the exact submitted consent text, including surrounding whitespace", () => {
  assert.match(actions, /submittedConsentText = formData\.get\("consent_text"\)/);
  assert.match(actions, /consentText: typeof submittedConsentText === "string" \? submittedConsentText : ""/);
  assert.match(migration, /v_text text := coalesce\(p_consent_text, ''\)/);
  assert.doesNotMatch(migration, /v_text text := trim/);
  assert.match(migration, /v_text !~ '\[\^\[:space:\]\]'/);
});

test("QR, email and copy continue to share the one current in-memory signing URL", () => {
  assert.match(signingControls, /getConsentSigningQrAvailability\([\s\S]+signingUrl: state\.url/);
  assert.match(signingControls, /getConsentEmailAvailability\([\s\S]+signingUrl: state\.url/);
  assert.match(signingControls, /navigator\.clipboard\.writeText\(state\.url!/);
  assert.match(signingControls, /name="signing_url" value=\{state\.url \?\? ""\}/);
});

test("0024 keeps tenant roles and grants narrow and retires unversioned authenticated issuance", () => {
  assert.match(migration, /has_clinic_role\(p_clinic_id, array\['owner', 'admin', 'doctor'\]\)/);
  assert.match(migration, /clinic_has_write_entitlement\(p_clinic_id\)/);
  assert.match(migration, /security definer[\s\S]+set search_path = public, pg_temp/);
  assert.match(migration, /revoke all on function public\.issue_consent_signing_link_for_current_user\([\s\S]+from authenticated/);
  assert.match(migration, /grant execute on function public\.issue_current_consent_signing_link_for_current_user\([\s\S]+to authenticated/);
  assert.doesNotMatch(migration, /service_role|disable\s+trigger|session_replication_role/i);
});
