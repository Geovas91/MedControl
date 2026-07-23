# Clinical template catalog

The system catalog contains 71 note templates and 8 consent templates. Notes cover
General / Multidisciplinaria, Medicina general, Pediatría, Ginecología y
obstetricia, Medicina interna, Cardiología, Endocrinología, Dermatología,
Traumatología y ortopedia, Gastroenterología, Neurología, Psiquiatría, and
Psicología.

Each master has an explicit semantic `system_key` ending in `v1`; no key depends on
its position in the catalog. Future revisions must use a new `_v2` key rather than
rewriting a template copied by a clinic. The current seed uses
`template_schema.content` as safe text and does not render HTML, Markdown, scripts,
or dynamic placeholders.

The catalog UI distinguishes `CliniControl` recommendations from `Mi clínica`.
It supports validated combinations of name search, specialty, type, origin, and
clinic-template status. System templates can be previewed and duplicated. Their
copies append `Personalizada`, belong to the active clinic, are created by the
authenticated user, and begin active for immediate customization.

To add a template, add a new stable key and row to the system seed, preserve the
Spanish specialty names, and keep the text non-prescriptive. Do not reuse or change
an existing key for a semantically different template.
