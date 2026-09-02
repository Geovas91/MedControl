import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SafeDiagnosticResult, SupportContext } from "@/lib/support/types";

type SupportAuditClient = {
  rpc(fn: "record_support_diagnostic_audit_for_current_user", args: { p_clinic_id: string; p_diagnostic_id: string; p_diagnostic_code: string }): Promise<{ data: boolean | null; error: unknown }>;
};

export async function recordSupportDiagnosticAudit(context: SupportContext, diagnostic: SafeDiagnosticResult) {
  const client = await createClient() as unknown as SupportAuditClient;
  const result = await client.rpc("record_support_diagnostic_audit_for_current_user", {
    p_clinic_id: context.clinicId,
    p_diagnostic_id: diagnostic.diagnosticId,
    p_diagnostic_code: diagnostic.code
  });
  return !result.error && result.data === true;
}
