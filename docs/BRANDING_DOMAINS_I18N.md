# CliniControl Branding, Domains and i18n

## Branding

- Product name: `CliniControl`.
- Central brand configuration: `config/brand.ts`.
- The GitHub repository remains `Geovas91/MedControl` until it is explicitly renamed in GitHub.
- Stable database identifiers, migration filenames and existing lowercase technical identifiers may retain `medcontrol` to avoid compatibility breaks.

## Domains

Domain configuration lives in `config/domains.ts`.

```bash
APP_ENV=staging
APP_BASE_URL=https://staging.example.com
APP_STAGING_URL=https://staging.example.com
APP_PRODUCTION_URL=https://app.example.com
```

Rules:

- `APP_BASE_URL` is the canonical URL for the current deployment and has priority.
- `APP_ENV=staging` allows `APP_STAGING_URL` as fallback.
- `APP_ENV=production` allows `APP_PRODUCTION_URL` as fallback.
- Local development falls back to `http://localhost:3000`.
- Do not include paths such as `/rest/v1/` in app or Supabase base URLs.
- Configure Supabase Auth callbacks and PayPal webhooks with the same canonical HTTPS domain.

## i18n Base

The base locale configuration lives in `config/i18n.ts`.

- Supported locales: `es`, `en`.
- Default locale: `es`.
- Staging remains Spanish-first.
- Root metadata and the `<html lang>` attribute use the configured default locale.
- This phase does not add locale-prefixed routes or a language selector.

Configure staging with:

```bash
NEXT_PUBLIC_DEFAULT_LOCALE=es
```

English dictionaries are prepared as a base for future translation work. New shared copy should be added to the typed dictionaries before enabling an English UI.
