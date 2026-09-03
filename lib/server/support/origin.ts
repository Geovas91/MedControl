import "server-only";

import { headers } from "next/headers";

export async function hasValidSupportMutationOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host && (originUrl.protocol === "https:" || (originUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(originUrl.hostname)));
  } catch {
    return false;
  }
}
