import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const TOKEN_ENVELOPE_VERSION = "v1";

export function parseCalendarTokenEncryptionKey(value: string | null | undefined) {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  try {
    const key = Buffer.from(value, "base64");
    return key.length === 32 && key.toString("base64") === value ? key : null;
  } catch {
    return null;
  }
}

export function encryptCalendarRefreshToken(token: string, key: Buffer) {
  if (!token || key.length !== 32) throw new Error("Calendar token encryption is unavailable.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_ENVELOPE_VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptCalendarRefreshToken(envelope: string, key: Buffer) {
  if (key.length !== 32) throw new Error("Calendar token encryption is unavailable.");
  const [version, ivValue, ciphertextValue, tagValue, extra] = envelope.split(".");
  if (version !== TOKEN_ENVELOPE_VERSION || !ivValue || !ciphertextValue || !tagValue || extra) {
    throw new Error("Calendar token envelope is invalid.");
  }

  try {
    const iv = Buffer.from(ivValue, "base64url");
    const ciphertext = Buffer.from(ciphertextValue, "base64url");
    const tag = Buffer.from(tagValue, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("invalid");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Calendar token envelope is invalid.");
  }
}
