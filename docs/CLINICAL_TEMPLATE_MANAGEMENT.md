# Clinical template management

## Schema discovered

`medical_note_templates` already provided tenant ownership, `template_schema`,
`is_active`, `created_by`, `created_at`, and `updated_at`. It did not distinguish
note templates from consent templates. Migration `0012_clinical_templates_and_consent_signing.sql`
adds the compatible `template_kind` value of `note` or `consent`; existing rows
default to `note`.

## Management

`/dashboard/settings/clinical-templates` lists templates by active state and type.
The application permits owner and admin to create, edit, duplicate, activate, and
deactivate. Doctors can use available note templates but cannot manage them in the
new UI, even though the older RLS policy remains unchanged. Assistants cannot view
this management area.

Templates are never physically deleted. Duplicates append `Copia` and start
inactive. Updates compare `updated_at`; a concurrent change is rejected. Forms
store user-entered text in a constrained JSON object and render it as text only.
No JSON editor, HTML interpolation, or executable placeholders are supported.

## Historical records

Notes retain their stored `note_data`, and consents retain their existing
`consent_text`. A consent made from a template copies its text and records the
optional template reference. Editing or deactivating the template cannot modify
previous notes or consents.

## Applying and rolling back

Apply migration `0012` through the normal reviewed Supabase migration process;
the application never applies it. Before rollback, confirm no application version
uses the new columns or RPCs. Revoke the two RPC grants, drop the RPCs and new
indexes, then drop the added columns. Do not restore or reuse a raw signing token.
