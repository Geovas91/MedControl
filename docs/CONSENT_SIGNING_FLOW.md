# Consent signing flow

## Existing schema and migration

The original schema supplied `consents.consent_text`, `status`, `expires_at`,
`signed_at`, `revoked_at`, legacy `signing_token`, and `consent_signatures`.
It did not provide hashed, one-time public links. Migration `0012` adds a token
hash, expiration, use and revocation timestamps, plus a template reference.

New links use 32 random bytes encoded as base64url. Only the SHA-256 hash is
stored. The previous plaintext `signing_token` becomes nullable for compatibility
with historical data but is not read or written by the new flow.

## Authenticated workflow

An authorized clinical role creates a pending consent and may generate, regenerate,
or revoke a seven-day signing link from its detail page. The raw URL is returned
once to that authorized browser and is never logged, persisted in the UI, sent by
email, or sent by WhatsApp. Regeneration replaces the hash; revocation clears it
and keeps the consent pending.

## Public workflow

`/consent/sign/[token]` is dynamic, no-store, no-referrer and no-index. It shows
only clinic name, consent type/version, consent snapshot, and expiration. It does
not reveal patient, appointment, note, payment, internal ID, metadata, or another
consent. Invalid, expired, revoked and already-used links all produce the same
generic unavailable state before document content is rendered.

The signer enters a name, confirms the two notices, and draws a bounded PNG using
mouse, touch, or stylus. The UI offers a visible clear action. This is an electronic
acceptance in CliniControl and is not represented as a certified electronic signature.

## Atomic completion

`sign_public_consent` locks the consent row by hash, rechecks pending state,
expiration and revocation, validates the PNG length and format, inserts the
signature, marks the consent signed, records `signed_at`, and marks the token used
in one transaction. A second concurrent request cannot create a second signature.

There is no new test runner in this repository. Manual testing after migration is
still required for a valid link, expiration, revocation, concurrent submission,
and touch drawing.
