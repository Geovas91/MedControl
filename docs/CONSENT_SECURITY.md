# Consent signing security

Public pages never query clinical tables directly through an anon select policy.
They call two narrowly scoped `SECURITY DEFINER` RPCs with a fixed `search_path`:
one validates a token hash and returns only the public document fields; the other
performs the signing transaction. `service_role` is not used for this flow.

RPC parameters use an explicit `p_` prefix (`p_token_hash`, `p_signer_name`, and
related signature arguments), while SQL queries use `c` and `cl` aliases. This
prevents a parameter from being confused with a similarly named column. The signing
RPC performs only inexpensive input checks first, then finds and locks `c` by its
token hash. It rejects missing, used, revoked, or expired records before decoding
or parsing the supplied PNG. Expiration uses the existing `consent_status.expired`
value and clears the stored hash before returning the same generic public result.

The RPC grants are limited to `anon` and `authenticated`; broad public execution is
revoked. Inputs do not include clinic ID, patient ID, consent ID, URL, or raw
database rows. The server hashes the URL token before the first database call.

Application logs contain only component, operation, status, and safe technical
code. They must not contain token, hash, URL, document content, signature data,
patient or signer identity, or identifiers. Signature data must be a real PNG
data URL: decoded bytes must have the PNG magic signature and IHDR header, be at
most 250 KB, and have a nonzero width up to 1600 and height up to 800. SVG,
arbitrary base64, and uploaded files are unsupported.

The inspected `consent_signatures` schema does not have `clinic_id`, `created_by`,
`signature_type`, or `signer_role`. The RPC derives its required `consent_id` and
`patient_id` from the locked consent and receives the required signer name. Its
remaining required fields have safe defaults: both acceptance flags default to
false but are explicitly set true after validation, while `signed_at` and
`created_at` default to `now()`.

The route adds `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`,
and `X-Robots-Tag: noindex, nofollow, noarchive`. This does not supply legal
identity verification, OTP, biometric capture, or a certificate. Product and legal
review remain required before production use.
