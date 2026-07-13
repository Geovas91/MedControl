# CliniControl Operations Foundation

This document describes the staging operations baseline for CliniControl. It covers non-sensitive configuration, public versioning, structured logging, and the safe health check endpoint.

## Centralized Configuration

Configuration lives under `config/`:

- `config/app.ts`: public service name, public version, public environment label, support email fallback, and safe PayPal environment label.
- `config/brand.ts`: public brand name, description, domains, and support fallback.
- `config/domains.ts`: canonical app URL resolution and public domain labels.
- `config/features.ts`: public feature flags such as demo consent.
- `config/contact.ts`: support WhatsApp placeholder and public sales message.
- `config/seo.ts`: default SEO metadata.
- `config/plans.ts`: business plans and PayPal plan env-key mapping.

Do not centralize or expose secrets such as Supabase service role keys, PayPal client secrets, webhook secrets, tokens, cookies, or patient data.

## Environment Variables

Use `.env.example` as the template. It separates public browser-safe values from private server-only values.

Only `.env.example` should be committed. Local or deployed files such as `.env`, `.env.local`, `.env.production`, and `.env.staging` must remain ignored by Git.

## Public Versioning

The public version label is built from:

- `NEXT_PUBLIC_APP_VERSION`, defaulting to `0.1.0-beta`.
- `NEXT_PUBLIC_APP_ENV`, defaulting to `development`.

The UI displays a compact label:

```text
CliniControl · v0.1.0-beta · staging
```

This label is safe for public UI because it does not include commit hashes, secrets, deployment IDs, or infrastructure details.

## Logger

Use `logger.info()`, `logger.warn()`, and `logger.error()` from `lib/logger.ts`.

The logger accepts a message and optional technical context:

```ts
logger.warn("Health check degraded", {
  component: "configuration",
  status: "degraded"
});
```

The logger sanitizes common sensitive keys before writing output, including:

- `password`
- `token`
- `secret`
- `authorization`
- `cookie`
- `medicalNote`
- `diagnosis`
- `patientName`
- `email`
- `phone`

Never log patient names, patient emails, phone numbers, medical notes, diagnoses, consents, tokens, cookies, authorization headers, service role keys, PayPal secrets, webhook secrets, or full request bodies.

## Health Check

`GET /api/health` is unauthenticated for monitoring, but it returns minimal information only.

Healthy response:

```json
{
  "status": "ok",
  "service": "CliniControl",
  "environment": "staging",
  "version": "0.1.0-beta",
  "timestamp": "ISO-8601"
}
```

Degraded response:

```json
{
  "status": "degraded",
  "service": "CliniControl",
  "environment": "staging",
  "version": "0.1.0-beta",
  "timestamp": "ISO-8601",
  "components": {
    "application": "ok",
    "configuration": "degraded"
  }
}
```

The endpoint:

- Sends `Cache-Control: no-store`.
- Does not return secrets, private URLs, user data, clinic data, PayPal client IDs, or PayPal plan IDs.
- Does not query clinical data.
- Does not use `SUPABASE_SERVICE_ROLE_KEY`.
- Does not validate PayPal with a real transaction.

Local test:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Future staging test:

```powershell
Invoke-RestMethod https://staging.clinicontrol.mx/api/health
```

## Before Sentry or PostHog

Before integrating Sentry, PostHog, or any monitoring/analytics platform:

- Confirm that no clinical notes, diagnoses, consent content, patient names, emails, or phone numbers are captured.
- Disable automatic request-body capture.
- Scrub cookies, authorization headers, tokens, and secrets.
- Review session replay settings before enabling them.
- Confirm staging and production sampling rules.
- Confirm user identifiers are non-sensitive and avoid patient identifiers.

Analytics and monitoring must never capture sensitive clinical information.
