import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const REVIEW_TOKEN_BYTES = 32;
export const REVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const REVIEW_INVITATION_TTL_DAYS = 14;

export function generateReviewToken() {
  return randomBytes(REVIEW_TOKEN_BYTES).toString("base64url");
}
export function isReviewToken(value: string) {
  return REVIEW_TOKEN_PATTERN.test(value);
}

export function hashReviewToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function reviewTokenMatchesHash(value: string, expectedHash: string) {
  if (!isReviewToken(value) || !/^[0-9a-f]{64}$/.test(expectedHash)) return false;
  const candidate = Buffer.from(hashReviewToken(value), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
