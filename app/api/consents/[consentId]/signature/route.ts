import { NextResponse } from "next/server";
import { canViewClinicalRecord } from "@/lib/clinical-record/permissions";
import { decodeSignaturePng } from "@/lib/consents/pdf-renderer";
import { getSignedConsentEvidenceForActiveTenant } from "@/lib/server/consent-documents";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ consentId: string }> }) {
  const { consentId } = await params;
  const context = await getActiveTenantContext();
  if (context.state === "unauthenticated") return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  if (context.state !== "ready" || !canViewClinicalRecord(context.tenant.membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createClient();
  const consent = await supabase.from("consents").select("patient_id").eq("id", consentId).eq("clinic_id", context.tenant.clinic.id).eq("status", "signed").maybeSingle();
  const consentData = consent.data as { patient_id: string } | null;
  if (consent.error || !consentData) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await getSignedConsentEvidenceForActiveTenant(consentData.patient_id, consentId);
  if (result.state !== "ready") return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    return new NextResponse(decodeSignaturePng(result.data.signature_data), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json({ error: "signature_unavailable" }, { status: 422 });
  }
}
