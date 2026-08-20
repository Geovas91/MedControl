import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getConsentFormValues, validateConsentValues } from "../../lib/clinical-record/consents.ts";
import { hasUnsavedConsentChanges } from "../../lib/consents/editing.ts";

const form = readFileSync(new URL("../../components/clinical-record/consent-form.tsx", import.meta.url), "utf8");
const createAction = readFileSync(new URL("../../app/dashboard/patients/[id]/consents/new/actions.ts", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../../app/dashboard/patients/[id]/consents/[consentId]/page.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../../components/clinical-record/pending-consent-workspace.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../../lib/server/clinical-consents.ts", import.meta.url), "utf8");
const migration0023 = readFileSync(new URL("../../supabase/migrations/0023_consent_signed_documents.sql", import.meta.url), "utf8");
const migration0024 = readFileSync(new URL("../../supabase/migrations/0024_update_pending_consent_content.sql", import.meta.url), "utf8");

test("creation parser preserves the exact visible snapshot and validates trimmed emptiness only", () => {
  const formData = new FormData();
  formData.set("template_id", "  10000000-0000-4000-8000-000000000001  ");
  formData.set("consent_type", "  Tipo visible  ");
  formData.set("consent_version", " v2 ");
  formData.set("consent_text", "  Primera línea  \n\nSegunda línea\t\n");

  assert.deepEqual(getConsentFormValues(formData), {
    templateId: "10000000-0000-4000-8000-000000000001",
    consentType: "  Tipo visible  ",
    consentVersion: " v2 ",
    consentText: "  Primera línea  \n\nSegunda línea\t\n"
  });
  assert.equal(validateConsentValues(getConsentFormValues(formData)).valid, true);
  assert.equal(validateConsentValues({ consentType: "Tipo", consentVersion: "v1", consentText: " \n\t ", templateId: "template" }).valid, false);
});

test("selecting a template preloads editable type, v1 and text", () => {
  assert.match(form, /setConsentType\(template\.name\)/);
  assert.match(form, /setConsentVersion\("v1"\)/);
  assert.match(form, /setContent\(getTemplateContent\(template\.template_schema\)\)/);
  assert.match(form, /Tipo, versión y texto se guardarán como el snapshot/);
  assert.match(form, /value=\{consentType\}[\s\S]+value=\{consentVersion\}[\s\S]+value=\{content\}/);
});

test("creation persists submitted snapshot values and only references the validated template", () => {
  const creation = server.slice(server.indexOf("export async function createConsentForActiveTenant"), server.indexOf("export async function updatePendingConsentForActiveTenant"));
  assert.match(creation, /select\("id"\)[\s\S]+template_kind", "consent"/);
  assert.match(creation, /p_consent_type: values\.consentType/);
  assert.match(creation, /p_consent_version: values\.consentVersion/);
  assert.match(creation, /p_consent_text: values\.consentText/);
  assert.match(creation, /p_template_id: templateId/);
  assert.doesNotMatch(creation, /getTemplateContent|template\.name|template_schema/);
  assert.match(migration0024, /create or replace function public\.create_consent_for_current_user[\s\S]+v_type text := coalesce\(p_consent_type, ''\)[\s\S]+v_version text := coalesce\(p_consent_version, ''\)[\s\S]+v_text text := coalesce\(p_consent_text, ''\)/);
  assert.doesNotMatch(migration0024, /update public\.medical_note_templates/);
});

test("creation redirects to a clean detail that can issue a link immediately", () => {
  const snapshot = { consentType: "Tipo", consentVersion: "v1", consentText: "Texto guardado" };
  assert.equal(hasUnsavedConsentChanges(snapshot, snapshot), false);
  assert.match(createAction, /redirect\(`\/dashboard\/patients\/\$\{result\.patientId\}\/consents\/\$\{result\.consentId\}\?consent_created=1`\)/);
  assert.match(detailPage, /initialValues=\{\{ consentType: consent\.consent_type, consentVersion: consent\.consent_version, consentText: consent\.consent_text \}\}/);
  assert.match(detailPage, /initialUpdatedAt=\{consent\.updated_at\}/);
  assert.match(workspace, /useState\(initialValues\)[\s\S]+useState\(initialValues\)/);
  assert.match(workspace, /signingActionsBlocked = dirty \|\| isSaving/);
  assert.match(detailPage, /signingAction=\{generateConsentSigningLinkAction\.bind/);
});

test("creation emits no token and signed evidence freezes that same snapshot for PDF", () => {
  const createFunction = migration0024.slice(migration0024.indexOf("create or replace function public.create_consent_for_current_user"), migration0024.indexOf("-- Allow explicit edits"));
  assert.match(createFunction, /template_id, signing_token, status[\s\S]+p_template_id, null, 'pending'/);
  assert.doesNotMatch(createFunction, /signing_token_hash\s*=/);
  assert.match(migration0023, /snapshot\.consent_type, snapshot\.consent_version,[\s\S]+snapshot\.consent_text/);
  assert.match(migration0023, /document\.snapshot_id = snapshot\.id/);
});
