import { createHash, randomBytes } from "crypto";

const TOKEN_BYTES = 32;

export function createSigningToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSigningToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
