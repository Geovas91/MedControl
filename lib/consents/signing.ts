import "server-only";

import { createHash, randomBytes } from "crypto";

const TOKEN_BYTES = 32;
export const MAX_SIGNATURE_BYTES = 250 * 1024;
export const MAX_SIGNATURE_WIDTH = 1600;
export const MAX_SIGNATURE_HEIGHT = 800;
const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_OFFSET = 8;
const MIN_PNG_HEADER_BYTES = 24;
const MAX_SIGNATURE_DATA_URL_LENGTH = PNG_PREFIX.length + Math.ceil(MAX_SIGNATURE_BYTES / 3) * 4;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function createSigningToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSigningToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isValidSignaturePng(signature: string) {
  try {
    if (!signature.startsWith(PNG_PREFIX) || signature.length > MAX_SIGNATURE_DATA_URL_LENGTH) return false;
    const base64 = signature.slice(PNG_PREFIX.length);
    if (!base64 || base64.length % 4 !== 0 || !BASE64_PATTERN.test(base64)) return false;
    const bytes = Buffer.from(base64, "base64");
    if (bytes.toString("base64") !== base64) return false;
    if (!bytes.length || bytes.length > MAX_SIGNATURE_BYTES || bytes.length < MIN_PNG_HEADER_BYTES) return false;
    if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return false;
    if (bytes.readUInt32BE(IHDR_OFFSET) !== 13 || bytes.subarray(IHDR_OFFSET + 4, IHDR_OFFSET + 8).toString("ascii") !== "IHDR") return false;
    const width = bytes.readUInt32BE(IHDR_OFFSET + 8);
    const height = bytes.readUInt32BE(IHDR_OFFSET + 12);
    return width > 0 && width <= MAX_SIGNATURE_WIDTH && height > 0 && height <= MAX_SIGNATURE_HEIGHT;
  } catch {
    return false;
  }
}
