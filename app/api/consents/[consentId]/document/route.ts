import { NextResponse } from "next/server";
import { getConsentDocumentDownloadForActiveTenant } from "@/lib/server/consent-documents";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ consentId: string }> }) {
  const { consentId } = await params;
  const result = await getConsentDocumentDownloadForActiveTenant(consentId);
  if (result.state === "unauthenticated") return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  if (result.state === "forbidden" || result.state === "no_active_membership") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (result.state === "invalid_id" || result.state === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result.state === "not_ready") return NextResponse.json({ error: "document_not_ready" }, { status: 409 });
  if (result.state === "integrity_error") return NextResponse.json({ error: "document_integrity_failed" }, { status: 422 });
  if (result.state !== "ready") return NextResponse.json({ error: "document_unavailable" }, { status: 500 });
  return new NextResponse(result.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="consentimiento-${result.safeId}.pdf"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
