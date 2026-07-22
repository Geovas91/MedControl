import "server-only";

import { createHash, randomBytes } from "crypto";

const TOKEN_BYTES = 32;
const MAX_SIGNATURE_LENGTH = 350000;
const SIGNATURE_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export function createSigningToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSigningToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isValidSignaturePng(signature: string) {
  return signature.length >= 32 && signature.length <= MAX_SIGNATURE_LENGTH && SIGNATURE_PATTERN.test(signature);
}
