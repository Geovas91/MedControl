import { NextResponse } from "next/server";
import { executeAppointmentAutomationEndpoint, isAuthorizedAutomationCron } from "@/lib/appointment-automations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!isAuthorizedAutomationCron(provided, process.env.APPOINTMENT_AUTOMATION_CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  // Load service-role code only after authenticating the caller.
  const { runAppointmentAutomations } = await import("@/lib/server/appointment-automation-runner");
  const result = await executeAppointmentAutomationEndpoint(runAppointmentAutomations);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
