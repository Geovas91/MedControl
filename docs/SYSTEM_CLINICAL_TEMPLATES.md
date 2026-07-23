# System clinical templates

Migration `0013_system_clinical_templates.sql` introduces global system templates
without weakening tenant isolation. System rows have `is_system_template = true`,
`clinic_id = null`, `created_by = null`, and a stable `system_key`. Clinic rows
retain a non-null clinic ID and no system key.

The migration replaces template policies so authorized clinical roles can select a
system template or a template from their own clinic only. Inserts and updates are
limited to non-system clinic rows. There is no delete policy. The application also
enforces owner/admin-only management and prevents edit or activation controls on a
system template.

`supabase/seeds/system_clinical_templates.sql` is idempotent. It upserts only rows
identified by system keys and only when the conflicting row is still a system row;
it never overwrites a clinic template or deletes data. Apply migration 0013 first,
then run the seed with an administrative connection in a controlled environment.
Do not run either operation from the application or directly against production.

To roll back safely, first deploy code that no longer expects global templates.
Then remove the seed-managed system rows by `system_key`, drop the new policies and
indexes, restore the prior policies, and only then consider dropping `system_key`.
Never delete or alter clinic-owned templates during rollback.
