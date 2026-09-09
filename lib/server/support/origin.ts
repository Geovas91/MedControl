import "server-only";

import { headers } from "next/headers";
import { normalizePublicOrigin } from "@/lib/auth/public-origin";
import { getAppBaseUrl } from "@/lib/supabase/config";

export async function hasValidSupportMutationOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) return false;
  try {
    return normalizePublicOrigin(origin) === getAppBaseUrl();
  } catch {
    return false;
  }
}
