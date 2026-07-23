# Clinical note finalization

## Schema discovered

`public.medical_notes` already has `id`, `clinic_id`, `patient_id`, `doctor_id`,
`appointment_id`, `template_id`, `status`, `specialty`, `clinical_impression`,
`diagnosis`, `icd10_code`, `note_data`, `finalized_at`, `created_at`, and
`updated_at`. The real `medical_note_status` enum is `draft`, `finalized`, and
`archived`. `finalized_by` did not exist, so migration `0014` adds it as a nullable
reference to `auth.users`.

Migration `0014_clinical_note_finalization.sql` has not been applied by the
application. Apply it through the reviewed Supabase migration process only.

## Permissions and transition

Owner, admin, and doctor can read and finalize a draft in the active clinic.
Assistants cannot access the clinical record. The application preserves the
existing edit rule: owner/admin can edit any draft in the active clinic; a doctor
can edit only a draft whose `doctor_id` is the current user. The existing database
RLS update policy is broader for doctors in the same clinic, so this PR does not
silently redefine it; server actions retain the author check for edits.

The only new lifecycle transition is `draft` to `finalized`. There are no
enmiendas, addenda, co-signatures, electronic signatures, restoration to draft,
or deletion flows in this change. `doctor_id` remains the clinical professional;
`finalized_by` records the authenticated actor, including an owner/admin who
finalizes a doctor's note.

## Inmutability and concurrency

The migration adds a `BEFORE UPDATE OR DELETE` trigger with a fixed search path.
It allows normal draft edits and one atomic `draft -> finalized` transition. During
that transition PostgreSQL sets `finalized_at = now()` and
`finalized_by = auth.uid()` itself; neither value is accepted from the client.
After finalization, all updates are rejected. Deleting a finalized note is also
rejected; there is no client DELETE policy for notes.

The finalization action receives only the route-bound note ID plus
`expected_updated_at` and the literal expected status `draft`. Its server query
filters by note ID, active `clinic_id`, patient ID, `status = draft`, and the exact
`updated_at`. A zero-row result is rechecked inside the same tenant and returns the
generic message: `La nota cambió o ya fue finalizada en otra sesión. Actualiza la
página.` This handles double tabs and concurrent finalization without disclosing
another tenant's data.

Finalization never reloads or copies a template. The existing `note_data` remains
the record snapshot, so later changes to either a system or clinic template cannot
alter a draft or finalized note.

## Audit limitation

`audit_logs` has the necessary fields, but its existing INSERT policy permits only
owner/admin. Doctors must also be able to finalize notes, so recording an audit row
would not work uniformly without changing audit RLS. This PR intentionally does not
force a partial audit path. `finalized_at` and `finalized_by` are the minimum
evidence for this transition; no clinical content is emitted to application logs.

## Manual verification

1. As owner, admin, and doctor, finalize a draft and confirm the final badge,
   timestamp, and available finalizer name appear.
2. Verify the finalized note has no edit control; opening its `/edit` route returns
   the not-found state and a manual update action is rejected.
3. Open two tabs, edit or finalize in one, then finalize in the other; verify the
   generic concurrency message appears.
4. Verify assistant access is denied and a note from another tenant is not found.
5. Verify a note with no template, a note related to an appointment, and a patient
   with consents retain their existing data and links.
6. Change a referenced template after finalization and verify the note content is
   unchanged.
7. At 390 px, open the dialog, use Escape and Cancel, verify focus returns to the
   Finalizar nota button, and verify the stacked actions have no horizontal scroll.

## Applying

Apply migration `0014` through the normal reviewed process. Then verify the
trigger and fields with a draft created through the application before enabling
the workflow in a controlled environment. Do not apply migrations from the app and
do not use `service_role` for this flow.
