import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSigningToken, hashSigningToken } from "../../lib/consents/signing-token.ts";

test("production signing token hashes with SHA-256 UTF-8 hexadecimal encoding", () => {
  const token = createSigningToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(hashSigningToken(token), hashSigningToken(Buffer.from(token, "utf8").toString("utf8")));
  assert.match(hashSigningToken(token), /^[a-f0-9]{64}$/);
});

test("different emitted tokens cannot resolve through the same hash", () => {
  const firstToken = createSigningToken();
  const secondToken = createSigningToken();
  assert.notEqual(firstToken, secondToken);
  assert.notEqual(hashSigningToken(firstToken), hashSigningToken(secondToken));
});

test("issuance and public lookup share the production hash helper and issuance verifies availability", () => {
  const clinicalService = readFileSync(new URL("../../lib/server/clinical-consents.ts", import.meta.url), "utf8");
  const publicService = readFileSync(new URL("../../lib/server/public-consent-signing.ts", import.meta.url), "utf8");
  const issueFunction = clinicalService.slice(clinicalService.indexOf("export async function createConsentSigningLink"), clinicalService.indexOf("export async function revokeConsentSigningLink"));

  assert.equal(issueFunction.match(/createSigningToken\(\)/g)?.length, 1);
  assert.match(issueFunction, /const tokenHash = hashSigningToken\(rawToken\)/);
  assert.match(issueFunction, /p_token_hash: tokenHash/);
  assert.match(issueFunction, /get_public_consent_for_signing", \{ p_token_hash: tokenHash \}/);
  assert.match(issueFunction, /buildConsentSigningUrl\(rawToken, getAppBaseUrl\(\)\)/);
  assert.match(publicService, /get_public_consent_for_signing", \{ p_token_hash: hashSigningToken\(token\) \}/);
});
