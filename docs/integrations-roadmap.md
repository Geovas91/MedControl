# CliniControl Integrations Roadmap

This document describes the future implementation plan for calendar integrations, patient consent QR signing, and the premium appointment confirmation bot. The current application remains frontend-only with mock data.

## Google Calendar OAuth Plan

1. Add Supabase Auth for doctors and clinic staff before external account connections.
2. Create a secure `doctor_calendar_connections` table linked to the authenticated doctor.
3. Implement Google OAuth using a server-side callback route and encrypted token storage.
4. Request the minimum calendar scopes needed for appointment creation and sync.
5. Add calendar selection, sync direction preferences, token refresh handling, and disconnect controls.
6. Write audit records for connect, disconnect, sync, and token refresh events.

## iCalendar Generation Plan

1. Keep ICS generation server-side once appointments are stored in the database.
2. Include only calendar-safe appointment details: time, doctor or clinic name, location, and generic appointment label.
3. Exclude diagnosis, clinical notes, treatment details, billing details, and sensitive health data from calendar descriptions.
4. Support downloadable `.ics` files and optional email attachment once email delivery is connected.
5. Add signed, expiring feed URLs for clinic calendars instead of public permanent links.

## Patient Consent QR Signing Architecture

1. Store consent templates, versions, generated signing tokens, status, timestamps, and doctor/clinic ownership in Supabase.
2. Generate a short-lived token for each consent request and expose it through a public signing route.
3. Display reviewed consent text, privacy notices, patient identity context, and confirmation checkboxes.
4. Capture signature data only after legal and compliance review.
5. Record submission metadata, consent text version, and immutable audit trail entries.
6. Do not claim legal compliance in the product until templates, identity verification, storage, and audit controls are reviewed by qualified professionals.

## Appointment Confirmation Bot Architecture

1. Require a Premium / Clinic plan before enabling bot delivery.
2. Store channel preferences, reminder timing, quiet hours, max reminders, and escalation behavior per clinic.
3. Use provider-approved templates for WhatsApp/SMS/email.
4. Require patient opt-in or consent before sending automated messages.
5. Process replies such as `1 = Confirm`, `2 = Reschedule`, and `3 = Cancel`.
6. Escalate unclear, failed, or reschedule responses to clinic staff.
7. Log outbound messages, inbound responses, delivery failures, and resulting appointment status changes.

## Data Privacy And Security Considerations

- Do not store production credentials in source code.
- Do not include clinical notes, diagnosis, or treatment details in calendar invitations.
- Encrypt provider tokens and sensitive configuration values.
- Use Row Level Security so doctors and clinics only access their own records.
- Add audit logs for consent, message delivery, calendar sync, and appointment status changes.
- Validate patient opt-in before automated reminders.
- Keep public consent tokens short-lived and scoped to one consent request.

## What Remains Mock-Only Before Supabase

- Google OAuth connection flow.
- Calendar sync jobs and external calendar writes.
- Email, WhatsApp, and SMS delivery.
- Legal signature validation.
- Consent storage and audit trails.
- Real appointment invitation state persistence.
- Public calendar feed URLs.
- Production credential handling.

## Future Environment Variables

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
APP_BASE_URL=
```
