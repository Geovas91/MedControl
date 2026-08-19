import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import QRCode from "qrcode";
import { createConsentSigningQr, getConsentSigningQrAvailability } from "../../lib/consents/signing-qr.ts";
import { buildConsentSigningUrl } from "../../lib/consents/signing-url.ts";

const token = "real_test_token_abcdefghijklmnopqrstuvwxyz_1234567890";
const signingUrl = `https://staging.clinicontrol.mx/consent/sign/${token}`;

function decodeCreatedQrPayload(value: string) {
  return QRCode.create(value).segments.map((segment) => typeof segment.data === "string" ? segment.data : Buffer.from(segment.data).toString("utf8")).join("");
}

test("QR is disabled when no signing link exists", () => {
  assert.deepEqual(getConsentSigningQrAvailability({ status: "pending", hasActiveLink: false }), { available: false, reason: "missing_link" });
});

test("QR is active only with the real active signing URL", () => {
  assert.deepEqual(getConsentSigningQrAvailability({ status: "pending", hasActiveLink: true, signingUrl }), { available: true, signingUrl });
  assert.deepEqual(getConsentSigningQrAvailability({ status: "pending", hasActiveLink: true }), { available: false, reason: "missing_url" });
});

test("QR encodes exactly the signing URL and no IDs or PII", async () => {
  const qr = await createConsentSigningQr(signingUrl);
  assert.equal(qr.payload, signingUrl);
  assert.equal(decodeCreatedQrPayload(qr.payload), signingUrl);
  assert.match(qr.svg, /^<svg/);
  assert.match(qr.svg, /width="320"/);

  for (const forbidden of ["clinic_id", "patient_id", "consent_id", "diagnóstico", "Alicia Ramirez", "consent_text", "token_hash"]) {
    assert.equal(qr.payload.includes(forbidden), false);
    assert.equal(qr.svg.includes(forbidden), false);
  }
});

test("QR rejects query parameters, fragments and non-signing paths", async () => {
  await assert.rejects(createConsentSigningQr(`${signingUrl}?patient_id=secret`));
  await assert.rejects(createConsentSigningQr(`${signingUrl}#diagnóstico`));
  await assert.rejects(createConsentSigningQr("https://staging.clinicontrol.mx/dashboard/patients/secret"));
});

test("revoked, signed and cancelled states disable QR", () => {
  assert.deepEqual(getConsentSigningQrAvailability({ status: "pending", hasActiveLink: false, signingUrl }), { available: false, reason: "missing_link" });
  assert.deepEqual(getConsentSigningQrAvailability({ status: "signed", hasActiveLink: true, signingUrl }), { available: false, reason: "signed" });
  assert.deepEqual(getConsentSigningQrAvailability({ status: "cancelled", hasActiveLink: true, signingUrl }), { available: false, reason: "cancelled" });
});

test("generated signing URL reaches the existing public consent route", () => {
  const generatedUrl = buildConsentSigningUrl(token, "https://staging.clinicontrol.mx");
  assert.equal(generatedUrl, signingUrl);
  assert.equal(new URL(generatedUrl).pathname, `/consent/sign/${token}`);

  const publicPage = readFileSync(new URL("../../app/consent/sign/[token]/page.tsx", import.meta.url), "utf8");
  assert.match(publicPage, /getPublicConsentByToken\(token\)/);
  assert.match(publicPage, /<PublicConsentSigningPage token=\{token\} consent=\{consent\}/);
});

test("public signing route keeps no-store and no-referrer headers", () => {
  const nextConfig = readFileSync(new URL("../../next.config.mjs", import.meta.url), "utf8");
  assert.match(nextConfig, /source: "\/consent\/sign\/:path\*"[\s\S]+?Cache-Control", value: "private, no-store, max-age=0"/);
  assert.match(nextConfig, /source: "\/consent\/sign\/:path\*"[\s\S]+?Referrer-Policy", value: "no-referrer"/);
});

test("legacy mock creation route redirects to consent patient selection", () => {
  const legacyPage = readFileSync(new URL("../../app/dashboard/consents/new/page.tsx", import.meta.url), "utf8");
  assert.match(legacyPage, /redirect\("\/dashboard\/consents"\)/);
  assert.doesNotMatch(legacyPage, /demo-token|Mock consent link and QR generation/);
});
