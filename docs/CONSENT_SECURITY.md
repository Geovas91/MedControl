# Consent signing security

Public pages never query clinical tables directly through an anon select policy.
They call two narrowly scoped `SECURITY DEFINER` RPCs with a fixed `search_path`:
one validates a token hash and returns only the public document fields; the other
performs the signing transaction. `service_role` is not used for this flow.

The RPC grants are limited to `anon` and `authenticated`; broad public execution is
revoked. Inputs do not include clinic ID, patient ID, consent ID, URL, or raw
database rows. The server hashes the URL token before the first database call.

Application logs contain only component, operation, status, and safe technical
code. They must not contain token, hash, URL, document content, signature data,
patient or signer identity, or identifiers. Signature PNG data is limited to a
data-URL PNG under 350,000 characters; uploads and SVG are unsupported.

The route adds `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`,
and `X-Robots-Tag: noindex, nofollow, noarchive`. This does not supply legal
identity verification, OTP, biometric capture, or a certificate. Product and legal
review remain required before production use.
