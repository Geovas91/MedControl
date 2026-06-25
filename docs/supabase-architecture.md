# CliniControl Supabase Architecture

CliniControl is still mock-first in the UI. This document explains the Supabase schema, auth model, RLS strategy, and rollout plan for replacing mock data incrementally.

## 1. Schema Overview

The initial schema creates a clinic-centered workspace model:

- `profiles` stores authenticated user profile data tied to `auth.users`.
- `clinics` stores clinic/workspace information.
- `clinic_members` maps users to clinics and roles.
- `patients`, `appointments`, `payments`, `medical_note_templates`, and `medical_notes` hold the core clinic workflow.
- `consents` and `consent_signatures` prepare the QR signing flow.
- `calendar_integrations` and `appointment_invites` prepare calendar and invitation metadata.
- `bot_settings` and `bot_logs` prepare the premium appointment confirmation bot.
- `audit_logs` stores important operational and security events.

## 2. Table Descriptions

`profiles` mirrors basic authenticated user details such as full name, email, phone, and role.

`clinics` represents the workspace boundary for a doctor or clinic team.

`clinic_members` enables multi-clinic and multi-doctor access. A user can belong to multiple clinics with different roles.

`patients` belongs to a clinic and optionally references the primary doctor.

`appointments` belongs to a clinic, patient, and optional doctor. It stores scheduling, invite, and reminder status.

`payments` belongs to a clinic and optionally references a patient and appointment.

`medical_note_templates` stores JSON-based templates that can be customized per clinic.

`medical_notes` stores structured note data as JSON. No AI diagnosis, treatment, or decision-making is implemented.

`consents` stores generated consent documents and signing tokens. `consent_signatures` stores signature metadata.

`calendar_integrations` stores provider metadata. Token columns are placeholders and must be encrypted or stored securely before production.

`appointment_invites` stores invite delivery status and external event identifiers.

`bot_settings` stores clinic-level reminder bot settings. `bot_logs` stores message activity.

`audit_logs` stores security-relevant actions.

## 3. RLS Strategy

RLS is enabled on every public table.

Helper functions centralize clinic access checks:

- `public.current_user_clinic_ids()`
- `public.is_clinic_member(clinic_id uuid)`
- `public.has_clinic_role(clinic_id uuid, allowed_roles text[])`

Policies follow these rules:

- Users can read and update only their own profile.
- Clinic members can read basic clinic records they belong to.
- Users can read their own clinic membership rows. Clinic owners/admins can manage all memberships for a clinic.
- Patients can be read by owners, admins, doctors, and assistants. Assistant access is included only for scheduling/front-desk workflows and should be revisited if a clinic wants stricter patient-directory separation.
- Appointments and appointment invites can be read by owners, admins, doctors, and assistants for scheduling workflows.
- Payments can be read by owners, admins, and doctors. Only owners/admins can insert or update payments. Assistants do not read payments by default.
- Medical note templates and medical notes can be read by owners, admins, and doctors. Assistants do not read medical notes by default.
- Consents can be read by owners, admins, and doctors. Assistants do not read full `consent_text` by default; a future limited view may expose only pending/signed status if needed for front-desk follow-up.
- Consent signatures can be read by owners, admins, and doctors. Assistants do not read signatures by default.
- Calendar integrations and bot settings are owner/admin only.
- Bot logs are owner/admin only in the initial schema. A future phase may add doctor access limited to logs for their own appointments.
- Audit logs are owner/admin only.
- No broad anon policies are created for sensitive tables.

## 4. Auth Flow

The app uses the official Supabase SSR approach with:

- `@supabase/supabase-js`
- `@supabase/ssr`
- `lib/supabase/client.ts` for Client Components.
- `lib/supabase/server.ts` for Server Components, Server Actions, and Route Handlers.
- `proxy.ts` plus `lib/supabase/proxy.ts` for cookie-based session refresh.

The `/login`, `/signup`, and `/register` pages now post to server actions that use Supabase Auth:

- `signInAction` calls `supabase.auth.signInWithPassword()`.
- `signUpAction` calls `supabase.auth.signUp()` with `full_name` and `clinic_name` metadata.
- `signOutAction` calls `supabase.auth.signOut()`.
- `/auth/callback` exchanges the PKCE code for a session and redirects back into the app.

The app continues to run in mock mode if Supabase environment variables are missing. In that state, auth actions show a configuration error instead of attempting a network request.

Dashboard routes are not protected yet. Add route guards only after profiles and clinic membership onboarding are working. The dashboard shell can display the current Supabase user and sign out, but mock data remains visible for development.

## 5. Multi-Clinic And Multi-Doctor Access Model

The `clinic_members` table controls access:

- `owner`: can manage clinic settings, memberships, integrations, and bot settings.
- `admin`: can manage clinic operations and many settings.
- `doctor`: can manage clinical workflow records inside the clinic.
- `assistant`: can support scheduling/front-desk operations. In the initial RLS model, assistants can read appointment and patient scheduling context, but not payments, medical notes, full consent records, consent signatures, calendar integrations, bot settings/logs, or audit logs by default.

All clinic-scoped tables include `clinic_id`. This keeps RLS policies simple and makes future multi-clinic switching explicit.

## 6. Public Consent Signing Security Model

The public consent route must not query all consent records directly from the browser with anon permissions.

Future implementation should:

1. Receive a signing token in a public route.
2. Validate the token server-side.
3. Return only the minimum consent text needed for that token.
4. Submit the signature through a server action or route handler.
5. Verify expiry, status, consent version, and patient context before writing.
6. Store audit metadata without exposing unrelated clinic or patient records.

The current code does not implement legal signature validation and does not claim legal compliance.

## 7. Calendar Integration Token Security

`calendar_integrations` includes token placeholder columns so schema relationships can be planned early.

Before production:

- Encrypt provider tokens or store them in a secure secret manager.
- Never expose access tokens to Client Components.
- Store only the minimum metadata needed for sync.
- Add disconnect and token rotation workflows.
- Log connect, refresh, sync, and disconnect events.

## 8. Appointment Bot Security And Opt-In

Real bot delivery requires:

- A messaging provider such as Twilio or WhatsApp Cloud API.
- Approved templates where required.
- Patient opt-in and consent tracking.
- Quiet hours and maximum reminder enforcement.
- Audit logs for outbound and inbound messages.
- Staff escalation for failed, unclear, or reschedule responses.

No real WhatsApp, SMS, or email messages are sent in the current app.

## 9. What Remains Mock-Only

- Dashboard UI data.
- CRUD screens.
- Login and registration actions.
- Public consent signing writes.
- Calendar OAuth and token handling.
- Calendar sync jobs and `.ics` delivery.
- WhatsApp, SMS, and email delivery.
- Appointment bot execution.
- Production credential handling.

## 10. Future Implementation Phases

Phase 1: Auth and profiles

Phase 2: Clinics and clinic members

Phase 3: Patients

Phase 4: Appointments and payments

Phase 5: Medical notes

Phase 6: Consents and signatures

Phase 7: Calendar integrations

Phase 8: Appointment bot
