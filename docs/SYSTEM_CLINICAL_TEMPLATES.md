# System clinical templates

Migration `0013_system_clinical_templates.sql` introduces global system templates
without weakening tenant isolation. System rows have `is_system_template = true`,
`clinic_id = null`, `created_by = null`, and a stable `system_key`. Clinic rows
retain a non-null clinic ID and no system key.

The migration replaces template policies so an authenticated owner, admin, or
doctor with at least one active clinic membership can select system templates. The
same roles can select clinic templates only through the existing
`has_clinic_role(clinic_id, ...)` helper, so no tenant can read another tenant's
private templates. Assistants and anonymous callers cannot read this catalog.
Inserts and updates are limited to owner/admin users and non-system rows in their
own clinic. RLS requires `system_key` to remain null for clinic rows and requires
the creator of a new clinic template to be the authenticated user. There is no
delete policy. The application applies the same owner/admin management rule and
prevents edit or activation controls on a system template.

The ownership-shape constraint is added as `NOT VALID` only long enough for the
migration to normalize a specific legacy shape and inspect all remaining rows. Old
local seed rows with `is_system_template = true` and a non-null `clinic_id` are
clinic-owned templates, not global masters. Migration `0013` changes only those
rows to `is_system_template = false` and `system_key = null`; it preserves their
ID, clinic, creator, content, timestamps (except an automatic update timestamp),
and references from notes or consents. It immediately aborts if any other row is
incompatible and validates the constraint only after that inspection passes.

`supabase/seeds/system_clinical_templates.sql` is idempotent. It upserts only rows
identified by system keys and only when the conflicting row is still a system row;
it never overwrites a clinic template or deletes data. Apply migration 0013 first,
then run the seed with an administrative connection in a controlled environment.
Do not run either operation from the application or directly against production.

After a controlled seed run, verify that the content has real line breaks and no
literal `\\n` sequences, and that the catalog remains idempotent:

```sql
select
  count(*) filter (where is_system_template and template_kind = 'note') as system_notes,
  count(*) filter (where is_system_template and template_kind = 'consent') as system_consents,
  count(distinct system_key) filter (where is_system_template) as unique_system_keys,
  count(*) filter (where not is_system_template) as clinic_templates
from public.medical_note_templates;

select
  system_key,
  position(E'\\n' in template_schema->>'content') > 0 as has_line_break,
  position('\\n' in template_schema->>'content') = 0 as has_no_literal_backslash_n
from public.medical_note_templates
where is_system_template
  and template_kind = 'consent'
order by system_key;

select count(*) as incompatible_ownership_rows
from public.medical_note_templates
where
  (is_system_template and (clinic_id is not null or created_by is not null or system_key is null))
  or (not is_system_template and (clinic_id is null or system_key is not null));

select
  count(*) as total,
  count(distinct system_key) as unique_keys
from public.medical_note_templates
where is_system_template;

select system_key
from public.medical_note_templates
where is_system_template
  and system_key !~ '^[a-z0-9_]+_v[0-9]+$';

select id, clinic_id, is_system_template, system_key
from public.medical_note_templates
where id = '40000000-0000-0000-0000-000000000001';
```

Expected seed-managed counts are 71 system note templates, 8 system consent
templates, and 79 unique system keys. Re-running the seed updates only the 79
system-keyed rows, creates no duplicates, and does not modify clinic templates.
The ownership query must return zero, the key-format query must return zero rows,
and the legacy demo template query must retain its original ID and clinic ID with
`clinic_id = 10000000-0000-0000-0000-000000000001`,
`is_system_template = false`, and `system_key = null`. Note keys are declared
explicitly in the seed, so rearranging catalog rows cannot change a key's meaning;
future semantic revisions must use a new `_v2` key.

To roll back safely, first deploy code that no longer expects global templates.
Then remove the seed-managed system rows by `system_key`, drop the new policies and
indexes, restore the prior policies, and only then consider dropping `system_key`.
Never delete or alter clinic-owned templates during rollback.
