import { NextResponse } from "next/server";
import { getAppointmentAutomationLiveStatusForActiveTenant } from "@/lib/server/appointment-automation-live-status";

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  const result = await getAppointmentAutomationLiveStatusForActiveTenant();
  if (result.state === "ready") return NextResponse.json(result.data, { headers });
  if (result.state === "unauthenticated") return NextResponse.json({ error: "authentication_required" }, { status: 401, headers });
  if (result.state === "no_active_membership" || result.state === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }
  return NextResponse.json({ error: "status_unavailable" }, { status: 500, headers });
}
