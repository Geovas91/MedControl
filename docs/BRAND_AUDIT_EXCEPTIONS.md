# CliniControl Brand Audit Exceptions

The public product brand is CliniControl. The automatic audit allows only the technical references listed below.

| File | Reference | Reason | Risk of renaming | User-visible? |
| --- | --- | --- | --- | --- |
| `docs/DONWEB_CLOUDPANEL_RUNBOOK.md` | Historical GitHub repository URL for `Geovas91/` + `Med` + `Control.git`. | The repository has not been renamed in GitHub. | Deployment clone instructions would point to a repository that does not exist. | No. Operator documentation only. |
| `docs/STAGING_DEPLOY.md` | Historical migration filename `0001_initial_` + `med` + `control_schema.sql`. | It identifies an applied migration in staging checks. | Operators could fail to match the deployed migration history. | No. Operator documentation only. |
| `supabase/migrations/0001_initial_` + `med` + `control_schema.sql` | Applied migration filename. | Applied migration filenames are part of deployment history. | Renaming it can confuse migration audits and deployment history. | No. Migration source only. |
| `supabase/migrations/0001_initial_` + `med` + `control_schema.sql` | Persisted sync direction value `med` + `control_to_provider`. | Existing Google Calendar integration records can depend on this stored value. | Renaming it can break compatibility with stored sync direction values. | No. Database default value only; it is not rendered in UI copy. |
