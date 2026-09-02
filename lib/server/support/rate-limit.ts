import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SupportContext } from "@/lib/support/types";
import type { SupportRateLimitOperation } from "@/lib/support/tickets";

type SupportRateLimitClient = {
  rpc(fn: "consume_support_rate_limit", args: { p_clinic_id: string; p_operation: SupportRateLimitOperation }): Promise<{ data: boolean | null; error: unknown }>;
};

export async function consumeSupportRateLimit(context: SupportContext, operation: SupportRateLimitOperation) {
  const client = await createClient() as unknown as SupportRateLimitClient;
  const result = await client.rpc("consume_support_rate_limit", { p_clinic_id: context.clinicId, p_operation: operation });
  return !result.error && result.data === true;
}
