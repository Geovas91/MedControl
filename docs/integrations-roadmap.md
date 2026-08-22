# CliniControl Integrations Roadmap

This document records the integration roadmap and separates the shipped local implementation from future provider work. Google Calendar, consent signing, calendar email invitations and the appointment assistant now use persisted Supabase data; external messaging providers remain outside the current scope.

## Google Calendar v1 (implemented)

1. Supabase Auth identifies the user and active clinic; Calendar uses a separate OAuth web client.
2. Migration 0029 stores one integration per clinic/user/provider and tenant-safe appointment/event mappings.
3. Authorization Code exchange, refresh and revocation run server-side; refresh tokens use AES-256-GCM.
4. The only requested scope is `calendar.events.owned` and the target is the user's primary calendar.
5. Create, reschedule, cancel and restore perform best-effort one-way synchronization after the clinical mutation.
6. Connect, disconnect, reconnect-required, sync and sanitized failure events are audited.

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

## Future provider work outside current v1

- WhatsApp and SMS provider delivery.
- Calendar webhooks/watch channels and bidirectional synchronization.
- Calendar selection and bulk import.
- Public calendar feed URLs.
- Google Meet, Outlook and Apple Calendar OAuth.
- Production provider configuration and external acceptance testing.

## Future Environment Variables

```bash
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=
CALENDAR_TOKEN_ENCRYPTION_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
APP_BASE_URL=
```
